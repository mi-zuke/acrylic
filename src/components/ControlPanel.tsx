import React, { useRef, useState, useEffect } from 'react';
import {
  Camera,
  RotateCw,
  Sliders,
  Maximize2,
  Globe,
  Upload,
  ChevronDown,
  ChevronUp,
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

  // ui-style ルール：一番上のセクションのみ初期展開、他セクションは初期折りたたみ
  const [openImageSection, setOpenImageSection] = useState<boolean>(true);
  const [openKeychainSection, setOpenKeychainSection] = useState<boolean>(false);
  const [openEnvSection, setOpenEnvSection] = useState<boolean>(false);

  // スクロールコンテナ監視（下にスクロール可能な余地があるか判定）
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollDown, setCanScrollDown] = useState<boolean>(false);

  const checkScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const hasMore = el.scrollHeight - el.scrollTop - el.clientHeight > 12;
    setCanScrollDown(hasMore);
  };

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
  }, []);

  useEffect(() => {
    const timer = setTimeout(checkScroll, 30);
    return () => clearTimeout(timer);
  }, [openImageSection, openKeychainSection, openEnvSection, showSkyboxBg]);

  // スライダーの左側をスレートブルー（#2E5275）で塗るトラック背景グラデーション
  const getSliderTrackStyle = (val: number, min: number, max: number) => {
    const percent = Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
    return {
      background: `linear-gradient(to right, #2E5275 0%, #2E5275 ${percent}%, #e5e7eb ${percent}%, #e5e7eb 100%)`,
    };
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

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col">
      <div
        ref={scrollContainerRef}
        onScroll={checkScroll}
        className="w-full bg-white flex flex-col h-full overflow-y-auto text-gray-800"
      >
        <div className="text-[13px] text-gray-700 divide-y-2 divide-gray-300">
          {/* 1. 画像読み込み（一番上のセクションのみ初期展開） */}
          <section>
            <button
              type="button"
              onClick={() => setOpenImageSection((prev) => !prev)}
              className="section-toggle"
            >
              <span className="flex items-center gap-2 text-gray-900">
                <Upload className="w-4 h-4 accent-text" />
                <span>画像読み込み</span>
              </span>
              {openImageSection ? (
                <ChevronUp className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </button>

            {openImageSection && (
              <div className="px-5 lg:pl-8 lg:pr-6 pb-5 pt-0.5 space-y-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
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
                      className="btn-file text-[13px] whitespace-nowrap shrink-0"
                    >
                      画像を選択
                    </button>
                    <span className="text-[13px] text-gray-500 truncate block min-w-0">
                      {useSample ? 'サンプル' : 'カスタム画像'}
                    </span>
                  </div>

                  {/* サンプルを使用チェックボックス */}
                  <label className="flex items-center gap-1.5 cursor-pointer text-[13px] text-gray-700 hover:text-gray-900 transition-colors shrink-0 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={useSample}
                      onChange={(e) => onUseSampleChange(e.target.checked)}
                      className="w-3.5 h-3.5 rounded-none border-gray-400 shrink-0 cursor-pointer"
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    <span className={useSample ? 'text-gray-900 font-medium' : 'text-gray-600'}>
                      サンプルを使用
                    </span>
                  </label>
                </div>
              </div>
            )}
          </section>

          {/* 2. キーホルダー設定（初期状態は折りたたみ） */}
          <section>
            <button
              type="button"
              onClick={() => setOpenKeychainSection((prev) => !prev)}
              className="section-toggle"
            >
              <span className="flex items-center gap-2 text-gray-900">
                <Sliders className="w-4 h-4 accent-text" />
                <span>キーホルダー</span>
              </span>
              {openKeychainSection ? (
                <ChevronUp className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </button>

            {openKeychainSection && (
              <div className="px-5 lg:pl-8 lg:pr-6 pb-5 pt-0.5 space-y-3.5">
                {/* 最小余白スライダー */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-gray-600">余白の大きさ</span>
                    <span className="text-gray-800 font-bold">{options.offsetMargin} px</span>
                  </div>
                  <input
                    type="range"
                    min="8"
                    max="50"
                    step="1"
                    value={options.offsetMargin}
                    onChange={(e) => onOptionsChange({ offsetMargin: Number(e.target.value) })}
                    className="custom-slider"
                    style={getSliderTrackStyle(options.offsetMargin, 8, 50)}
                  />
                </div>

                {/* アクリルの厚みスライダー */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-gray-600">アクリルの厚み</span>
                    <span className="text-gray-800 font-bold">{acrylicThickness} mm</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    value={acrylicThickness}
                    onChange={(e) => setAcrylicThickness(Number(e.target.value))}
                    className="custom-slider"
                    style={getSliderTrackStyle(acrylicThickness, 1, 5)}
                  />
                </div>

                {/* 穴のX位置オフセット */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-gray-600">ストラップ穴の横位置</span>
                    <span className="text-gray-800 font-bold">
                      {options.holeOffsetX > 0 ? `+${options.holeOffsetX}%` : `${options.holeOffsetX}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-80"
                    max="80"
                    step="5"
                    value={options.holeOffsetX}
                    onChange={(e) => onOptionsChange({ holeOffsetX: Number(e.target.value) })}
                    className="custom-slider"
                    style={getSliderTrackStyle(options.holeOffsetX, -80, 80)}
                  />
                </div>
              </div>
            )}
          </section>

          {/* 3. 背景と環境光（初期状態は折りたたみ） */}
          <section>
            <button
              type="button"
              onClick={() => setOpenEnvSection((prev) => !prev)}
              className="section-toggle"
            >
              <span className="flex items-center gap-2 text-gray-900">
                <Globe className="w-4 h-4 accent-text" />
                <span>背景と環境光</span>
              </span>
              {openEnvSection ? (
                <ChevronUp className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </button>

            {openEnvSection && (
              <div className="px-5 lg:pl-8 lg:pr-6 pb-5 pt-0.5 space-y-3.5">
                {/* 天球プルダウン選択 */}
                <div className="space-y-1">
                  <label className="block text-[13px] text-gray-600">環境プリセット</label>
                  <div className="relative">
                    <select
                      value={envPreset}
                      onChange={(e) => setEnvPreset(e.target.value as EnvironmentPreset)}
                      className="input-std w-full py-1.5 px-3 pr-8 text-[13px] appearance-none cursor-pointer"
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
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-600">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {/* 光の強さスライダー */}
                {(() => {
                  const brightness = Math.round((1.0 - lightingParams.illustrationMetalness) * 100);
                  return (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[13px]">
                        <span className="text-gray-600">光の強さ</span>
                        <span className="text-gray-800 font-bold">{brightness}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={brightness}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const metalness = Number(((100 - val) / 100).toFixed(2));
                          onLightingParamsChange({ ...lightingParams, illustrationMetalness: metalness });
                        }}
                        className="custom-slider"
                        style={getSliderTrackStyle(brightness, 0, 100)}
                      />
                    </div>
                  );
                })()}

                {/* 背景（天球背景がOFFの時に単色背景を表示） ＆ パノラマ表示 */}
                <div className="space-y-2 pt-1 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-gray-600">背景表示</span>

                    <label className="flex items-center gap-1.5 cursor-pointer text-[13px] text-gray-700 hover:text-gray-900 transition-colors">
                      <input
                        type="checkbox"
                        checked={showSkyboxBg}
                        onChange={(e) => setShowSkyboxBg(e.target.checked)}
                        className="w-3.5 h-3.5 rounded-none border-gray-400 cursor-pointer"
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      <span className="text-gray-900 font-medium">パノラマ表示</span>
                    </label>
                  </div>

                  {/* 6段階の白→黒グラデーションカラーパレット（パノラマ表示がOFFの時のみ表示） */}
                  {!showSkyboxBg && (
                    <div className="grid grid-cols-6 gap-1.5 py-1">
                      {['#ffffff', '#cccccc', '#999999', '#666666', '#333333', '#000000'].map((color) => {
                        const isSelected = backgroundColor.toLowerCase() === color.toLowerCase();
                        return (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setBackgroundColor(color)}
                            title={color.toUpperCase()}
                            className={`h-7 w-full rounded-none cursor-pointer transition-all relative ${
                              isSelected
                                ? 'border-2 border-gray-700 scale-110 z-10 shadow-sm'
                                : 'border border-[#A3A3A3] hover:border-gray-600'
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* 4. 操作・保存アクション */}
          <section className="px-5 lg:pl-8 lg:pr-6 py-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setAutoRotate((prev) => !prev)}
                className="btn-std flex-1 flex items-center justify-center gap-1.5"
              >
                <RotateCw className="w-3.5 h-3.5 text-gray-700" />
                <span>自動回転: {autoRotate ? 'ON' : 'OFF'}</span>
              </button>

              <button
                type="button"
                onClick={onResetCamera}
                className="btn-std flex-1 flex items-center justify-center gap-1.5"
                title="アクキーと背景の向きを初期状態に戻す"
              >
                <Maximize2 className="w-3.5 h-3.5 text-gray-700" />
                <span>向きをリセット</span>
              </button>
            </div>

            {/* 画像を保存ボタン（主操作 .btn-primary） */}
            <button
              type="button"
              onClick={onCaptureScreenshot}
              className="btn-primary w-full flex items-center justify-center gap-2"
              title="3Dモデルを画像として保存"
            >
              <Camera className="w-4 h-4" />
              <span>画像を保存</span>
            </button>
          </section>
        </div>
      </div>

      {/* 下端のグラデーションフェード（下にスクロール可能な項目がある場合に表示） */}
      <div
        className={`
          pointer-events-none absolute bottom-0 left-0 right-0 h-12
          bg-gradient-to-t from-white via-white/80 to-transparent
          flex items-end justify-center pb-1.5
          transition-opacity duration-300 ease-out z-10
          ${canScrollDown ? 'opacity-100' : 'opacity-0'}
        `}
      >
        <ChevronDown className="w-5 h-5 text-gray-400" />
      </div>
    </div>
  );
};
