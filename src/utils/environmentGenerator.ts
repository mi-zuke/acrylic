import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

export type EnvironmentPreset =
  | 'studio'
  | 'lebombo'
  | 'outdoor'
  | 'sunset'
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
    id: 'outdoor',
    name: '青空・自然',
    category: '屋外',
    icon: '🌳',
    description: '晴天の太陽光と大自然の澄み切った光',
    hdrFile: '/environments/quarry_01_2k.hdr',
  },
  {
    id: 'lebombo',
    name: '山岳・丘陵（レボンボ）',
    category: '屋外',
    icon: '⛰️',
    description: '晴天の澄んだ光と広大な山並みの風景',
    hdrFile: '/environments/lebombo_2k.hdr',
  },
  {
    id: 'sunset',
    name: '黄金の夕景',
    category: '夕景',
    icon: '🌇',
    description: 'ヴェネツィアの運河に沈むドラマチックな夕日',
    hdrFile: '/environments/venice_sunset_2k.hdr',
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
    hdrFile: '/environments/pedestrian_overpass_2k.hdr',
  },
  {
    id: 'night',
    name: '満天の星空',
    category: '夜景',
    icon: '🌌',
    description: '静寂の夜空に瞬く無数の星々のきらめき',
    hdrFile: '/environments/moonless_golf_2k.hdr',
  },
];

/**
 * プロシージャル Equirectangular パノラマ天球テクスチャの生成
 * （オフライン時やHDR非対応時のフォールバックとしても機能）
 */
export function createEnvironmentCanvas(preset: EnvironmentPreset): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  const w = canvas.width;
  const h = canvas.height;
  const horizon = h * 0.52;

  // デフォルト・スタジオプロシージャル（studio またはフォールバック用）
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
