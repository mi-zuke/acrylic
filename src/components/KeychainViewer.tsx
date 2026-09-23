import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GeneratedCutPath } from '../utils/contourTracer';
import { EnvironmentPreset, loadEnvironmentTextureAsync } from '../utils/environmentGenerator';
import { LightingDebugParams, DEFAULT_LIGHTING_PARAMS } from '../types/lighting';

export interface ViewerProps {
  cutPath: GeneratedCutPath | null;
  imageSrc: string;
  acrylicThickness: number; // 2mm, 3mm, 5mm
  acrylicColor?: string;    // クリア等
  hardwareType: 'clasp' | 'ballchain' | 'none'; // 金具
  hardwareColor: 'silver' | 'gold' | 'black';
  whiteBacking: boolean;    // 白押さえの有無
  autoRotate: boolean;      // 自動回転
  lightPreset?: 'studio' | 'outdoor' | 'neon';
  backgroundColor?: string; // 背景色 (デフォルト: #bababa)
  envPreset?: EnvironmentPreset; // 天球環境プリセット (studio, indoor, outdoor, sunset)
  showSkyboxBg?: boolean;   // 天球を背景に表示するかどうか (デフォルト: false)
  illustrationEnvInfluence?: number; // イラストへの環境光の影響度 (0〜100, デフォルト: 30)
  lightingParams?: LightingDebugParams; // デバッグ用ライティング・マテリアル調整値
  showControlPoints?: boolean; // デバッグ用：アクリル外枠の制御点・ハンドル表示
  isMobilePanelOpen?: boolean; // スマホでメニューバーが開いているかどうか
}

export interface ViewerHandle {
  captureScreenshot: () => string;
  resetCamera: () => void;
}

// 環境天球ごとの環境光設定
const ENV_PRESET_LIGHTS: Record<EnvironmentPreset, {
  ambientColor: number;
  dirColor: number;
  dirIntensity: number;
}> = {
  studio: { ambientColor: 0xffffff, dirColor: 0xffffff, dirIntensity: 1.3 },
  bridge: { ambientColor: 0xf1f5f9, dirColor: 0xf8fafc, dirIntensity: 1.4 },
  sunset: { ambientColor: 0xfb923c, dirColor: 0xfb923c, dirIntensity: 1.5 },
  outdoor: { ambientColor: 0xfffbeb, dirColor: 0xfffbeb, dirIntensity: 1.5 },
};

