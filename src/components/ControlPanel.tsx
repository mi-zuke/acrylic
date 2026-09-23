import React, { useRef, useState } from 'react';
import {
  Camera,
  RotateCw,
  Palette,
  Sliders,
  Maximize2,
  Globe,
  Upload,
  Sun,
  RotateCcw,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { CutPathOptions, GeneratedCutPath } from '../utils/contourTracer';
import { SAMPLE_IMAGES } from '../utils/sampleImages';
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
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  options,
  onOptionsChange,
  onImageUpload,
  useSample,
  onUseSampleChange,
  cutPath,
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
  illustrationEnvInfluence,
  setIllustrationEnvInfluence,
  lightingParams,
  onLightingParamsChange,
  onResetLighting,
  onCaptureScreenshot,
  onResetCamera,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDebugLighting, setShowDebugLighting] = useState(true);

  // スライダーの左側を白よりのグレーで塗るトラック背景グラデーション
  const getSliderTrackStyle = (val: number, min: number, max: number) => {
    const percent = Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
    return {
      background: `linear-gradient(to right, #8c8c8c 0%, #8c8c8c ${percent}%, #e5e7eb ${percent}%, #e5e7eb 100%)`,
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
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
    <div className="w-full bg-white flex flex-col h-full overflow-y-auto text-gray-800">
      <div className="p-6 space-y-6 text-sm text-gray-700">
        {/* 1. 画像アップロード & サンプル */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-900 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-gray-700" />
              画像読み込み
            </span>

            {/* サンプルを使用チェックボックス */}
            <label className="flex items-center gap-1.5 cursor-pointer text-[13px] text-gray-600 hover:text-gray-900 transition-colors">
              <input
                type="checkbox"
                checked={useSample}
                onChange={(e) => onUseSampleChange(e.target.checked)}
                className="w-3.5 h-3.5 rounded-none border-gray-400 text-gray-800 focus:ring-0 cursor-pointer"
              />
              <span className={useSample ? 'text-gray-900 font-medium' : 'text-gray-600'}>
                サンプルを使用
              </span>
            </label>
          </div>

          {/* 四角いグレーのファイル選択ボタン */}
          <div className="flex items-center gap-2.5">
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
              className="px-3.5 py-1.5 bg-[#e8e8e8] hover:bg-[#dedede] active:bg-[#d4d4d4] text-gray-900 text-xs font-medium rounded-none border border-gray-300 shadow-sm transition-colors whitespace-nowrap cursor-pointer"
            >
              画像を選択
            </button>
            <span className="text-[13px] text-gray-500 truncate">
              {useSample ? 'サンプル' : 'カスタム画像'}
            </span>
          </div>
        </section>

        <hr className="border-t-2 border-gray-300 -mx-6" />

        {/* 2. アクキー設定 */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-900 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-gray-700" />
              キーホルダー
            </span>
          </div>

          {/* 最小余白スライダー */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[13px]">
              <span className="text-gray-600">余白の大きさ</span>
              <span className="text-gray-800 font-semibold">{options.offsetMargin} px</span>
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
              <span className="text-gray-800 font-semibold">{acrylicThickness} mm</span>
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
              <span className="text-gray-800 font-semibold">
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
        </section>

        <hr className="border-t-2 border-gray-300 -mx-6" />

        {/* 4. 3Dビュー・背景と環境光 ＆ 背景色 */}
        <section className="space-y-3.5">
          {/* 背景と環境光プリセット */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-900 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-gray-700" />
                背景と環境光
              </span>
            </div>

            {/* 天球プルダウン選択（背景は白） */}
            <div className="relative">
              <select
                value={envPreset}
                onChange={(e) => setEnvPreset(e.target.value as EnvironmentPreset)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-none text-sm font-medium text-gray-800 shadow-sm focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 cursor-pointer appearance-none transition-colors"
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
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-500">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                  <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                </svg>
              </div>
            </div>

            {/* 光の強さスライダー（内部的にはMetalnessを 100(最明: metalness 0.00) -> 0(暗/金属反射: metalness 1.00) に逆転・引き伸ばしマッピング） */}
            {(() => {
              const brightness = Math.round((1.0 - lightingParams.illustrationMetalness) * 100);
              return (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-gray-600">光の強さ</span>
                    <span className="text-gray-800 font-semibold">{brightness}</span>
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
          </div>

          {/* 背景（天球背景がOFFの時に単色背景を表示） ＆ パノラマ表示 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-900 flex items-center gap-1.5">
                <Palette className="w-4 h-4 text-gray-700" />
                背景
              </span>

              {/* 天球パノラマ背景の表示切替トグル */}
              <label className="flex items-center gap-1.5 cursor-pointer text-[13px] text-gray-900 transition-colors">
                <input
                  type="checkbox"
                  checked={showSkyboxBg}
                  onChange={(e) => setShowSkyboxBg(e.target.checked)}
                  className="w-3.5 h-3.5 rounded-none border-gray-400 text-gray-800 focus:ring-0 cursor-pointer"
                />
                <span className="text-gray-900 font-medium">
                  パノラマ表示
                </span>
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
                      onClick={() => setBackgroundColor(color)}
                      title={color.toUpperCase()}
                      className={`h-7 w-full rounded-none border transition-all cursor-pointer relative ${
                        isSelected
                          ? 'border-gray-300 scale-[1.14] z-10 shadow-sm'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <hr className="border-t-2 border-gray-300 -mx-6" />

        {/* 4. 操作・保存 */}
        <section className="space-y-3.5">
          <div className="flex items-center justify-between">
              <button
                onClick={() => setAutoRotate((prev) => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-none border border-gray-300 bg-[#e8e8e8] hover:bg-[#dedede] text-gray-800 font-medium text-xs transition-colors cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5 text-gray-700" />
                <span>自動回転: {autoRotate ? 'ON' : 'OFF'}</span>
              </button>

              <button
                onClick={onResetCamera}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#e8e8e8] hover:bg-[#dedede] active:bg-[#d4d4d4] border border-gray-300 text-gray-900 rounded-none text-xs font-medium transition-colors cursor-pointer shadow-sm"
                title="アクキーと背景の向きを初期状態に戻す"
              >
                <Maximize2 className="w-3.5 h-3.5 text-gray-700" />
                <span>向きをリセット</span>
              </button>
            </div>

            {/* 画像を保存ボタン */}
            <button
              onClick={onCaptureScreenshot}
              className="w-full flex items-center justify-center gap-2 py-2 bg-[#e8e8e8] hover:bg-[#dedede] active:bg-[#d4d4d4] text-gray-900 font-medium text-xs rounded-none border border-gray-300 transition-colors shadow-sm cursor-pointer"
              title="3Dモデルを画像として保存"
            >
              <Camera className="w-4 h-4 text-gray-700" />
              <span>画像を保存</span>
            </button>
        </section>

        {/* ===== 将来の再調整用に保持しているライティング調整デバッグパネル ===== */}
        {/*
        <hr className="border-gray-200" />
        <section className="space-y-3 pb-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowDebugLighting((prev) => !prev)}
              className="font-semibold text-gray-900 flex items-center gap-1.5 cursor-pointer hover:text-gray-700 transition-colors"
            >
              <Sun className="w-4 h-4 text-amber-500" />
              <span>ライティング調整 (デバッグ)</span>
              {showDebugLighting ? (
                <ChevronUp className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </button>

            <button
              type="button"
              onClick={onResetLighting}
              className="flex items-center gap-1 px-2.5 py-1 bg-[#e8e8e8] hover:bg-[#dedede] active:bg-[#d4d4d4] border border-gray-300 text-gray-800 rounded-none text-xs font-medium transition-colors cursor-pointer shadow-sm"
              title="ライティング設定を初期値に戻す"
            >
              <RotateCcw className="w-3 h-3 text-gray-700" />
              <span>初期化</span>
            </button>
          </div>

          {showDebugLighting && (
            <div className="space-y-3 pt-1">
              // 1. 全体露出
              <div className="space-y-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-gray-600">全体露出 (Exposure)</span>
                  <span className="text-gray-800 font-semibold">{lightingParams.exposure.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.05"
                  value={lightingParams.exposure}
                  onChange={(e) => onLightingParamsChange({ ...lightingParams, exposure: Number(e.target.value) })}
                  className="custom-slider"
                  style={getSliderTrackStyle(lightingParams.exposure, 0.2, 3.0)}
                />
              </div>

              // 2. 環境光強度
              <div className="space-y-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-gray-600">環境光 (Ambient Light)</span>
                  <span className="text-gray-800 font-semibold">{lightingParams.ambientIntensity.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="3.0"
                  step="0.05"
                  value={lightingParams.ambientIntensity}
                  onChange={(e) => onLightingParamsChange({ ...lightingParams, ambientIntensity: Number(e.target.value) })}
                  className="custom-slider"
                  style={getSliderTrackStyle(lightingParams.ambientIntensity, 0.0, 3.0)}
                />
              </div>

              // 3. メインライト
              <div className="space-y-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-gray-600">メインライト (Main Light)</span>
                  <span className="text-gray-800 font-semibold">{lightingParams.mainLightIntensity.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="4.0"
                  step="0.05"
                  value={lightingParams.mainLightIntensity}
                  onChange={(e) => onLightingParamsChange({ ...lightingParams, mainLightIntensity: Number(e.target.value) })}
                  className="custom-slider"
                  style={getSliderTrackStyle(lightingParams.mainLightIntensity, 0.0, 4.0)}
                />
              </div>

              // 4. フィルライト
              <div className="space-y-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-gray-600">フィルライト (Fill Light)</span>
                  <span className="text-gray-800 font-semibold">{lightingParams.fillLightIntensity.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="3.0"
                  step="0.05"
                  value={lightingParams.fillLightIntensity}
                  onChange={(e) => onLightingParamsChange({ ...lightingParams, fillLightIntensity: Number(e.target.value) })}
                  className="custom-slider"
                  style={getSliderTrackStyle(lightingParams.fillLightIntensity, 0.0, 3.0)}
                />
              </div>

              // 5. リムライト
              <div className="space-y-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-gray-600">リムライト (Rim Light)</span>
                  <span className="text-gray-800 font-semibold">{lightingParams.rimLightIntensity.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="4.0"
                  step="0.05"
                  value={lightingParams.rimLightIntensity}
                  onChange={(e) => onLightingParamsChange({ ...lightingParams, rimLightIntensity: Number(e.target.value) })}
                  className="custom-slider"
                  style={getSliderTrackStyle(lightingParams.rimLightIntensity, 0.0, 4.0)}
                />
              </div>

              // 6. イラスト環境反射
              <div className="space-y-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-gray-600">イラスト環境反射 (EnvMap)</span>
                  <span className="text-gray-800 font-semibold">{lightingParams.illustrationEnvMap.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="3.0"
                  step="0.05"
                  value={lightingParams.illustrationEnvMap}
                  onChange={(e) => onLightingParamsChange({ ...lightingParams, illustrationEnvMap: Number(e.target.value) })}
                  className="custom-slider"
                  style={getSliderTrackStyle(lightingParams.illustrationEnvMap, 0.0, 3.0)}
                />
              </div>

              // 7. イラスト表面粗さ (現在0.40に固定中)
              <div className="space-y-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-gray-600">イラスト粗さ (Roughness: 0.40固定)</span>
                  <span className="text-gray-800 font-semibold">{lightingParams.illustrationRoughness.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.02"
                  value={lightingParams.illustrationRoughness}
                  onChange={(e) => onLightingParamsChange({ ...lightingParams, illustrationRoughness: Number(e.target.value) })}
                  className="custom-slider"
                  style={getSliderTrackStyle(lightingParams.illustrationRoughness, 0.0, 1.0)}
                />
              </div>
            </div>
          )}
        </section>
        */}
      </div>
    </div>
  );
};
