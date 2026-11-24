import React, { useState, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, Info, X, Sun, Moon } from 'lucide-react';
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

type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'theme';

const HELP_ITEMS = [
  {
    index: '01',
    title: '画像の読み込み',
    description:
      '透過PNGを読み込むと、イラストの輪郭に合わせてアクリルが作成されます。',
  },
  {
    index: '02',
    title: 'キーホルダーの回転',
    description:
      '画面中央付近（円の内側）をドラッグすると、キーホルダー本体が左右に自転します。',
  },
  {
    index: '03',
    title: '背景・視点の回転',
    description:
      '画面の外側（円の外）をドラッグすると、周囲の背景や上下の視点角度が回転します。',
  },
  {
    index: '04',
    title: '拡大・縮小（ズーム）',
    description:
      'マウスホイール（PC）または2本指ピンチ操作（スマホ）でズームイン・ズームアウトができます。',
  },
  {
    index: '05',
    title: '画像の保存',
    description:
      '設定パネルの「画像を保存」から、現在の表示を画像として保存できます。',
  },
] as const;

function getSystemTheme(): ThemeMode {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): ThemeMode | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

function applyThemeToDocument(override: ThemeMode | null): void {
  const root = document.documentElement;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (override) {
    root.dataset.theme = override;
    if (meta) meta.content = override;
  } else {
    delete root.dataset.theme;
    if (meta) meta.content = 'light dark';
  }
}

