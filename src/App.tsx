import React, { useState, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, Info, X } from 'lucide-react';
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
  const [envPreset, setEnvPreset] = useState<EnvironmentPreset>('sunset'); // 天球環境（デフォルト: サンプル1）
  const [showSkyboxBg, setShowSkyboxBg] = useState<boolean>(true); // パノラマ表示（デフォルト: ON）
  const [illustrationEnvInfluence, setIllustrationEnvInfluence] = useState<number>(30); // イラストへの環境光の影響度(%)
  const [lightingParams, setLightingParams] = useState<LightingDebugParams>(DEFAULT_LIGHTING_PARAMS);
  const [showControlPoints, setShowControlPoints] = useState<boolean>(false); // デバッグ用：アクリル外枠の制御点表示
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false); // 使い方モーダルの表示フラグ

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
        {/* 背景左上の使い方ボタン */}
        <button
          type="button"
          onClick={() => setShowHelpModal(true)}
          className="absolute top-4 left-4 z-20 h-8 px-2.5 flex items-center gap-1.5 bg-white hover:bg-gray-50 active:bg-gray-100 border border-gray-300 text-gray-800 text-xs font-medium shadow-sm rounded-none cursor-pointer transition-colors"
          title="使い方"
          aria-label="使い方を表示"
        >
          <Info className="w-3.5 h-3.5 text-gray-700" />
          <span>使い方</span>
        </button>

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
            showControlPoints={showControlPoints}
            isMobilePanelOpen={isMobilePanelOpen}
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
            showControlPoints={showControlPoints}
            setShowControlPoints={setShowControlPoints}
          />
        </div>
      </aside>

      {/* 使い方モーダル */}
      {showHelpModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4"
          onClick={() => setShowHelpModal(false)}
        >
          <div
            className="bg-white border border-gray-300 shadow-xl max-w-sm w-full p-5 rounded-none text-gray-800 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 mb-4">
              <div className="flex items-center gap-2 font-bold text-gray-800 text-sm">
                <Info className="w-4 h-4 text-gray-700" />
                <span>操作方法・使い方</span>
              </div>
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="w-7 h-7 flex items-center justify-center bg-[#e8e8e8] hover:bg-[#dedede] active:bg-[#d4d4d4] border border-gray-300 text-gray-700 rounded-none cursor-pointer transition-colors"
                aria-label="閉じる"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ガイド一覧 */}
            <div className="space-y-3.5 text-xs leading-relaxed text-gray-600">
              <div>
                <p className="font-semibold text-gray-800 mb-0.5 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 bg-gray-600 rounded-full" />
                  画像の読み込み
                </p>
                <p className="pl-3.5">
                  背景が透過されたPNG画像（透過PNG）を読み込むと、イラストの輪郭に合わせて綺麗にアクリルが作成されます。
                </p>
              </div>

              <div>
                <p className="font-semibold text-gray-800 mb-0.5 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 bg-gray-600 rounded-full" />
                  キーホルダーの回転
                </p>
                <p className="pl-3.5">
                  画面中央付近（円の内側）をドラッグすると、キーホルダー本体が左右に自転します。
                </p>
              </div>

              <div>
                <p className="font-semibold text-gray-800 mb-0.5 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 bg-gray-600 rounded-full" />
                  背景・視点の回転
                </p>
                <p className="pl-3.5">
                  画面の外側（円の外）をドラッグすると、周囲の背景や上下の視点角度が回転します。
                </p>
              </div>

              <div>
                <p className="font-semibold text-gray-800 mb-0.5 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 bg-gray-600 rounded-full" />
                  拡大・縮小（ズーム）
                </p>
                <p className="pl-3.5">
                  マウスホイール（PC）または2本指ピンチ操作（スマホ）でズームイン・ズームアウトができます。
                </p>
              </div>

              <div>
                <p className="font-semibold text-gray-800 mb-0.5 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 bg-gray-600 rounded-full" />
                  画像の保存
                </p>
                <p className="pl-3.5">
                  設定パネルの「画像を保存」から、現在の3D表示を高解像度なPNG画像として保存できます。
                </p>
              </div>
            </div>

            {/* フッター閉じるボタン */}
            <div className="mt-5 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="w-full py-2 bg-[#e8e8e8] hover:bg-[#dedede] active:bg-[#d4d4d4] border border-gray-300 text-xs font-medium text-gray-800 rounded-none cursor-pointer transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