export const KeychainViewer = forwardRef<ViewerHandle, ViewerProps>(({
  cutPath,
  imageSrc,
  acrylicThickness,
  acrylicColor = 'clear',
  hardwareType,
  hardwareColor,
  whiteBacking,
  autoRotate,
  lightPreset,
  backgroundColor = '#bababa',
  envPreset = 'outdoor',
  showSkyboxBg = true,
  illustrationEnvInfluence = 30,
  lightingParams = DEFAULT_LIGHTING_PARAMS,
  showControlPoints = false,
  isMobilePanelOpen = true,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // アクキー全体のグループ（アクリル、プリント、金具を内包）
  const keychainGroupRef = useRef<THREE.Group | null>(null);
  const acrylicMeshRef = useRef<THREE.Mesh | null>(null);
  const printGroupRef = useRef<THREE.Group | null>(null);
  const hardwareGroupRef = useRef<THREE.Group | null>(null);
  const pmremGeneratorRef = useRef<THREE.PMREMGenerator | null>(null);
  const envCacheRef = useRef<Map<string, { texture: THREE.Texture; envMap: THREE.Texture }>>(new Map());

  // 回転角度の管理 (radians)
  // 仰角(elevation)はアクキーと背景で常に連動・共通
  const elevationRef = useRef(0);
  const keychainYawRef = useRef(0); // アクキー自転角 (左右)
  const bgYawRef = useRef(0); // 背景回転角 (左右)

  // ライト初期位置（背景回転と連動させる用）
  const dirLight1InitPos = useRef(new THREE.Vector3(5, 10, 7));
  const dirLight2InitPos = useRef(new THREE.Vector3(-6, -4, 5));
  const rimLightInitPos = useRef(new THREE.Vector3(0, 8, -6));

  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const dirLight1Ref = useRef<THREE.DirectionalLight | null>(null);
  const dirLight2Ref = useRef<THREE.DirectionalLight | null>(null);
  const rimLightRef = useRef<THREE.DirectionalLight | null>(null);
  const colorMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const whiteMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);

  // ドラッグ操作の状態管理
  const isDraggingRef = useRef(false);
  const dragModeRef = useRef<'keychain' | 'background' | null>(null);
  const lastPointerPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // マルチタッチ（2本指ピンチズーム）用のポインター座標追跡
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const prevPinchDistRef = useRef<number | null>(null);

  // 画像読み込み初期（正面時）に一度だけ算出・保持する不変の重心3D座標と基準半径
  const initialCenter3DRef = useRef<THREE.Vector3 | null>(null);
  const initialWorldRadiusRef = useRef<number>(4.0);

  // 自動回転フラグのRef管理（Three.jsシーンの再初期化を防ぐ）
  const autoRotateRef = useRef(autoRotate);
  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  // ホバー円の情報 (重心投影座標, 半径, 表示フラグ)
  const [circleInfo, setCircleInfo] = useState<{
    x: number;
    y: number;
    radius: number;
    isHovered: boolean;
    isDragging: boolean;
    dragMode: 'keychain' | 'background' | null;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(false);

  // 回転の適用（アクキーと背景の双方に仰角を適用し、左右は各Yawを適用）
  const applyRotations = () => {
    const elev = elevationRef.current;
    const kYaw = keychainYawRef.current;
    const bYaw = bgYawRef.current;

    // 1. アクキー本体の回転（仰角は常に 0 で固定、左右自転 kYaw のみ適用）
    if (keychainGroupRef.current) {
      keychainGroupRef.current.rotation.set(0, kYaw, 0, 'YXZ');
    }

    // 2. 背景・環境光の回転（仰角 + 背景Yaw）
    if (sceneRef.current) {
      const bgEuler = new THREE.Euler(elev, bYaw, 0, 'YXZ');
      sceneRef.current.backgroundRotation.copy(bgEuler);
      sceneRef.current.environmentRotation.copy(bgEuler);

      // ディレクショナルライトも背景の回転に追従
      if (dirLight1Ref.current) {
        dirLight1Ref.current.position.copy(dirLight1InitPos.current).applyEuler(bgEuler);
      }
      if (dirLight2Ref.current) {
        dirLight2Ref.current.position.copy(dirLight2InitPos.current).applyEuler(bgEuler);
      }
      if (rimLightRef.current) {
        rimLightRef.current.position.copy(rimLightInitPos.current).applyEuler(bgEuler);
      }
    }
  };

  // 即時再描画関数
  const renderScene = () => {
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  };

  // 重心とホバー判定半径の算出（初期正面で算出した不変の重心を使用）
  const getCircleMetrics = () => {
    if (!initialCenter3DRef.current || !cameraRef.current || !canvasRef.current) return null;
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return null;

    const center3D = initialCenter3DRef.current;
    const p = center3D.clone().project(camera);
    if (p.z > 1) return null; // カメラ背面

    const sx = ((p.x + 1) / 2) * width;
    const sy = ((-p.y + 1) / 2) * height;

    const worldRadius = initialWorldRadiusRef.current;
    const edge3D = center3D.clone().add(new THREE.Vector3(worldRadius, 0, 0));
    const edgeP = edge3D.project(camera);
    const edgeSx = ((edgeP.x + 1) / 2) * width;
    const basePixelRadius = Math.abs(edgeSx - sx);

    // アクキー選択円の半径（前回の0.5倍に対し5/4倍 = 0.625倍）
    const radius = Math.max(140, basePixelRadius * 1.25) * 0.625;

    return { x: sx, y: sy, radius };
  };

  // 端末に応じたカメラ設定（スマホ時はアクキーデフォルトサイズ2/3, 背景拡大率1/2）
  const getCameraProfile = () => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
    if (isMobile) {
      // 背景拡大率1/2: 垂直視野角tanを2倍に拡張 (FOV 38° -> 約69.1°)
      const baseFovRad = (38 * Math.PI) / 180;
      const mobileFov = 2 * Math.atan(2 * Math.tan(baseFovRad / 2)) * (180 / Math.PI);
      // アクキーサイズ2/3: 見かけの大きさが2/3倍となるカメラ距離 Z = 14 * 0.75 = 10.5
      return { fov: mobileFov, distance: 10.5, isMobile: true };
    }
    return { fov: 38, distance: 14, isMobile: false };
  };

  // スマホでメニューバーが開いている時、アクキーと背景を画面25%上にシフトする関数
  const updateCameraViewOffset = () => {
    if (!cameraRef.current || !canvasRef.current) return;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
    const w = canvasRef.current.clientWidth;
    const h = canvasRef.current.clientHeight;

    if (isMobile && isMobilePanelOpen) {
      // 画面25%上に表示（カメラ視点を下方向に25%オフセットし、被写体を画面上部50vhの中央へシフト）
      cameraRef.current.setViewOffset(w, h, 0, Math.round(h * 0.25), w, h);
    } else {
      cameraRef.current.clearViewOffset();
    }
    cameraRef.current.updateProjectionMatrix();
  };

  // ズーム（カメラ距離）の適用関数（factor > 1 で縮小・遠ざかる, factor < 1 で拡大・近づく）
  const applyZoom = (factor: number) => {
    if (!cameraRef.current) return;
    const camera = cameraRef.current;
    const profile = getCameraProfile();
    const minZ = profile.isMobile ? 3.0 : 4.5;
    const maxZ = 28.0;
    const newZ = Math.max(minZ, Math.min(maxZ, camera.position.z * factor));
    camera.position.z = newZ;
    updateCameraViewOffset();

    if (controlsRef.current) {
      controlsRef.current.update();
    }
    renderScene();

    const m = getCircleMetrics();
    if (m) {
      setCircleInfo(prev => prev ? { ...prev, x: m.x, y: m.y, radius: m.radius } : null);
    }
  };

  // 外部からの関数呼び出し（スクショ撮影・カメラリセット）
  useImperativeHandle(ref, () => ({
    captureScreenshot: () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !canvasRef.current) return '';
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const canvas = canvasRef.current;

      // 現在の表示サイズとピクセル比を記録
      const origWidth = canvas.clientWidth;
      const origHeight = canvas.clientHeight;
      const origPixelRatio = renderer.getPixelRatio();

      // 現在の描画バッファ解像度の縦横2倍サイズを算出
      const targetW = canvas.width * 2;
      const targetH = canvas.height * 2;

      // 高精細レンダリング用に一時的にサイズを変更 (updateStyle=falseでレイアウト崩れを防止)
      renderer.setPixelRatio(1);
      renderer.setSize(targetW, targetH, false);
      renderer.render(scene, camera);

      // 高精細 PNG データの取得
      const dataUrl = renderer.domElement.toDataURL('image/png');

      // 元のサイズとピクセル比に戻して再描画
      renderer.setPixelRatio(origPixelRatio);
      renderer.setSize(origWidth, origHeight, false);
      renderer.render(scene, camera);

      return dataUrl;
    },
    resetCamera: () => {
      // 仰角、アクキー自転、背景回転をすべてリセット
      elevationRef.current = 0;
      keychainYawRef.current = 0;
      bgYawRef.current = 0;
      applyRotations();

      if (controlsRef.current && cameraRef.current) {
        const profile = getCameraProfile();
        cameraRef.current.fov = profile.fov;
        cameraRef.current.position.set(0, 0, profile.distance);
        updateCameraViewOffset();
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }
      renderScene();

      const metrics = getCircleMetrics();
      if (metrics) {
        setCircleInfo(prev => prev ? { ...prev, x: metrics.x, y: metrics.y, radius: metrics.radius } : null);
      }
    }
  }));

  // 1. Three.js 初期化 (マウント時)
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 600;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const profile = getCameraProfile();
    const camera = new THREE.PerspectiveCamera(profile.fov, width / height, 0.1, 100);
    camera.position.set(0, 0, profile.distance);
    cameraRef.current = camera;
    updateCameraViewOffset();

    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(backgroundColor, 1.0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    (window as any).__THREE_DEBUG__ = { scene, camera, renderer };

    // シーン背景色
    scene.background = new THREE.Color(backgroundColor);

    // OrbitControls: 回転は自前制御にし、ホイールによるズームのみ有効化
    const controls = new OrbitControls(camera, canvas);
    controls.enableRotate = false;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.enableDamping = false;
    controls.maxDistance = 30;
    controls.minDistance = 5;
    controls.addEventListener('change', () => {
      renderScene();
      const m = getCircleMetrics();
      if (m) {
        setCircleInfo(prev => prev ? { ...prev, x: m.x, y: m.y, radius: m.radius } : null);
      }
    });
    controlsRef.current = controls;

    // PMREMGenerator の初期化
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    pmremGeneratorRef.current = pmremGenerator;

    // ライティング
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight1.position.copy(dirLight1InitPos.current);
    scene.add(dirLight1);
    dirLight1Ref.current = dirLight1;

    const dirLight2 = new THREE.DirectionalLight(0x93c5fd, 0.9);
    dirLight2.position.copy(dirLight2InitPos.current);
    scene.add(dirLight2);
    dirLight2Ref.current = dirLight2;

    const rimLight = new THREE.DirectionalLight(0xfff7ed, 1.4);
    rimLight.position.copy(rimLightInitPos.current);
    scene.add(rimLight);
    rimLightRef.current = rimLight;

    // 初回レンダリング
    renderScene();

    // アニメーションループ
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      // 360° 自動回転: アクキーを自転 (速度2/3に調整: 0.015 -> 0.01)
      if (autoRotateRef.current && !isDraggingRef.current) {
        keychainYawRef.current += 0.01;
        applyRotations();
      }
      renderScene();
    };
    animate();

    // リサイズハンドラ
    const handleResize = () => {
      if (!canvasRef.current || !renderer || !camera) return;
      const w = canvasRef.current.clientWidth;
      const h = canvasRef.current.clientHeight;
      const profile = getCameraProfile();
      camera.fov = profile.fov;
      camera.aspect = w / h;
      updateCameraViewOffset();
      renderer.setSize(w, h, false);
      renderScene();
      const m = getCircleMetrics();
      if (m) {
        setCircleInfo(prev => prev ? { ...prev, x: m.x, y: m.y, radius: m.radius } : null);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      envCacheRef.current.forEach(item => {
        item.texture.dispose();
        item.envMap.dispose();
      });
      envCacheRef.current.clear();
      pmremGenerator.dispose();
      renderer.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      pmremGeneratorRef.current = null;
      ambientLightRef.current = null;
      dirLight1Ref.current = null;
      dirLight2Ref.current = null;
      rimLightRef.current = null;
    };
  }, []);

  // スマホでメニューバー開閉時にカメラの画面25%上シフトを連動更新
  useEffect(() => {
    updateCameraViewOffset();
    renderScene();
    const m = getCircleMetrics();
    if (m) {
      setCircleInfo(prev => prev ? { ...prev, x: m.x, y: m.y, radius: m.radius } : null);
    }
  }, [isMobilePanelOpen]);

  // 3. 環境天球（スタジオ/運河/朝焼け/夕景/青空/街並み/星空/室内）＆背景の同期
  useEffect(() => {
    if (!sceneRef.current || !rendererRef.current || !pmremGeneratorRef.current) return;
    const scene = sceneRef.current;
    const pmrem = pmremGeneratorRef.current;
    let isMounted = true;

    const applyEnv = (texture: THREE.Texture, envMap: THREE.Texture) => {
      if (!sceneRef.current) return;
      // 1. アクリルや金具の映り込み（環境光IBL）を適用
      scene.environment = envMap;

      // 2. 背景（天球パノラマ または 単色背景）を適用
      if (showSkyboxBg) {
        scene.background = texture;
      } else {
        const color = new THREE.Color(backgroundColor);
        scene.background = color;
        rendererRef.current?.setClearColor(color, 1.0);
      }

      // 3. 環境に応じたディレクショナルライトの調整
      scene.children.forEach(c => {
        if (c instanceof THREE.DirectionalLight) {
          if (envPreset === 'sunset') {
            c.color.setHex(0xfb923c);
            c.intensity = 1.4;
          } else if (envPreset === 'outdoor') {
            c.color.setHex(0xfffbeb);
            c.intensity = 1.5;
          } else if (envPreset === 'bridge') {
            c.color.setHex(0xf8fafc);
            c.intensity = 1.4;
          } else {
            // studio
            c.color.setHex(0xffffff);
            c.intensity = 1.3;
          }
        }
      });

      applyRotations();

      if (rendererRef.current && cameraRef.current) {
        rendererRef.current.render(scene, cameraRef.current);
      }
    };

    // キャッシュから取得または非同期ロード
    const cachedItem = envCacheRef.current.get(envPreset);
    if (cachedItem) {
      applyEnv(cachedItem.texture, cachedItem.envMap);
    } else {
      loadEnvironmentTextureAsync(envPreset, (texture) => {
        if (!isMounted || !pmremGeneratorRef.current || !sceneRef.current) return;
        const renderTarget = pmrem.fromEquirectangular(texture);
        const item = { texture, envMap: renderTarget.texture };
        envCacheRef.current.set(envPreset, item);
        applyEnv(item.texture, item.envMap);
      });
    }

    return () => {
      isMounted = false;
    };
  }, [envPreset, showSkyboxBg, backgroundColor]);

  // 3.1 環境光およびイラストへの影響度同期（スライダー操作時に60fpsで即時反映）
  useEffect(() => {
    const config = ENV_PRESET_LIGHTS[envPreset] || ENV_PRESET_LIGHTS.studio;
    const influenceRatio = Math.max(0, Math.min(100, illustrationEnvInfluence)) / 100; // 0.0 〜 1.0

    // アンビエントライトの色と強度
    // 影響度0のときは完全な白色(0xffffff)で0.95、影響度100のときは環境天球の色(config.ambientColor)
    if (ambientLightRef.current) {
      const neutralColor = new THREE.Color(0xffffff);
      const targetColor = new THREE.Color(config.ambientColor);
      const blendedColor = neutralColor.clone().lerp(targetColor, influenceRatio);
      ambientLightRef.current.color.copy(blendedColor);

      const targetIntensity = 0.95;
      ambientLightRef.current.intensity = 0.9 + (targetIntensity - 0.9) * influenceRatio;
    }

    // ディレクショナルライトの色と強度
    if (dirLight1Ref.current) {
      const neutralDirColor = new THREE.Color(0xffffff);
      const targetDirColor = new THREE.Color(config.dirColor);
      const blendedDirColor = neutralDirColor.clone().lerp(targetDirColor, influenceRatio);
      dirLight1Ref.current.color.copy(blendedDirColor);
      dirLight1Ref.current.intensity = 1.3 + (config.dirIntensity - 1.3) * influenceRatio;
    }

    // イラスト面マテリアルの envMapIntensity（0%で0.05、100%で0.50）
    if (colorMaterialRef.current) {
      colorMaterialRef.current.envMapIntensity = 0.05 + 0.45 * influenceRatio;
      colorMaterialRef.current.needsUpdate = true;
    }

    // 即座に再描画
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }, [illustrationEnvInfluence, envPreset]);

  // 3.2 デバッグ用ライティング・マテリアル調整の同期（60fps即時反映）
  useEffect(() => {
    if (!lightingParams) return;

    // 1. レンダラー露出
    if (rendererRef.current) {
      rendererRef.current.toneMappingExposure = lightingParams.exposure;
    }

    // 2. ライト強度
    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = lightingParams.ambientIntensity;
    }
    if (dirLight1Ref.current) {
      dirLight1Ref.current.intensity = lightingParams.mainLightIntensity;
    }
    if (dirLight2Ref.current) {
      dirLight2Ref.current.intensity = lightingParams.fillLightIntensity;
    }
    if (rimLightRef.current) {
      rimLightRef.current.intensity = lightingParams.rimLightIntensity;
    }

    // 3. イラスト面マテリアル
    if (colorMaterialRef.current) {
      colorMaterialRef.current.envMapIntensity = lightingParams.illustrationEnvMap;
      colorMaterialRef.current.roughness = 0.4; // 0.4 固定
      colorMaterialRef.current.metalness = lightingParams.illustrationMetalness;
      colorMaterialRef.current.needsUpdate = true;
    }

    // 4. 即座に再描画
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }, [lightingParams]);

  // 4. アクリル板メッシュ・プリント・金具の構築
  useEffect(() => {
    if (!sceneRef.current || !cutPath) return;

    setIsLoading(true);
    const scene = sceneRef.current;

    // 既存オブジェクトのクリーンアップ
    if (acrylicMeshRef.current) {
      acrylicMeshRef.current.geometry.dispose();
      (acrylicMeshRef.current.material as THREE.Material).dispose();
      acrylicMeshRef.current = null;
    }
    if (printGroupRef.current) {
      printGroupRef.current = null;
    }
    if (colorMaterialRef.current) {
      colorMaterialRef.current.dispose();
      colorMaterialRef.current = null;
    }
    if (whiteMaterialRef.current) {
      whiteMaterialRef.current.dispose();
      whiteMaterialRef.current = null;
    }
    if (hardwareGroupRef.current) {
      hardwareGroupRef.current = null;
    }
    if (keychainGroupRef.current) {
      scene.remove(keychainGroupRef.current);
      keychainGroupRef.current = null;
    }

    // アクキー全体のグループ（回転軸）
    const keychainGroup = new THREE.Group();
    keychainGroupRef.current = keychainGroup;

    // アクリル本体の中心を画面中央(0,0,0)にセンタリングするためのオフセットグループ
    const keychainContent = new THREE.Group();
    keychainGroup.add(keychainContent);

    // 4.1 アクリル板の押し出し成形 (ExtrudeGeometry)
    const worldThickness = (acrylicThickness / 3.0) * 0.35;
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: worldThickness,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.04,
      bevelThickness: 0.04,
      curveSegments: 36,
    };

    console.log('[DEBUG] Generating geometry. Outline points:', cutPath.outlinePoints.length, 'holes:', cutPath.shape.holes.length);
    const geometry = new THREE.ExtrudeGeometry(cutPath.shape, extrudeSettings);
    geometry.computeBoundingBox();

    // 金属パーツを除いたアクリル板本体の中心を画面中心(0,0,0)に配置
    let centerOffsetX = 0;
    let centerOffsetY = 0;
    if (geometry.boundingBox) {
      const initCenter = new THREE.Vector3();
      geometry.boundingBox.getCenter(initCenter);
      centerOffsetX = initCenter.x;
      centerOffsetY = initCenter.y;

      const sphere = new THREE.Sphere();
      geometry.boundingBox.getBoundingSphere(sphere);
      initialWorldRadiusRef.current = sphere.radius;
    }
    // オフセットを適用してアクリル板本体中心を (0, 0, 0) に合わせる
    keychainContent.position.set(-centerOffsetX, -centerOffsetY, 0);
    // 画面中心に来るため、重心ワールド座標は (0, 0, 0) で不変固定
    initialCenter3DRef.current = new THREE.Vector3(0, 0, 0);

    // アクリルカラー・マテリアル特性の決定
    let bodyColor = new THREE.Color(0xffffff);
    let transmissionVal = 1.0;
    let opacityVal = 1.0;
    let roughnessVal = 0.0;
    let metalnessVal = 0.0;
    let clearcoatVal = 1.0;
    let clearcoatRoughnessVal = 0.0;
    let iorVal = 1.491;
    let thicknessVal = 0.35;
    let iridescenceVal = 0.0;
    let isTransparent = false;
    let reflectivityVal = 0.5;

    if (acrylicColor === 'clear') {
      bodyColor = new THREE.Color(0xffffff);
      transmissionVal = 1.0;
      roughnessVal = 0.0;
      isTransparent = false;
      reflectivityVal = 0.5;
    } else if (acrylicColor === 'aurora') {
      bodyColor = new THREE.Color(0xa5f3fc);
      transmissionVal = 0.85;
      roughnessVal = 0.04;
      metalnessVal = 0.15;
      iridescenceVal = 0.8;
      isTransparent = false;
      reflectivityVal = 0.7;
    } else if (acrylicColor === 'smoke') {
      bodyColor = new THREE.Color(0x1e293b);
      transmissionVal = 0.82;
      roughnessVal = 0.02;
      isTransparent = false;
      reflectivityVal = 0.5;
    } else if (acrylicColor === 'pink') {
      bodyColor = new THREE.Color(0xf472b6);
      transmissionVal = 0.88;
      roughnessVal = 0.02;
      isTransparent = false;
      reflectivityVal = 0.5;
    } else if (acrylicColor === 'blue') {
      bodyColor = new THREE.Color(0x38bdf8);
      transmissionVal = 0.88;
      roughnessVal = 0.02;
      isTransparent = false;
      reflectivityVal = 0.5;
    } else if (acrylicColor === 'yellow') {
      bodyColor = new THREE.Color(0xfacc15);
      transmissionVal = 0.88;
      roughnessVal = 0.02;
      isTransparent = false;
      reflectivityVal = 0.5;
    }

    const acrylicMaterial = new THREE.MeshPhysicalMaterial({
      color: bodyColor,
      transparent: isTransparent,
      opacity: opacityVal,
      roughness: roughnessVal,
      metalness: metalnessVal,
      clearcoat: clearcoatVal,
      clearcoatRoughness: clearcoatRoughnessVal,
      reflectivity: reflectivityVal,
      transmission: transmissionVal,
      ior: iorVal,
      thickness: thicknessVal,
      specularIntensity: 1.0,
      iridescence: iridescenceVal,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const acrylicMesh = new THREE.Mesh(geometry, acrylicMaterial);
    acrylicMesh.position.z = -worldThickness / 2;
    acrylicMesh.renderOrder = 2;
    keychainContent.add(acrylicMesh);
    acrylicMeshRef.current = acrylicMesh;

    // 4.2 イラストプリント層（テクスチャ）のロードと作成
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(imageSrc, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      const printGroup = new THREE.Group();

      const imgW = texture.image.width;
      const imgH = texture.image.height;
      const longest = Math.max(imgW, imgH);
      const targetSize = 7.0;
      const scale = targetSize / longest;
      const planeW = imgW * scale;
      const planeH = imgH * scale;

      const planeGeo = new THREE.PlaneGeometry(planeW, planeH);

      const initInfluence = Math.max(0, Math.min(100, illustrationEnvInfluence)) / 100;
      const colorMat = new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        opacity: whiteBacking ? 1.0 : 0.65,
        alphaTest: whiteBacking ? 0.05 : 0.01,
        depthWrite: whiteBacking ? true : false,
        side: whiteBacking ? THREE.FrontSide : THREE.DoubleSide,
        roughness: 0.4,
        metalness: lightingParams ? lightingParams.illustrationMetalness : 0.0,
        envMapIntensity: lightingParams ? lightingParams.illustrationEnvMap : (0.05 + 0.45 * initInfluence),
        toneMapped: false,
      });
      colorMaterialRef.current = colorMat;

      const colorPlane = new THREE.Mesh(planeGeo, colorMat);
      colorPlane.position.z = 0.01;
      colorPlane.renderOrder = 1;
      printGroup.add(colorPlane);

      if (whiteBacking) {
        const whiteCanvas = document.createElement('canvas');
        whiteCanvas.width = imgW;
        whiteCanvas.height = imgH;
        const wCtx = whiteCanvas.getContext('2d')!;
        wCtx.drawImage(texture.image, 0, 0);
        wCtx.globalCompositeOperation = 'source-in';
        wCtx.fillStyle = '#f8fafc';
        wCtx.fillRect(0, 0, whiteCanvas.width, whiteCanvas.height);

        const whiteTexture = new THREE.CanvasTexture(whiteCanvas);
        whiteTexture.colorSpace = THREE.SRGBColorSpace;

        const whiteMat = new THREE.MeshStandardMaterial({
          map: whiteTexture,
          transparent: true,
          alphaTest: 0.05,
          side: THREE.BackSide,
          roughness: 0.6,
        });
        whiteMaterialRef.current = whiteMat;

        const whitePlane = new THREE.Mesh(planeGeo, whiteMat);
        whitePlane.position.z = -0.01;
        whitePlane.renderOrder = 1;
        printGroup.add(whitePlane);
      }

      keychainContent.add(printGroup);
      printGroupRef.current = printGroup;
      (window as any).__THREE_DEBUG__.printGroup = printGroup;
      setIsLoading(false);

      // 回転の適用と再描画
      applyRotations();
      renderScene();

      // 重心ホバー円の初期位置・半径を更新
      const m = getCircleMetrics();
      if (m) {
        setCircleInfo(prev => prev ? { ...prev, x: m.x, y: m.y, radius: m.radius } : {
          x: m.x,
          y: m.y,
          radius: m.radius,
          isHovered: false,
          isDragging: false,
          dragMode: null,
        });
      }
    });

    // 4.3 金具パーツ（ナスカン / ボールチェーン）の生成
    if (hardwareType !== 'none') {
      const hwGroup = createHardwareMesh(
        hardwareType,
        hardwareColor,
        cutPath.holeCenter,
        cutPath.holeRadius,
        worldThickness
      );
      hwGroup.renderOrder = 2;
      keychainContent.add(hwGroup);
      hardwareGroupRef.current = hwGroup;
    }

    // 4.4 デバッグ用：アクリル外枠の制御点・ハンドルの可視化
    if (showControlPoints && cutPath.bezierSegments && cutPath.bezierSegments.length > 0) {
      const debugGroup = new THREE.Group();
      debugGroup.renderOrder = 999;

      const zPos = worldThickness / 2 + 0.05; // アクリル前面より少し手前

      const anchorGeo = new THREE.SphereGeometry(0.045, 12, 12);
      const anchorMat = new THREE.MeshBasicMaterial({ color: 0xff2222, depthTest: false }); // 赤: アンカーポイント

      const cpGeo = new THREE.SphereGeometry(0.028, 10, 10);
      const cpMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, depthTest: false }); // シアン: ベジェ制御点

      const linePositions: number[] = [];
      const curvePositions: number[] = [];

      cutPath.bezierSegments.forEach((seg) => {
        // アンカーポイント (p0)
        const p0Mesh = new THREE.Mesh(anchorGeo, anchorMat);
        p0Mesh.position.set(seg.p0.x, seg.p0.y, zPos);
        debugGroup.add(p0Mesh);

        // 制御点 1 (cp1)
        const cp1Mesh = new THREE.Mesh(cpGeo, cpMat);
        cp1Mesh.position.set(seg.cp1.x, seg.cp1.y, zPos);
        debugGroup.add(cp1Mesh);

        // 制御点 2 (cp2)
        const cp2Mesh = new THREE.Mesh(cpGeo, cpMat);
        cp2Mesh.position.set(seg.cp2.x, seg.cp2.y, zPos);
        debugGroup.add(cp2Mesh);

        // ハンドル線 (p0 -> cp1, p1 -> cp2)
        linePositions.push(seg.p0.x, seg.p0.y, zPos, seg.cp1.x, seg.cp1.y, zPos);
        linePositions.push(seg.p1.x, seg.p1.y, zPos, seg.cp2.x, seg.cp2.y, zPos);

        // ベジェ曲線自体のサンプリング線 (輪郭ガイド)
        for (let t = 0; t <= 10; t++) {
          const ratio = t / 10;
          const u = 1 - ratio;
          const bx = u * u * u * seg.p0.x + 3 * u * u * ratio * seg.cp1.x + 3 * u * ratio * ratio * seg.cp2.x + ratio * ratio * ratio * seg.p1.x;
          const by = u * u * u * seg.p0.y + 3 * u * u * ratio * seg.cp1.y + 3 * u * ratio * ratio * seg.cp2.y + ratio * ratio * ratio * seg.p1.y;
          curvePositions.push(bx, by, zPos);
        }
      });

      // ハンドル線
      if (linePositions.length > 0) {
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
        const lineMat = new THREE.LineBasicMaterial({ color: 0xffea00, depthTest: false, transparent: true, opacity: 0.85 });
        const handleLines = new THREE.LineSegments(lineGeo, lineMat);
        debugGroup.add(handleLines);
      }

      // ベジェ輪郭線
      if (curvePositions.length > 0) {
        const curveGeo = new THREE.BufferGeometry();
        curveGeo.setAttribute('position', new THREE.Float32BufferAttribute(curvePositions, 3));
        const curveMat = new THREE.LineBasicMaterial({ color: 0x22c55e, depthTest: false });
        const curveLine = new THREE.Line(curveGeo, curveMat);
        debugGroup.add(curveLine);
      }

      keychainContent.add(debugGroup);
    }

    // シーンにアクキーグループを追加
    scene.add(keychainGroup);
    (window as any).__THREE_DEBUG__.keychainGroup = keychainGroup;

    // 現在の回転をアクキーと背景に適用
    applyRotations();
    renderScene();

    const m = getCircleMetrics();
    if (m) {
      setCircleInfo({
        x: m.x,
        y: m.y,
        radius: m.radius,
        isHovered: false,
        isDragging: false,
        dragMode: null,
      });
    }

  }, [cutPath, imageSrc, acrylicThickness, acrylicColor, hardwareType, hardwareColor, whiteBacking, showControlPoints]);

  // ポインター操作（マウスドラッグ・マルチタッチピンチ・ホバー判定）
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    // ポインターを登録
    activePointersRef.current.set(e.pointerId, { x: px, y: py });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    // 2本指タッチ時はピンチズームモードへ移行
    if (activePointersRef.current.size === 2) {
      const points = Array.from(activePointersRef.current.values());
      prevPinchDistRef.current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      isDraggingRef.current = false;
      dragModeRef.current = null;
      return;
    }

    // 1本指の場合：アクキー自転または背景回転の判定
    if (activePointersRef.current.size === 1) {
      const metrics = getCircleMetrics();
      let mode: 'keychain' | 'background' = 'background';
      if (metrics) {
        const dist = Math.hypot(px - metrics.x, py - metrics.y);
        if (dist <= metrics.radius) {
          mode = 'keychain';
        }
      }

      isDraggingRef.current = true;
      dragModeRef.current = mode;
      lastPointerPosRef.current = { x: px, y: py };

      setCircleInfo(prev => prev ? {
        ...prev,
        isHovered: mode === 'keychain',
        isDragging: true,
        dragMode: mode,
      } : null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    // 非アクティブポインター（マウスのホバー移動等）
    if (!activePointersRef.current.has(e.pointerId)) {
      const metrics = getCircleMetrics();
      if (metrics) {
        const dist = Math.hypot(px - metrics.x, py - metrics.y);
        setCircleInfo({
          x: metrics.x,
          y: metrics.y,
          radius: metrics.radius,
          isHovered: dist <= metrics.radius,
          isDragging: false,
          dragMode: null,
        });
      }
      return;
    }

    // ポインター位置を更新
    activePointersRef.current.set(e.pointerId, { x: px, y: py });

    // 2本指ピンチズーム処理
    if (activePointersRef.current.size === 2) {
      const points = Array.from(activePointersRef.current.values());
      const currentDist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

      if (prevPinchDistRef.current && prevPinchDistRef.current > 0) {
        const ratio = currentDist / prevPinchDistRef.current;
        if (ratio > 0.1 && ratio < 10) {
          // ピンチアウト(ratio > 1)でzoomFactor < 1(カメラ接近・拡大)
          const zoomFactor = 1 / ratio;
          applyZoom(zoomFactor);
        }
      }
      prevPinchDistRef.current = currentDist;
      return;
    }

    // 1本指ドラッグ処理
    const metrics = getCircleMetrics();
    if (!metrics) return;

    if (isDraggingRef.current && activePointersRef.current.size === 1) {
      const dx = px - lastPointerPosRef.current.x;
      const dy = py - lastPointerPosRef.current.y;

      if (dragModeRef.current === 'keychain') {
        // アクキー回転モード: アクキーの左右自転のみ更新（背景の仰角・向きは一切変えない）
        keychainYawRef.current += dx * 0.008;
      } else if (dragModeRef.current === 'background') {
        // 背景回転モード: 上下ドラッグで背景の仰角、左右ドラッグで背景の方位角を回転（回転量を2/3に調整）
        elevationRef.current = Math.max(-1.45, Math.min(1.45, elevationRef.current - dy * (0.0035 * 2 / 3)));
        bgYawRef.current -= dx * (0.004 * 2 / 3);
      }

      applyRotations();
      renderScene();
      lastPointerPosRef.current = { x: px, y: py };

      setCircleInfo({
        x: metrics.x,
        y: metrics.y,
        radius: metrics.radius,
        isHovered: dragModeRef.current === 'keychain',
        isDragging: true,
        dragMode: dragModeRef.current,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}

    activePointersRef.current.delete(e.pointerId);

    if (activePointersRef.current.size < 2) {
      prevPinchDistRef.current = null;
    }

    if (activePointersRef.current.size === 1) {
      // ピンチから1本指に戻った時は急激な視点飛びを防ぐためlastPointerPosを現在指に再設定
      const remaining = Array.from(activePointersRef.current.values())[0];
      lastPointerPosRef.current = { x: remaining.x, y: remaining.y };
      isDraggingRef.current = false;
      dragModeRef.current = null;
    } else if (activePointersRef.current.size === 0) {
      isDraggingRef.current = false;
      dragModeRef.current = null;
    }

    const metrics = getCircleMetrics();
    if (metrics && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const dist = Math.hypot(px - metrics.x, py - metrics.y);
      setCircleInfo({
        x: metrics.x,
        y: metrics.y,
        radius: metrics.radius,
        isHovered: dist <= metrics.radius,
        isDragging: false,
        dragMode: null,
      });
    }
  };

  const handlePointerLeave = () => {
    if (!isDraggingRef.current && activePointersRef.current.size === 0) {
      setCircleInfo(prev => prev ? { ...prev, isHovered: false } : null);
    }
  };

  // PCマウスホイール操作によるズーム
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.06 : 0.94;
    applyZoom(zoomFactor);
  };

  return (
    <div
      className="relative w-full h-full select-none overflow-hidden transition-colors duration-300 touch-none"
      style={{ backgroundColor: showSkyboxBg ? '#0f172a' : backgroundColor }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onWheel={handleWheel}
    >
      {/* 重心ホバー円オーバーレイ（アクキー操作エリア：半透明グレー/半透明黒） */}
      {circleInfo && (
        <div
          className="absolute rounded-full pointer-events-none transition-opacity duration-200 ease-out"
          style={{
            left: `${circleInfo.x}px`,
            top: `${circleInfo.y}px`,
            width: `${circleInfo.radius * 2}px`,
            height: `${circleInfo.radius * 2}px`,
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.16)', // 半透明グレー/黒
            border: '1.5px solid rgba(255, 255, 255, 0.28)', // 視認性の高い繊細な境界線
            boxShadow: '0 0 25px rgba(0, 0, 0, 0.12)',
            opacity: (circleInfo.isDragging ? circleInfo.dragMode === 'keychain' : circleInfo.isHovered) ? 1 : 0,
          }}
        />
      )}

      {/* 3Dキャンバス */}
      <canvas
        ref={canvasRef}
        className={`w-full h-full block outline-none select-none ${
          circleInfo?.isDragging
            ? 'cursor-grabbing'
            : circleInfo?.isHovered
            ? 'cursor-grab'
            : 'cursor-move'
        }`}
      />

      {/* ローディング表示 */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-3 bg-white/95 p-5 rounded-2xl border border-gray-200 shadow-2xl">
            <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-gray-700">アクキー生成中...</p>
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * プロシージャルなスタジオライティング用キューブマップ環境を作成
 */
function createStudioEnvironmentScene(): THREE.Scene {
  const envScene = new THREE.Scene();

  // 背景の球体（グラデーション）
  const sphereGeo = new THREE.SphereGeometry(50, 32, 32);
  const sphereMat = new THREE.MeshBasicMaterial({
    color: 0x1e293b,
    side: THREE.BackSide,
  });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  envScene.add(sphere);

  // スタジオソフトボックスの光ハイライトを模した発光パネル
  const lightPanelGeo = new THREE.PlaneGeometry(30, 20);
  const lightPanelMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // 上部ソフトライト
  const topLight = new THREE.Mesh(lightPanelGeo, lightPanelMat);
  topLight.position.set(0, 30, 10);
  topLight.rotation.x = Math.PI / 2;
  envScene.add(topLight);

  // 左右のフィルライト（エッジの綺麗な輝きを作る）
  const leftLight = new THREE.Mesh(lightPanelGeo, lightPanelMat);
  leftLight.position.set(-30, 10, 5);
  leftLight.rotation.y = Math.PI / 2;
  envScene.add(leftLight);

  const rightLight = new THREE.Mesh(lightPanelGeo, lightPanelMat);
  rightLight.position.set(30, 10, 5);
  rightLight.rotation.y = -Math.PI / 2;
  envScene.add(rightLight);

  return envScene;
}

/**
 * 金具パーツ（ナスカン / ボールチェーン）を構築
 */
function createHardwareMesh(
  type: 'clasp' | 'ballchain',
  colorScheme: 'silver' | 'gold' | 'black',
  holeCenter: THREE.Vector2,
  holeRadius: number,
  acrylicThickness: number
): THREE.Group {
  const group = new THREE.Group();

  let metalColor = 0xe2e8f0; // シルバー
  let metalness = 0.95;
  let roughness = 0.2;

  if (colorScheme === 'gold') {
    metalColor = 0xf59e0b;
    roughness = 0.15;
  } else if (colorScheme === 'black') {
    metalColor = 0x1e293b;
    roughness = 0.35;
  }

  const metalMat = new THREE.MeshStandardMaterial({
    color: metalColor,
    metalness,
    roughness,
  });

  const hX = holeCenter.x;
  const hY = holeCenter.y;

  // 1. 丸カン (Jump Ring): 穴を貫通するリング
  // 2:1比重の肉厚（約2.0mm）を自然に跨ぐスマートなプロポーション
  const ringRadius = holeRadius * 2.1; // 直径約6.7mm相当
  const ringTube = holeRadius * 0.28;
  const jumpRingGeo = new THREE.TorusGeometry(ringRadius, ringTube, 16, 32);
  const jumpRing = new THREE.Mesh(jumpRingGeo, metalMat);
  // 穴の中心 (hX, hY) をくぐり、アクリル上端を跨ぐ配置
  jumpRing.position.set(hX, hY + ringRadius * 0.85, 0);
  jumpRing.rotation.y = Math.PI / 2;
  group.add(jumpRing);

  if (type === 'clasp') {
    // ナスカン (Snap Clasp Hook)
    const claspGroup = new THREE.Group();

    // ナスカンの回転台座リング
    const swivelRingGeo = new THREE.TorusGeometry(ringRadius * 0.9, ringTube, 16, 24);
    const swivelRing = new THREE.Mesh(swivelRingGeo, metalMat);
    swivelRing.position.set(0, ringRadius * 1.85, 0);
    claspGroup.add(swivelRing);

    // ナスカン本体（フック部）
    const hookCurve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(0, ringRadius * 2.2, 0),
      new THREE.Vector3(ringRadius * 1.5, ringRadius * 3.6, 0),
      new THREE.Vector3(-ringRadius * 1.5, ringRadius * 5.0, 0),
      new THREE.Vector3(0, ringRadius * 4.3, 0)
    );
    const hookGeo = new THREE.TubeGeometry(hookCurve, 32, ringTube * 1.15, 12, false);
    const hookMesh = new THREE.Mesh(hookGeo, metalMat);
    claspGroup.add(hookMesh);

    claspGroup.position.set(hX, hY, 0);
    group.add(claspGroup);
  } else if (type === 'ballchain') {
    // ボールチェーン
    const ballCount = 12;
    const chainRadius = ringRadius * 2.2;
    const ballRadius = ringTube * 1.4;

    for (let i = 0; i < ballCount; i++) {
      const angle = (i / ballCount) * Math.PI * 2;
      const bx = hX + Math.cos(angle) * (chainRadius * 0.8);
      const by = hY + ringRadius * 1.5 + Math.sin(angle) * (chainRadius * 1.2);
      const bz = Math.sin(angle * 2) * 0.2;

      const ballGeo = new THREE.SphereGeometry(ballRadius, 16, 16);
      const ballMesh = new THREE.Mesh(ballGeo, metalMat);
      ballMesh.position.set(bx, by, bz);
      group.add(ballMesh);
    }
  }

  return group;
}
