import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

export type EnvironmentPreset =
  | 'studio'
  | 'indoor'
  | 'outdoor'
  | 'sunset'
  | 'sunrise'
  | 'bridge'
  | 'city'
  | 'night';

export interface EnvironmentPresetItem {
  id: EnvironmentPreset;
  name: string;
  category: string;
  icon: string;
  description: string;
  hdrFile?: string;
}

export const ENVIRONMENT_PRESETS: EnvironmentPresetItem[] = [
  {
    id: 'studio',
    name: 'スタジオ',
    category: 'スタジオ',
    icon: '💡',
    description: 'ニュートラルで清潔なソフトボックス照明（標準）',
  },
  {
    id: 'indoor',
    name: '室内・窓辺',
    category: '室内',
    icon: '🏠',
    description: 'お部屋の窓から差し込む暖かな自然光',
  },
  {
    id: 'outdoor',
    name: '青空・自然',
    category: '屋外',
    icon: '🌳',
    description: '晴天の太陽光と大自然の澄み切った光',
    hdrFile: '/environments/quarry_01_1k.hdr',
  },
  {
    id: 'sunset',
    name: '黄金の夕景',
    category: '夕景',
    icon: '🌇',
    description: 'ヴェネツィアの運河に沈むドラマチックな夕日',
    hdrFile: '/environments/venice_sunset_1k.hdr',
  },
  {
    id: 'sunrise',
    name: '朝焼けの海',
    category: '朝',
    icon: '🌅',
    description: '水平線から昇る朝日と穏やかな波打ち際',
    hdrFile: '/environments/blouberg_sunrise_2_1k.hdr',
  },
  {
    id: 'bridge',
    name: '運河と石橋',
    category: '街並み',
    icon: '🏛️',
    description: 'ヨーロッパの歴史ある美しい運河と石畳の街並み',
    hdrFile: '/environments/san_giuseppe_bridge_2k.hdr',
  },
  {
    id: 'city',
    name: '都会の街歩き',
    category: '街並み',
    icon: '🏙️',
    description: '歩道橋から見渡すモダンな都市空間',
    hdrFile: '/environments/pedestrian_overpass_1k.hdr',
  },
  {
    id: 'night',
    name: '満天の星空',
    category: '夜景',
    icon: '🌌',
    description: '静寂の夜空に瞬く無数の星々のきらめき',
    hdrFile: '/environments/moonless_golf_1k.hdr',
  },
];

/**
 * プロシージャル Equirectangular パノラマ天球テクスチャの生成
 * （オフライン時やHDR非対応時のフォールバックとしても機能）
 */
export function createEnvironmentCanvas(preset: EnvironmentPreset): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const w = canvas.width;
  const h = canvas.height;
  const horizon = h * 0.52;

  if (preset === 'indoor') {
    // 室内 (Indoor / 部屋・窓辺)
    const wallGrad = ctx.createLinearGradient(0, 0, 0, horizon);
    wallGrad.addColorStop(0, '#e2e8f0');
    wallGrad.addColorStop(0.4, '#cbd5e1');
    wallGrad.addColorStop(1, '#94a3b8');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, w, horizon);

    const floorGrad = ctx.createLinearGradient(0, horizon, 0, h);
    floorGrad.addColorStop(0, '#78350f');
    floorGrad.addColorStop(0.3, '#92400e');
    floorGrad.addColorStop(1, '#451a03');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, horizon, w, h - horizon);

    // 床の光の反射
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.filter = 'blur(30px)';
    ctx.fillRect(w * 0.2, horizon, w * 0.4, h * 0.3);
    ctx.filter = 'none';

    // 大きな窓
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.filter = 'blur(8px)';
    ctx.fillRect(w * 0.22, h * 0.12, w * 0.32, horizon - h * 0.15);

    ctx.filter = 'none';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 6;
    ctx.strokeRect(w * 0.22, h * 0.12, w * 0.32, horizon - h * 0.15);
    ctx.beginPath();
    ctx.moveTo(w * 0.38, h * 0.12);
    ctx.lineTo(w * 0.38, horizon - h * 0.03);
    ctx.moveTo(w * 0.22, h * 0.28);
    ctx.lineTo(w * 0.54, h * 0.28);
    ctx.stroke();
    ctx.restore();

    // ダウンライト
    const addDownlight = (cx: number, cy: number, r: number) => {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, '#fffbeb');
      g.addColorStop(0.3, 'rgba(254, 243, 199, 0.8)');
      g.addColorStop(1, 'rgba(244, 243, 199, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    };
    addDownlight(w * 0.75, h * 0.1, 80);
    addDownlight(w * 0.08, h * 0.08, 60);

  } else {
    // デフォルト・スタジオプロシージャル
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#1e293b');
    bgGrad.addColorStop(0.5, '#334155');
    bgGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#ffffff';
    ctx.filter = 'blur(16px)';
    ctx.fillRect(w * 0.25, h * 0.05, w * 0.5, h * 0.18);

    ctx.fillStyle = '#f8fafc';
    ctx.filter = 'blur(20px)';
    ctx.fillRect(w * 0.08, h * 0.15, w * 0.12, h * 0.45);

    ctx.fillStyle = '#bae6fd';
    ctx.filter = 'blur(24px)';
    ctx.fillRect(w * 0.8, h * 0.2, w * 0.12, h * 0.4);
    ctx.filter = 'none';
  }

  return canvas;
}

/**
 * プロシージャル CanvasTexture の生成
 */
export function createEnvironmentTexture(preset: EnvironmentPreset): THREE.CanvasTexture {
  const canvas = createEnvironmentCanvas(preset);
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// HDRローダーのインスタンスキャッシュ
const rgbeLoader = new RGBELoader();

/**
 * 高品質 HDR またはプロシージャル天球テクスチャをロード
 */
export function loadEnvironmentTextureAsync(
  preset: EnvironmentPreset,
  onLoaded: (texture: THREE.Texture) => void
): void {
  const item = ENVIRONMENT_PRESETS.find((p) => p.id === preset);

  if (item && item.hdrFile) {
    const basePath = import.meta.env.BASE_URL.endsWith('/')
      ? import.meta.env.BASE_URL
      : `${import.meta.env.BASE_URL}/`;
    const relativeHdr = item.hdrFile.replace(/^\/+/, '');
    const fullUrl = `${basePath}${relativeHdr}`;

    rgbeLoader.load(
      fullUrl,
      (hdrTexture) => {
        hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
        hdrTexture.needsUpdate = true;
        onLoaded(hdrTexture);
      },
      undefined,
      (err) => {
        console.warn(`[HDR Load Error] Failed to load ${fullUrl}, falling back to procedural:`, err);
        const fallback = createEnvironmentTexture(preset);
        onLoaded(fallback);
      }
    );
  } else {
    // プロシージャル生成
    const procTexture = createEnvironmentTexture(preset);
    onLoaded(procTexture);
  }
}
