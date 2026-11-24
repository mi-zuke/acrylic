import React, { useRef, useState, useEffect, useId, useCallback } from 'react';
import {
  Camera,
  RotateCw,
  Sliders,
  Maximize2,
  Globe,
  Upload,
  ChevronDown,
} from 'lucide-react';
import { CutPathOptions, GeneratedCutPath } from '../utils/contourTracer';
import { EnvironmentPreset, ENVIRONMENT_PRESETS } from '../utils/environmentGenerator';
import { LightingDebugParams } from '../types/lighting';

interface ControlPanelProps {
  options: CutPathOptions;
  onOptionsChange: (newOptions: Partial<CutPathOptions>) => void;
  onImageUpload: (dataUrl: string) => void;
  useSample: boolean;
  onUseSampleChange: (checked: boolean) => void;
  cutPath: GeneratedCutPath | null;

  // アクリル設定
  acrylicThickness: number;
  setAcrylicThickness: (v: number) => void;

  // ビュー・環境設定
  autoRotate: boolean;
  setAutoRotate: (v: boolean | ((prev: boolean) => boolean)) => void;
  backgroundColor: string;
  setBackgroundColor: (c: string) => void;
  envPreset: EnvironmentPreset;
  setEnvPreset: (p: EnvironmentPreset) => void;
  showSkyboxBg: boolean;
  setShowSkyboxBg: (v: boolean | ((prev: boolean) => boolean)) => void;
  illustrationEnvInfluence: number;
  setIllustrationEnvInfluence: (v: number) => void;
  lightingParams: LightingDebugParams;
  onLightingParamsChange: (params: LightingDebugParams) => void;
  onResetLighting: () => void;

  // アクション
  onCaptureScreenshot: () => void;
  onResetCamera: () => void;

  // デバッグ
  showControlPoints?: boolean;
  setShowControlPoints?: (v: boolean | ((prev: boolean) => boolean)) => void;
}

const BG_SWATCHES = [
  '#ffffff',
  '#cccccc',
  '#999999',
  '#666666',
  '#333333',
  '#000000',
] as const;

