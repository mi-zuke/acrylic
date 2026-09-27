/**
 * デバッグ用ライティング・マテリアル調整パラメータ
 */
export interface LightingDebugParams {
  exposure: number;               // 全体露出 (0.2 〜 3.0, 初期値: 1.25)
  ambientIntensity: number;       // 環境光強度 (0.0 〜 3.0, 初期値: 0.9)
  mainLightIntensity: number;     // メインライト (0.0 〜 4.0, 初期値: 1.5)
  fillLightIntensity: number;     // フィルライト (0.0 〜 3.0, 初期値: 0.9)
  rimLightIntensity: number;      // リムライト (0.0 〜 4.0, 初期値: 1.4)
  illustrationEnvMap: number;     // イラスト環境反射 (0.0 〜 3.0, 初期値: 0.1)
  illustrationRoughness: number;  // イラスト粗さ (0.4 固定)
  illustrationMetalness: number;  // イラスト金属感 (0.0 〜 1.0, 初期値: 0.0)
}

export const DEFAULT_LIGHTING_PARAMS: LightingDebugParams = {
  exposure: 1.25,
  ambientIntensity: 0.9,
  mainLightIntensity: 1.5,
  fillLightIntensity: 0.9,
  rimLightIntensity: 1.4,
  illustrationEnvMap: 0.1,
  illustrationRoughness: 0.4, // 0.4 固定
  illustrationMetalness: 0.0,
};