export const App: React.FC = () => {
  const viewerRef = useRef<ViewerHandle>(null);
  const helpDialogRef = useRef<HTMLDialogElement>(null);

  // テーマ状態（ライト既定＋OS追従＋手動切替）
  const [resolvedTheme, setResolvedTheme] = useState<ThemeMode>(
    () => getStoredTheme() ?? getSystemTheme()
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleSystemChange = () => {
      if (!getStoredTheme()) {
        setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
      }
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const stored = getStoredTheme();
      applyThemeToDocument(stored);
      setResolvedTheme(stored ?? getSystemTheme());
    };

    mediaQuery.addEventListener('change', handleSystemChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      mediaQuery.removeEventListener('change', handleSystemChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const handleToggleTheme = () => {
    const target: ThemeMode = resolvedTheme === 'dark' ? 'light' : 'dark';
    const system = getSystemTheme();

    if (target === system) {
      try {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } catch {
        // Storage unavailable; apply in-memory only
      }
      applyThemeToDocument(null);
    } else {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, target);
      } catch {
        // Storage unavailable; apply in-memory only
      }
      applyThemeToDocument(target);
    }
    setResolvedTheme(target);
  };

  // ネイティブ <dialog> の light-dismiss (closedby="any") および Safari フォールバック
  useEffect(() => {
    const dialog = helpDialogRef.current;
    if (!dialog) return;

    dialog.setAttribute('closedby', 'any');

    if ('closedBy' in HTMLDialogElement.prototype) return;

    const isOutside = (e: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      );
    };

    let pressedOutside = false;
    const handlePointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const handlePointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        dialog.close();
      }
    };

    dialog.addEventListener('pointerdown', handlePointerDown);
    dialog.addEventListener('pointerup', handlePointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', handlePointerDown);
      dialog.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const handleOpenHelp = () => {
    const dialog = helpDialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  };

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
    tabWidth: 44, // ストラップ穴アクリル太さ強化
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

  // モバイル時の操作パネル開閉フラグ (初期値: true = 下部半分開いている状態)
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState<boolean>(true);

  const toggleMobilePanel = () => {
    setIsMobilePanelOpen((prev) => !prev);
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 170);
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

  const themeToggleLabel =
    resolvedTheme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え';

  return (
    <div className="relative flex flex-col lg:flex-row w-screen h-screen overflow-hidden bg-canvas text-fg select-none">
      {/* メイン3Dプレビュー領域（モバイル時は全画面、PC時は右側フレックス領域） */}
      <main className="w-full h-full lg:flex-1 relative overflow-hidden bg-surface">
        {/* ビューポート上部のフローティングユーティリティ */}
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
          <button
            type="button"
            onClick={handleOpenHelp}
            className="btn-surface pointer-events-auto"
            aria-label="操作方法・使い方を表示"
          >
            <Info className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            <span>使い方</span>
          </button>

          {/* モバイル専用テーマ切替 */}
          <button
            type="button"
            onClick={handleToggleTheme}
            className="btn-surface lg:hidden pointer-events-auto"
            aria-label={themeToggleLabel}
          >
            {resolvedTheme === 'dark' ? (
              <Moon className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Sun className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            )}
            <span className="font-mono text-xs tracking-[0.08em] uppercase">
              {resolvedTheme === 'dark' ? 'DARK' : 'LIGHT'}
            </span>
          </button>
        </div>

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

      {/* 操作パネル（PC: 左側400px固定サイドバー / スマホ: 画面下部開閉シート） */}
      <aside
        aria-label="キーホルダー設定"
        className={`
          bg-canvas z-30 flex flex-col shrink-0 overflow-hidden
          transition-[height] duration-base ease-crisp
          lg:order-first lg:relative lg:w-[400px] lg:h-full lg:border-r lg:border-t-0 lg:border-line-subtle
          fixed bottom-0 left-0 right-0 border-t border-line-strong
          ${isMobilePanelOpen ? 'h-[50vh]' : 'h-12'}
        `}
      >
        {/* PC専用トップバー（64px・ブランドワードマーク＋テーマ切替） */}
        <header className="hidden lg:flex items-center justify-between h-16 px-8 shrink-0 border-b border-line-subtle bg-canvas">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-sm font-medium tracking-[0.08em] uppercase text-fg">
              ACRYLIC
            </span>
            <span className="mono-label text-fg-muted">3D SIMULATOR</span>
          </div>

          <button
            type="button"
            onClick={handleToggleTheme}
            className="btn-ghost border border-line-subtle px-2.5"
            aria-label={themeToggleLabel}
          >
            {resolvedTheme === 'dark' ? (
              <Moon className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Sun className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
            )}
            <span className="font-mono text-[11px] font-medium tracking-[0.08em] uppercase">
              {resolvedTheme === 'dark' ? 'DARK' : 'LIGHT'}
            </span>
          </button>
        </header>

        {/* モバイル専用：開閉バー ＋ クイック保存ボタン */}
        <div className="lg:hidden flex items-center justify-between pl-5 pr-3 h-12 shrink-0 bg-surface border-b border-line-subtle select-none">
          <button
            type="button"
            onClick={toggleMobilePanel}
            aria-expanded={isMobilePanelOpen}
            className="flex items-center gap-2.5 h-full flex-1 text-left text-fg cursor-pointer"
          >
            {isMobilePanelOpen ? (
              <ChevronDown className="w-4 h-4 text-fg-secondary shrink-0" strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <ChevronUp className="w-4 h-4 text-fg-secondary shrink-0" strokeWidth={1.5} aria-hidden="true" />
            )}
            <span className="text-sm font-medium text-fg">設定</span>
            <span className="mono-label text-fg-muted">
              {isMobilePanelOpen ? 'HIDE' : 'OPEN'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleCaptureScreenshot}
            className="btn-primary min-h-[36px] px-3 text-xs"
          >
            画像を保存
          </button>
        </div>

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

      {/* ネイティブモーダル <dialog>（使い方ガイド） */}
      <dialog
        ref={helpDialogRef}
        aria-labelledby="help-dialog-title"
        className="swiss-dialog"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-line-subtle">
          <div>
            <span className="mono-label block mb-1">GUIDE / 01–05</span>
            <h1 id="help-dialog-title" className="text-lg font-medium text-fg leading-snug">
              操作方法・使い方
            </h1>
          </div>
          <form method="dialog">
            <button
              type="submit"
              className="btn-ghost px-2 min-w-[36px]"
              aria-label="閉じる"
            >
              <X className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </form>
        </div>

        <div className="px-6 py-6 overflow-y-auto select-text">
          <ol className="border-t border-line-strong">
            {HELP_ITEMS.map((item) => (
              <li
                key={item.index}
                className="grid grid-cols-[2rem_1fr] gap-x-4 py-4 border-b border-line-subtle"
              >
                <span className="font-mono text-xs text-fg-muted tabular-nums pt-0.5">
                  {item.index}
                </span>
                <div>
                  <p className="text-sm font-medium text-fg mb-1">{item.title}</p>
                  <p className="text-sm text-fg-secondary leading-[1.7] tracking-[0.02em]">
                    {item.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="px-6 py-4 border-t border-line-subtle flex justify-end">
          <form method="dialog">
            <button type="submit" autoFocus className="btn-primary">
              閉じる
            </button>
          </form>
        </div>
      </dialog>
    </div>
  );
};

export default App;