function getSliderStyle(val: number, min: number, max: number): React.CSSProperties {
  const percent = Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
  return { '--slider-progress': `${percent}%` } as React.CSSProperties;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  options,
  onOptionsChange,
  onImageUpload,
  useSample,
  onUseSampleChange,
  acrylicThickness,
  setAcrylicThickness,
  autoRotate,
  setAutoRotate,
  backgroundColor,
  setBackgroundColor,
  envPreset,
  setEnvPreset,
  showSkyboxBg,
  setShowSkyboxBg,
  lightingParams,
  onLightingParamsChange,
  onCaptureScreenshot,
  onResetCamera,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollDown, setCanScrollDown] = useState<boolean>(false);

  const marginSliderId = useId();
  const thicknessSliderId = useId();
  const holeOffsetSliderId = useId();
  const envSelectId = useId();
  const brightnessSliderId = useId();
  const panoramaSwitchId = useId();

  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const hasMore = el.scrollHeight - el.scrollTop - el.clientHeight > 12;
    setCanScrollDown(hasMore);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    checkScroll();

    const resizeObserver = new ResizeObserver(() => {
      checkScroll();
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
    };
  }, [checkScroll]);

  useEffect(() => {
    const timer = setTimeout(checkScroll, 30);
    return () => clearTimeout(timer);
  }, [showSkyboxBg, checkScroll]);

  const handleDetailsToggle = () => {
    setTimeout(checkScroll, 180);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onImageUpload(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const brightness = Math.round((1.0 - lightingParams.illustrationMetalness) * 100);

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col bg-canvas text-fg">
      <div
        ref={scrollContainerRef}
        onScroll={checkScroll}
        className="w-full flex flex-col flex-1 overflow-y-auto"
      >
        <div className="divide-y divide-line-subtle border-b border-line-subtle">
          {/* 01. 画像読み込み（初期展開） */}
          <details
            className="swiss-accordion"
            open
            onToggle={handleDetailsToggle}
          >
            <summary className="flex items-center justify-between gap-3 px-6 py-4 lg:px-8 lg:py-5 select-none">
              <span className="flex items-center gap-3 min-w-0">
                <ChevronDown
                  className="accordion-chevron w-4 h-4 text-fg-secondary shrink-0"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span className="font-mono text-xs text-fg-muted tabular-nums shrink-0">
                  01
                </span>
                <span className="text-sm font-medium text-fg truncate">
                  画像読み込み
                </span>
              </span>
              <Upload
                className="w-4 h-4 text-fg-muted shrink-0"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </summary>

            <div className="px-6 pb-6 pt-2 lg:px-8 lg:pb-7 space-y-5">
              <div className="flex items-center justify-between gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
                  <span>画像を選択</span>
                </button>

                <span className="mono-label truncate">
                  {useSample ? 'SOURCE: SAMPLE' : 'SOURCE: CUSTOM'}
                </span>
              </div>

              <label className="inline-flex items-center gap-3 cursor-pointer min-h-[36px] text-sm text-fg">
                <input
                  type="checkbox"
                  checked={useSample}
                  onChange={(e) => onUseSampleChange(e.target.checked)}
                  className="swiss-checkbox"
                />
                <span>サンプルを使用</span>
              </label>
            </div>
          </details>

          {/* 02. キーホルダー設定（初期折りたたみ） */}
          <details
            className="swiss-accordion"
            onToggle={handleDetailsToggle}
          >
            <summary className="flex items-center justify-between gap-3 px-6 py-4 lg:px-8 lg:py-5 select-none">
              <span className="flex items-center gap-3 min-w-0">
                <ChevronDown
                  className="accordion-chevron w-4 h-4 text-fg-secondary shrink-0"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span className="font-mono text-xs text-fg-muted tabular-nums shrink-0">
                  02
                </span>
                <span className="text-sm font-medium text-fg truncate">
                  キーホルダー
                </span>
              </span>
              <Sliders
                className="w-4 h-4 text-fg-muted shrink-0"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </summary>

            <div className="px-6 pb-6 pt-2 lg:px-8 lg:pb-7 space-y-6">
              {/* 余白の大きさ */}
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor={marginSliderId} className="text-sm text-fg-secondary">
                    余白の大きさ
                  </label>
                  <span className="font-mono text-xs font-medium text-fg tabular-nums">
                    {options.offsetMargin} PX
                  </span>
                </div>
                <input
                  id={marginSliderId}
                  type="range"
                  min={8}
                  max={50}
                  step={1}
                  value={options.offsetMargin}
                  onChange={(e) => onOptionsChange({ offsetMargin: Number(e.target.value) })}
                  className="swiss-slider"
                  style={getSliderStyle(options.offsetMargin, 8, 50)}
                />
              </div>

              {/* アクリルの厚み */}
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor={thicknessSliderId} className="text-sm text-fg-secondary">
                    アクリルの厚み
                  </label>
                  <span className="font-mono text-xs font-medium text-fg tabular-nums">
                    {acrylicThickness} MM
                  </span>
                </div>
                <input
                  id={thicknessSliderId}
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={acrylicThickness}
                  onChange={(e) => setAcrylicThickness(Number(e.target.value))}
                  className="swiss-slider"
                  style={getSliderStyle(acrylicThickness, 1, 5)}
                />
              </div>

              {/* ストラップ穴の横位置 */}
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor={holeOffsetSliderId} className="text-sm text-fg-secondary">
                    ストラップ穴の横位置
                  </label>
                  <span className="font-mono text-xs font-medium text-fg tabular-nums">
                    {options.holeOffsetX > 0 ? `+${options.holeOffsetX}%` : `${options.holeOffsetX}%`}
                  </span>
                </div>
                <input
                  id={holeOffsetSliderId}
                  type="range"
                  min={-80}
                  max={80}
                  step={5}
                  value={options.holeOffsetX}
                  onChange={(e) => onOptionsChange({ holeOffsetX: Number(e.target.value) })}
                  className="swiss-slider"
                  style={getSliderStyle(options.holeOffsetX, -80, 80)}
                />
              </div>
            </div>
          </details>

          {/* 03. 背景と環境光（初期折りたたみ） */}
          <details
            className="swiss-accordion"
            onToggle={handleDetailsToggle}
          >
            <summary className="flex items-center justify-between gap-3 px-6 py-4 lg:px-8 lg:py-5 select-none">
              <span className="flex items-center gap-3 min-w-0">
                <ChevronDown
                  className="accordion-chevron w-4 h-4 text-fg-secondary shrink-0"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span className="font-mono text-xs text-fg-muted tabular-nums shrink-0">
                  03
                </span>
                <span className="text-sm font-medium text-fg truncate">
                  背景と環境光
                </span>
              </span>
              <Globe
                className="w-4 h-4 text-fg-muted shrink-0"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </summary>

            <div className="px-6 pb-6 pt-2 lg:px-8 lg:pb-7 space-y-6">
              {/* 環境プリセット */}
              <div className="space-y-2">
                <label htmlFor={envSelectId} className="mono-label block">
                  環境プリセット
                </label>
                <div className="relative">
                  <select
                    id={envSelectId}
                    value={envPreset}
                    onChange={(e) => setEnvPreset(e.target.value as EnvironmentPreset)}
                    className="swiss-select"
                  >
                    {ENVIRONMENT_PRESETS.map((p, index) => {
                      const label = index === 0 ? 'デフォルト' : `サンプル${index}`;
                      return (
                        <option key={p.id} value={p.id}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-fg-secondary">
                    <ChevronDown className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
                  </div>
                </div>
              </div>

              {/* 光の強さ */}
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor={brightnessSliderId} className="text-sm text-fg-secondary">
                    光の強さ
                  </label>
                  <span className="font-mono text-xs font-medium text-fg tabular-nums">
                    {brightness}
                  </span>
                </div>
                <input
                  id={brightnessSliderId}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={brightness}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    const metalness = Number(((100 - val) / 100).toFixed(2));
                    onLightingParamsChange({ ...lightingParams, illustrationMetalness: metalness });
                  }}
                  className="swiss-slider"
                  style={getSliderStyle(brightness, 0, 100)}
                />
              </div>

              {/* 背景表示・パノラマ切替 */}
              <div className="pt-5 border-t border-line-subtle space-y-4">
                <label
                  htmlFor={panoramaSwitchId}
                  className="flex items-center justify-between gap-4 cursor-pointer min-h-[36px]"
                >
                  <span className="text-sm text-fg">パノラマ表示</span>
                  <span className="flex items-center gap-2.5">
                    <span className="mono-label">
                      {showSkyboxBg ? 'ON' : 'OFF'}
                    </span>
                    <input
                      id={panoramaSwitchId}
                      type="checkbox"
                      role="switch"
                      checked={showSkyboxBg}
                      onChange={(e) => setShowSkyboxBg(e.target.checked)}
                      className="swiss-switch"
                    />
                  </span>
                </label>

                {/* 6段階無彩色背景パレット（パノラマOFF時） */}
                {!showSkyboxBg && (
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="mono-label">単色背景</span>
                      <span className="font-mono text-xs text-fg tabular-nums uppercase">
                        {backgroundColor}
                      </span>
                    </div>
                    <div
                      className="grid grid-cols-6 gap-[1px] bg-line border border-line"
                      role="group"
                      aria-label="背景色を選択"
                    >
                      {BG_SWATCHES.map((hex) => {
                        const isSelected = backgroundColor.toLowerCase() === hex.toLowerCase();
                        return (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => setBackgroundColor(hex)}
                            title={hex.toUpperCase()}
                            aria-label={`背景色 ${hex.toUpperCase()}`}
                            aria-pressed={isSelected}
                            className="h-9 w-full cursor-pointer relative flex items-center justify-center rounded-none"
                            style={{ backgroundColor: hex }}
                          >
                            {isSelected && (
                              <span
                                aria-hidden="true"
                                className="w-2.5 h-2.5 block bg-canvas border border-line-strong"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </details>
        </div>

        {/* 04. 操作・保存アクション */}
        <section
          aria-label="ビュー操作と画像保存"
          className="mt-auto px-6 py-6 lg:px-8 lg:py-7 space-y-3"
        >
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAutoRotate((prev) => !prev)}
              aria-pressed={autoRotate}
              className="btn-secondary px-3"
            >
              <RotateCw className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <span>自動回転</span>
              <span className="font-mono text-xs tabular-nums">
                {autoRotate ? 'ON' : 'OFF'}
              </span>
            </button>

            <button
              type="button"
              onClick={onResetCamera}
              className="btn-secondary px-3"
              title="アクキーと背景の向きを初期状態に戻す"
            >
              <Maximize2 className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <span>向きをリセット</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onCaptureScreenshot}
            className="btn-primary w-full min-h-[44px]"
            title="3Dモデルを画像として保存"
          >
            <Camera className="w-4 h-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <span>画像を保存</span>
          </button>
        </section>
      </div>

      {/* 下部スクロールインジケーター（グラデーション・影なし） */}
      <div
        aria-hidden="true"
        className={`
          pointer-events-none absolute bottom-0 left-0 right-0
          bg-surface border-t border-line-subtle py-1
          flex items-center justify-center gap-1.5
          transition-opacity duration-base ease-crisp z-10
          ${canScrollDown ? 'opacity-100' : 'opacity-0'}
        `}
      >
        <span className="mono-label">SCROLL</span>
        <ChevronDown className="w-3.5 h-3.5 text-fg-secondary" strokeWidth={1.5} />
      </div>
    </div>
  );
};
