/**
 * 初回読み込み時やテスト用に利用できる高品質な透過PNGサンプルを動的生成
 */

export interface SampleImage {
  id: string;
  name: string;
  generateUrl: () => string;
}

// サンプル1: かわいい猫のマスコット
function createCatMascot(): string {
  const canvas = document.createElement('canvas');
  const size = 512;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const cx = size / 2;
  const cy = size / 2 + 20;

  // 顔のベース
  ctx.save();
  // 耳 (左)
  ctx.fillStyle = '#ffb3ba';
  ctx.beginPath();
  ctx.moveTo(cx - 120, cy - 60);
  ctx.lineTo(cx - 160, cy - 180);
  ctx.lineTo(cx - 40, cy - 120);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#ff8090';
  ctx.stroke();

  // 耳 (右)
  ctx.beginPath();
  ctx.moveTo(cx + 120, cy - 60);
  ctx.lineTo(cx + 160, cy - 180);
  ctx.lineTo(cx + 40, cy - 120);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 顔輪郭
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 140, 120, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 10;
  ctx.stroke();

  // ほっぺピンク
  ctx.fillStyle = '#ffccd5';
  ctx.beginPath();
  ctx.ellipse(cx - 85, cy + 25, 25, 16, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 85, cy + 25, 25, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  // 目
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.ellipse(cx - 50, cy - 10, 15, 22, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 50, cy - 10, 15, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // 目のハイライト
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx - 54, cy - 18, 6, 0, Math.PI * 2);
  ctx.arc(cx + 46, cy - 18, 6, 0, Math.PI * 2);
  ctx.arc(cx - 46, cy - 4, 3, 0, Math.PI * 2);
  ctx.arc(cx + 54, cy - 4, 3, 0, Math.PI * 2);
  ctx.fill();

  // 鼻と口
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 10);
  ctx.lineTo(cx - 16, cy + 28);
  ctx.lineTo(cx, cy + 22);
  ctx.lineTo(cx + 16, cy + 28);
  ctx.closePath();
  ctx.fillStyle = '#ff8090';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx - 14, cy + 38, 14, Math.PI * 0.1, Math.PI * 0.9, false);
  ctx.arc(cx + 14, cy + 38, 14, Math.PI * 0.1, Math.PI * 0.9, false);
  ctx.stroke();

  // ひげ
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx - 90, cy + 10);
  ctx.lineTo(cx - 150, cy + 0);
  ctx.moveTo(cx - 90, cy + 25);
  ctx.lineTo(cx - 150, cy + 30);
  ctx.moveTo(cx + 90, cy + 10);
  ctx.lineTo(cx + 150, cy + 0);
  ctx.moveTo(cx + 90, cy + 25);
  ctx.lineTo(cx + 150, cy + 30);
  ctx.stroke();

  // 首のリボン＆鈴
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.ellipse(cx - 40, cy + 115, 25, 14, -0.3, 0, Math.PI * 2);
  ctx.ellipse(cx + 40, cy + 115, 25, 14, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#b91c1c';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(cx, cy + 115, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#b45309';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.restore();
  return canvas.toDataURL('image/png');
}

// サンプル2: ポップな星のキャラクター
function createStarMascot(): string {
  const canvas = document.createElement('canvas');
  const size = 512;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const cx = size / 2;
  const cy = size / 2;

  ctx.save();
  // 5角の星
  ctx.beginPath();
  const outerR = 170;
  const innerR = 85;
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  // グラデーション塗りつぶし
  const grad = ctx.createLinearGradient(cx - outerR, cy - outerR, cx + outerR, cy + outerR);
  grad.addColorStop(0, '#fde047');
  grad.addColorStop(1, '#f97316');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#ca8a04';
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // にっこり笑顔
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(cx - 40, cy - 10, 12, 0, Math.PI * 2);
  ctx.arc(cx + 40, cy - 10, 12, 0, Math.PI * 2);
  ctx.fill();

  // ハイライト
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx - 43, cy - 14, 4, 0, Math.PI * 2);
  ctx.arc(cx + 37, cy - 14, 4, 0, Math.PI * 2);
  ctx.fill();

  // ほっぺ
  ctx.fillStyle = '#fb7185';
  ctx.beginPath();
  ctx.ellipse(cx - 55, cy + 15, 14, 9, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 55, cy + 15, 14, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // お口
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy + 10, 20, 0.2 * Math.PI, 0.8 * Math.PI, false);
  ctx.stroke();

  ctx.restore();
  return canvas.toDataURL('image/png');
}

// サンプル3: レトロ喫茶クリームソーダ
function createCreamSoda(): string {
  const canvas = document.createElement('canvas');
  const size = 512;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const cx = size / 2;
  const cy = size / 2 + 20;

  ctx.save();
  // グラス本体
  ctx.beginPath();
  ctx.moveTo(cx - 70, cy - 80);
  ctx.lineTo(cx - 50, cy + 100);
  ctx.quadraticCurveTo(cx - 40, cy + 120, cx, cy + 120);
  ctx.quadraticCurveTo(cx + 40, cy + 120, cx + 50, cy + 100);
  ctx.lineTo(cx + 70, cy - 80);
  ctx.closePath();

  // メロンソーダの緑グラデ
  const sodaGrad = ctx.createLinearGradient(0, cy - 80, 0, cy + 120);
  sodaGrad.addColorStop(0, '#34d399');
  sodaGrad.addColorStop(1, '#059669');
  ctx.fillStyle = sodaGrad;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#047857';
  ctx.stroke();

  // 泡
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  [
    { x: cx - 20, y: cy + 40, r: 8 },
    { x: cx + 15, y: cy + 70, r: 6 },
    { x: cx - 30, y: cy - 20, r: 5 },
    { x: cx + 25, y: cy + 10, r: 7 },
  ].forEach(b => {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  });

  // バニラアイスクリーム
  ctx.beginPath();
  ctx.arc(cx, cy - 85, 55, Math.PI * 0.9, Math.PI * 2.1);
  ctx.fillStyle = '#fef3c7';
  ctx.fill();
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 6;
  ctx.stroke();

  // さくらんぼ
  ctx.beginPath();
  ctx.arc(cx + 35, cy - 130, 20, 0, Math.PI * 2);
  ctx.fillStyle = '#dc2626';
  ctx.fill();
  ctx.strokeStyle = '#991b1b';
  ctx.lineWidth = 5;
  ctx.stroke();

  // さくらんぼの軸
  ctx.beginPath();
  ctx.moveTo(cx + 35, cy - 145);
  ctx.quadraticCurveTo(cx + 50, cy - 180, cx + 25, cy - 190);
  ctx.strokeStyle = '#4b5563';
  ctx.lineWidth = 4;
  ctx.stroke();

  // ストロー
  ctx.beginPath();
  ctx.moveTo(cx - 30, cy + 60);
  ctx.lineTo(cx - 50, cy - 170);
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#ef4444';
  ctx.stroke();

  ctx.restore();
  return canvas.toDataURL('image/png');
}

export const SAMPLE_IMAGES: SampleImage[] = [
  { id: 'cat', name: '🐱 ねこマスコット', generateUrl: createCatMascot },
  { id: 'star', name: '⭐ おほしさま', generateUrl: createStarMascot },
  { id: 'soda', name: '🍹 クリームソーダ', generateUrl: createCreamSoda },
];
