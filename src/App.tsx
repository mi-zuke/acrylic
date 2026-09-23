import React, { useState, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { KeychainViewer, ViewerHandle } from './components/KeychainViewer';
import { ControlPanel } from './components/ControlPanel';
import {
  CutPathOptions,
  GeneratedCutPath,
  generateAcrylicCutPath,
} from './utils/contourTracer';
import { SAMPLE_IMAGES } from './utils/sampleImages';
import { EnvironmentPreset } from './utils/environmentGenerator';
import { LightingDebugParams, DEFAULT_LIGHTING_PARAMS } from './types/lighting';

export const App: React.FC = () => {
  const viewerRef = useRef<ViewerHandle>(null);

  // 画像ソース（Data URL）
  const [imageSrc, setImageSrc] = useState<string>('');
  const [userUploadedSrc, setUserUploadedSrc] = useState<string>('');
  const [useSample, setUseSample] = useState<boolean>(true);

  // カットパス設定
  const [cutOptions, setCutOptions] = useState<CutPathOptions>({
    offsetMargin: 20,
    smoothness: 3, // 3に固定
    holeOffsetX: 0,
    holeDiameter: 3.2,
    tabHeight: 36, // ストラップ穴アクリル太さ強化
    tabWidth: 44,  // ストラップ穴アクリル太さ強化
  });

  // 計算されたカットパス情報
  const [cutPath, setCutPath] = useState<GeneratedCutPath | null>(null);

  // アクリル設定
  const [acrylicThickness, setAcrylicThickness] = useState<number>(2); // 既定値: 2mm
  const [acrylicColor] = useState<string>('clear'); // 透明クリア固定
  const whiteBacking = true; // 白押さえは常に有効固定

  // 金具設定（ナスカン・銀に固定）
  const hardwareType = 'clasp' as const;
  const hardwareColor = 'silver' as const;

  // ビューワー・環境設定
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [backgroundColor, setBackgroundColor] = useState<string>('#cccccc'); // 既定値: #CCCCCC
  const [envPreset, setEnvPreset] = useState<EnvironmentPreset>('studio'); // 天球環境
  const [showSkyboxBg, setShowSkyboxBg] = useState<boolean>(false);
  const [illustrationEnvInfluence, setIllustrationEnvInfluence] = useState<number>(30); // イラストへの環境光の影響度(%)
  const [lightingParams, setLightingParams] = useState<LightingDebugParams>(DEFAULT_LIGHTING_PARAMS);

  // モバイル時の操作パネル開閉フラグ (初期値: true = 下部半分開いている状態)
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState<boolean>(true);

  const toggleMobilePanel = () => {
    setIsMobilePanelOpen((prev) => !prev);
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 320);
  };

  // ライティング初期化ハンドラ
  const handleResetLighting = () => {
    setLightingParams({ ...DEFAULT_LIGHTING_PARAMS });
  };

  // 初回起動時にクリームソーダをサンプルとして読み込み
  useEffect(() => {
    setImageSrc(SAMPLE_IMAGES[2].generateUrl());
  }, []);

  // 画像またはカットパス設定が更新されたら、自動でカットパスを再計算
  useEffect(() => {
    if (!imageSrc) return;

    let isCancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      if (isCancelled) return;
      try {
        const result = await generateAcrylicCutPath(img, cutOptions);
        if (!isCancelled) {
          setCutPath(result);
        }
      } catch (err) {
        console.error('Failed to generate cut path:', err);
      }
    };
    img.src = imageSrc;

    return () => {
      isCancelled = true;
    };
  }, [imageSrc, cutOptions]);

  // 画像アップロード時の処理
  const handleImageUpload = (url: string) => {
    setImageSrc(url);
    setUserUploadedSrc(url);
    setUseSample(false);
  };

  // サンプル使用チェックボックスの切り替え
  const handleUseSampleChange = (checked: boolean) => {
    setUseSample(checked);
    if (checked) {
      setImageSrc(SAMPLE_IMAGES[2].generateUrl());
    } else if (userUploadedSrc) {
      setImageSrc(userUploadedSrc);
    }
  };

  // 設定の部分更新
  const handleOptionsChange = (newOpts: Partial<CutPathOptions>) => {
    setCutOptions((prev) => ({ ...prev, ...newOpts }));
  };

  // スクリーンショット撮影＆ダウンロード
  const handleCaptureScreenshot = () => {
    if (!viewerRef.current) return;
    const dataUrl = viewerRef.current.captureScreenshot();
    if (!dataUrl) return;

    const link = document.createElement('a');
    link.download = `acrylic-keychain-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  };

  // カメラリセット
  const handleResetCamera = () => {
    viewerRef.current?.resetCamera();
  };

  return (
    <div className="relative flex flex-col lg:flex-row w-screen h-screen overflow-hidden bg-white font-sans text-gray-800">
      {/* メイン3Dプレビュー領域（モバイル時は全画面、PC時は右側フレックス領域） */}
      <main className="w-full h-full lg:flex-1 relative overflow-hidden bg-gray-100">
        {imageSrc && (
          <KeychainViewer
            ref={viewerRef}
            cutPath={cutPath}
            imageSrc={imageSrc}
            acrylicThickness={acrylicThickness}
            acrylicColor={acrylicColor}
            hardwareType={hardwareType}
            hardwareColor={hardwareColor}
            whiteBacking={whiteBacking}
            autoRotate={autoRotate}
            backgroundColor={backgroundColor}
            envPreset={envPreset}
            showSkyboxBg={showSkyboxBg}
            illustrationEnvInfluence={illustrationEnvInfluence}
            lightingParams={lightingParams}
          />
        )}
      </main>

      {/* 操作パネル（PC: 左側固定サイドバー / スマホ: 画面下部半分固定・開閉ボトムシート） */}
      <aside
        className={`
          bg-white shadow-xl lg:shadow-sm border-gray-200 z-30 flex flex-col
          transition-all duration-300 ease-in-out
          lg:order-first lg:relative lg:w-[420px] lg:h-full lg:border-r lg:border-t-0 lg:shadow-none
          fixed bottom-0 left-0 right-0 border-t
          ${isMobilePanelOpen ? 'h-[50vh]' : 'h-11'}
        `}
      >
        {/* モバイル専用：開閉ヘッダーバー */}
        <button
          type="button"
          onClick={toggleMobilePanel}
          className="lg:hidden flex items-center justify-between px-4 h-11 shrink-0 bg-[#e8e8e8] hover:bg-[#dedede] active:bg-[#d4d4d4] text-gray-800 text-[13px] font-medium border-b border-gray-300 rounded-none cursor-pointer transition-colors select-none"
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-1 bg-gray-500 rounded-full" />
            <span>設定</span>
          </div>
          <div className="flex items-center text-gray-600">
            {isMobilePanelOpen ? (
              <ChevronDown className="w-4 h-4 text-gray-700" />
            ) : (
              <ChevronUp className="w-4 h-4 text-gray-700" />
            )}
          </div>
        </button>

        {/* コントロールパネル本体 */}
        <div className={`flex-1 overflow-hidden flex flex-col ${!isMobilePanelOpen ? 'hidden lg:flex' : 'flex'}`}>
          <ControlPanel
            options={cutOptions}
            onOptionsChange={handleOptionsChange}
            onImageUpload={handleImageUpload}
            useSample={useSample}
            onUseSampleChange={handleUseSampleChange}
            cutPath={cutPath}
            acrylicThickness={acrylicThickness}
            setAcrylicThickness={setAcrylicThickness}
            autoRotate={autoRotate}
            setAutoRotate={setAutoRotate}
            backgroundColor={backgroundColor}
            setBackgroundColor={setBackgroundColor}
            envPreset={envPreset}
            setEnvPreset={setEnvPreset}
            showSkyboxBg={showSkyboxBg}
            setShowSkyboxBg={setShowSkyboxBg}
            illustrationEnvInfluence={illustrationEnvInfluence}
            setIllustrationEnvInfluence={setIllustrationEnvInfluence}
            lightingParams={lightingParams}
            onLightingParamsChange={setLightingParams}
            onResetLighting={handleResetLighting}
            onCaptureScreenshot={handleCaptureScreenshot}
            onResetCamera={handleResetCamera}
          />
        </div>
      </aside>
    </div>
  );
};

export default App;
