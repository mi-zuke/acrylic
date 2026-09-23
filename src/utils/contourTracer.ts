import * as THREE from 'three';
import ClipperLib from 'clipper-lib';

const CLIPPER_SCALE = 1000;

export interface CutPathOptions {
  offsetMargin: number; // 最小余白ピクセル (例: 10〜45px)
  smoothness: number;   // 単純化・スムージング強度 (1〜5)
  holeOffsetX: number;  // 穴のX位置オフセット (-100〜100%)
  holeDiameter: number; // 穴の直径 (mm換算想定, 例: 3.2mm)
  tabHeight: number;    // 穴用タブの高さ (px)
  tabWidth: number;     // 穴用タブの幅 (px)
}

export interface BezierSegment {
  p0: THREE.Vector2;
  cp1: THREE.Vector2;
  cp2: THREE.Vector2;
  p1: THREE.Vector2;
  isSharpStart: boolean;
}

export interface GeneratedCutPath {
  shape: THREE.Shape;
  outlinePoints: THREE.Vector2[];
  bezierSegments: BezierSegment[];
  holeCenter: THREE.Vector2;
  holeRadius: number;
  width: number;
  height: number;
  previewCanvasUrl: string; // 2Dプレビュー用画像
  svgPathData: string;      // 曲線SVGパス (M ... C ... Z)
}

interface Point2D {
  x: number;
  y: number;
}

/**
 * 透過PNG画像からアルファ輪郭を抽出し、
 * ClipperLibのRound offset（最小余白）とコーナー保持ベジェ曲線により
 * 「曲線の集合」としてThree.js用Shapeを生成する
 */
export async function generateAcrylicCutPath(
  imageSource: HTMLImageElement,
  options: CutPathOptions
): Promise<GeneratedCutPath> {
  const {
    offsetMargin = 20,
    smoothness = 3,
    holeOffsetX = 0,
    holeDiameter = 3.2,
    tabHeight = 36,
    tabWidth = 44,
  } = options;

  // 1. 作業用オフスクリーンCanvas
  const pad = Math.max(offsetMargin + tabHeight + 40, 50);
  const origW = imageSource.naturalWidth || imageSource.width;
  const origH = imageSource.naturalHeight || imageSource.height;

  const maxDim = 600;
  const scale = Math.min(1, maxDim / Math.max(origW, origH));
  const workW = Math.round(origW * scale);
  const workH = Math.round(origH * scale);

  const canvasW = workW + pad * 2;
  const canvasH = workH + pad * 2;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  // 元画像を中央に描画
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.drawImage(imageSource, pad, pad, workW, workH);

  const imgData = ctx.getImageData(0, 0, canvasW, canvasH);

  // 2. アルファチャンネルから画像の輪郭ポリゴン（外周）を抽出
  const rawContour = extractContourAlpha(imgData, 20);

  // 画像内に画素がない場合のフォールバック（四角形）
  const basePolygon: Point2D[] = rawContour.length > 5 ? rawContour : [
    { x: pad, y: pad },
    { x: pad + workW, y: pad },
    { x: pad + workW, y: pad + workH },
    { x: pad, y: pad + workH },
  ];

  // 微細なピクセル階段ノイズを Douglas-Peucker で整理 (1.2px)
  const simplifiedBase = simplifyPolygonDP(basePolygon, 1.2);

  // 3. ClipperLib による「最小余白」Round offset 計算
  // 凸角は半径 offsetMargin の円弧、凹角は幾何学的な交差角になる
  const offsetPolygons = offsetPolygonWithClipper(simplifiedBase, offsetMargin);
  let mainOffsetPoly = offsetPolygons[0] || simplifiedBase;

  // 4. キーホルダー用タブ（丸穴用突起）の作成と結合
  // 画像の上部位置を特定
  let minY = canvasH, minX = canvasW, maxX = 0;
  for (const pt of simplifiedBase) {
    if (pt.y < minY) minY = pt.y;
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
  }
  const contentCenterX = (minX + maxX) / 2;
  const targetTabX = contentCenterX + (holeOffsetX / 100) * ((maxX - minX) * 0.4);

  // スケール計算（naturalLongest基準）
  const targetSizeWorld = 7.0; // 3D空間での基準長
  const naturalLongest = Math.max(workW, workH);
  const worldScale = targetSizeWorld / naturalLongest;

  // 穴のピクセル半径（holeDiameter mm想定、長辺70mm換算）
  const holeRPx = (holeDiameter / 2) * (naturalLongest / 70);

  // 穴のアクリル肉厚（最初の約1.3mmと直前の3.2mmを2:1の比重でブレンドした約2.0mmの肉厚）
  const wallThicknessPx = 2.0 * (naturalLongest / 70);
  const tabR = holeRPx + wallThicknessPx; // タブの外周半径

  // targetTabX 付近でのオフセットポリゴンの最上部Yを検索
  let localMinY = canvasH;
  for (const pt of mainOffsetPoly) {
    if (Math.abs(pt.x - targetTabX) < tabR * 0.9) {
      if (pt.y < localMinY) localMinY = pt.y;
    }
  }
  if (localMinY === canvasH) localMinY = minY - offsetMargin;

  // 穴の中心Y: 余計な空白を作らず、本体オフセットのすぐ上（絵柄に近い位置）に配置
  // 絵柄と穴の間の余白はコンパクトに抑えつつ、穴上端から外枠までの肉厚を確実に確保
  const tabCenterY = localMinY - holeRPx * 0.25;
  // タブの裾野を本体内部深くまで伸ばして確実にUnion結合
  const tabBottomY = localMinY + offsetMargin + 20;

  // タブポリゴン（半円突起＋接続台形）
  const tabPoly = createTabPolygon(targetTabX, tabCenterY, tabR, tabBottomY);

  // ClipperLib によるオフセット輪郭とタブの Union 結合
  const unionPaths = unionPolygons(mainOffsetPoly, tabPoly);
  const mergedOutline = unionPaths[0] || mainOffsetPoly;

  // 5. 頂点列の適度な整理（曲線の制御点生成用）
  // smoothness パラメータに応じた許容誤差 (0.8〜2.5px)
  const dpTolerance = 0.5 + smoothness * 0.35;
  const cleanOutline = simplifyPolygonDP(mergedOutline, dpTolerance);

  // 6. 「曲線の集合（Corner-preserving Bézier Curves）」の構築
  // 角（Sharp Corner）を検出し、角では非平滑な接続、曲線区間では滑らかなベジェ曲線セグメントを生成
  const bezierSegments = fitCornerPreservingBezier(cleanOutline, 45); // 45度以上は角とする

  // 7. Three.js 座標系への変換
  // 元画像の中央（pad + workW / 2, pad + workH / 2）を原点 (0, 0) とする
  const origCenterX = pad + workW / 2;
  const origCenterY = pad + workH / 2;

  const toWorld = (pt: Point2D): THREE.Vector2 => {
    return new THREE.Vector2(
      (pt.x - origCenterX) * worldScale,
      -(pt.y - origCenterY) * worldScale
    );
  };

  // Three.js の Shape 外枠の向き（CCW反時計回り）を確認
  const worldPoints: THREE.Vector2[] = cleanOutline.map(toWorld);
  const isClockwise = THREE.ShapeUtils.isClockWise(worldPoints);

  // 3次ベジェ曲線の集合から THREE.Shape を構築
  const shape = new THREE.Shape();
  const worldBezierSegments: BezierSegment[] = [];

  if (bezierSegments.length > 0) {
    // 向きが時計回りの場合は反転
    const segmentsToUse = isClockwise ? reverseBezierSegments(bezierSegments) : bezierSegments;

    const startPt = toWorld(segmentsToUse[0].p0);
    shape.moveTo(startPt.x, startPt.y);

    for (const seg of segmentsToUse) {
      const cp1 = toWorld(seg.cp1);
      const cp2 = toWorld(seg.cp2);
      const p1 = toWorld(seg.p1);

      shape.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p1.x, p1.y);

      worldBezierSegments.push({
        p0: toWorld(seg.p0),
        cp1,
        cp2,
        p1,
        isSharpStart: seg.isSharpStart,
      });
    }
    shape.closePath();
  } else {
    // フォールバック
    const p0 = toWorld(cleanOutline[0]);
    shape.moveTo(p0.x, p0.y);
    for (let i = 1; i < cleanOutline.length; i++) {
      const p = toWorld(cleanOutline[i]);
      shape.lineTo(p.x, p.y);
    }
    shape.closePath();
  }

  // 8. キーホルダー用の穴（Hole）の作成
  const holeWorldX = (targetTabX - origCenterX) * worldScale;
  const holeWorldY = -(tabCenterY - origCenterY) * worldScale;
  const holeWorldRadius = (holeDiameter / 2) * (targetSizeWorld / 70);

  // 穴も円弧パス（ベジェ曲線の集合）として構築
  const holePath = new THREE.Path();
  const holePoints: THREE.Vector2[] = [];
  const holeSegs = 32;
  for (let i = 0; i < holeSegs; i++) {
    const theta = (i / holeSegs) * Math.PI * 2;
    holePoints.push(new THREE.Vector2(
      holeWorldX + Math.cos(theta) * holeWorldRadius,
      holeWorldY + Math.sin(theta) * holeWorldRadius
    ));
  }
  // holes は時計回り (CW)
  if (!THREE.ShapeUtils.isClockWise(holePoints)) {
    holePoints.reverse();
  }
  holePoints.forEach((p, idx) => {
    if (idx === 0) holePath.moveTo(p.x, p.y);
    else holePath.lineTo(p.x, p.y);
  });
  holePath.closePath();
  shape.holes.push(holePath);

  // 9. 2DプレビューとSVGパスデータの生成
  // プレビューCanvas上にベジェ曲線の赤いカットラインを描画
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ef4444'; // 切断線（赤）
  ctx.beginPath();
  if (bezierSegments.length > 0) {
    ctx.moveTo(bezierSegments[0].p0.x, bezierSegments[0].p0.y);
    for (const seg of bezierSegments) {
      ctx.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.p1.x, seg.p1.y);
    }
  }
  ctx.closePath();
  ctx.stroke();

  // 穴のプレビュー
  ctx.beginPath();
  ctx.arc(targetTabX, tabCenterY, holeRPx, 0, Math.PI * 2);
  ctx.fillStyle = '#1e293b';
  ctx.fill();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // SVG パスデータ文字列 (M ... C ... Z)
  let svgD = '';
  if (bezierSegments.length > 0) {
    svgD = `M ${bezierSegments[0].p0.x.toFixed(2)} ${bezierSegments[0].p0.y.toFixed(2)}`;
    for (const seg of bezierSegments) {
      svgD += ` C ${seg.cp1.x.toFixed(2)} ${seg.cp1.y.toFixed(2)}, ${seg.cp2.x.toFixed(2)} ${seg.cp2.y.toFixed(2)}, ${seg.p1.x.toFixed(2)} ${seg.p1.y.toFixed(2)}`;
    }
    svgD += ' Z';
  }

  return {
    shape,
    outlinePoints: worldPoints,
    bezierSegments: worldBezierSegments,
    holeCenter: new THREE.Vector2(holeWorldX, holeWorldY),
    holeRadius: holeWorldRadius,
    width: workW * worldScale,
    height: workH * worldScale,
    previewCanvasUrl: canvas.toDataURL('image/png'),
    svgPathData: svgD,
  };
}

/**
 * アルファチャンネルから輪郭を抽出 (Illust-toolsのアルゴリズム)
 */
function extractContourAlpha(imageData: ImageData, alphaThreshold: number = 20): Point2D[] {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  const getAlpha = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    return data[(y * width + x) * 4 + 3];
  };

  // 上から下、左から右へ走査して最初の不透明ピクセルを見つける
  let startX = -1, startY = -1;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (getAlpha(x, y) >= alphaThreshold) {
        startX = x;
        startY = y;
        break outer;
      }
    }
  }

  if (startX === -1) return [];

  const contour: Point2D[] = [];
  // 方向: 0: 東, 1: 南東, 2: 南, 3: 南西, 4: 西, 5: 北西, 6: 北, 7: 北東
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  let currentX = startX;
  let currentY = startY;
  let currentDir = 7; // 初期方向: 北東

  const maxSteps = width * height;
  let steps = 0;

  do {
    contour.push({ x: currentX, y: currentY });

    let foundNext = false;
    // 左手壁沿い探索 (dir + 6 % 8)
    let dir = (currentDir + 6) % 8;

    for (let i = 0; i < 8; i++) {
      const nx = currentX + dx[dir];
      const ny = currentY + dy[dir];

      if (getAlpha(nx, ny) >= alphaThreshold) {
        currentX = nx;
        currentY = ny;
        currentDir = dir;
        foundNext = true;
        break;
      }
      dir = (dir + 1) % 8;
    }

    if (!foundNext) break;
    steps++;
  } while (!(currentX === startX && currentY === startY) && steps < maxSteps);

  return contour;
}

/**
 * ClipperLib を使った最小余白オフセット（Round Offset）
 */
function offsetPolygonWithClipper(points: Point2D[], margin: number): Point2D[][] {
  if (points.length < 3) return [];

  const path = points.map(p => ({
    X: Math.round(p.x * CLIPPER_SCALE),
    Y: Math.round(p.y * CLIPPER_SCALE),
  }));

  const paths = [path];
  ClipperLib.Clipper.SimplifyPolygons(paths, ClipperLib.PolyFillType.pftNonZero);

  const co = new ClipperLib.ClipperOffset();
  co.ArcTolerance = 0.4 * CLIPPER_SCALE; // 円弧のきめ細かさ
  co.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);

  const offsetPaths: Array<Array<{ X: number; Y: number }>> = [];
  co.Execute(offsetPaths, margin * CLIPPER_SCALE);

  return offsetPaths.map(poly =>
    poly.map(pt => ({
      x: pt.X / CLIPPER_SCALE,
      y: pt.Y / CLIPPER_SCALE,
    }))
  );
}

/**
 * 2つのポリゴンのブーリアン結合（Union）
 */
function unionPolygons(polyA: Point2D[], polyB: Point2D[]): Point2D[][] {
  const pathA = polyA.map(p => ({ X: Math.round(p.x * CLIPPER_SCALE), Y: Math.round(p.y * CLIPPER_SCALE) }));
  const pathB = polyB.map(p => ({ X: Math.round(p.x * CLIPPER_SCALE), Y: Math.round(p.y * CLIPPER_SCALE) }));

  const c = new ClipperLib.Clipper();
  c.AddPath(pathA, ClipperLib.PolyType.ptSubject, true);
  c.AddPath(pathB, ClipperLib.PolyType.ptClip, true);

  const solution: Array<Array<{ X: number; Y: number }>> = [];
  c.Execute(
    ClipperLib.ClipType.ctUnion,
    solution,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero
  );

  return solution.map(poly =>
    poly.map(pt => ({
      x: pt.X / CLIPPER_SCALE,
      y: pt.Y / CLIPPER_SCALE,
    }))
  );
}

/**
 * キーホルダー用穴タブ（半円突起＋接続台形）のポリゴンを生成
 */
function createTabPolygon(cx: number, cy: number, radius: number, bottomY: number): Point2D[] {
  const points: Point2D[] = [];
  const segments = 16;

  // 上部の半円（左から時計回りに上を通って右へ: angle = PI -> 0）
  for (let i = 0; i <= segments; i++) {
    const angle = Math.PI - (i / segments) * Math.PI;
    points.push({
      x: cx + Math.cos(angle) * radius,
      y: cy - Math.sin(angle) * radius, // 上向き（Yは小さい）
    });
  }

  // 右側の裾野（台形ブリッジ・本体と滑らかに結合）
  points.push({ x: cx + radius + 8, y: bottomY });
  // 左側の裾野
  points.push({ x: cx - radius - 8, y: bottomY });

  return points;
}

/**
 * コーナー（尖った角）を検出し、区分的3次ベジェ曲線セグメントの集合を生成
 * （曲線同士は角として非平滑に接続可能）
 */
function fitCornerPreservingBezier(
  points: Point2D[],
  cornerAngleThresholdDeg: number = 40
): { p0: Point2D; cp1: Point2D; cp2: Point2D; p1: Point2D; isSharpStart: boolean }[] {
  const n = points.length;
  if (n < 3) return [];

  const thresholdRad = (cornerAngleThresholdDeg * Math.PI) / 180;

  // 1. 各頂点が「角（Sharp Corner）」かどうかを判定
  const isCorner = new Array<boolean>(n).fill(false);

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;

    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);

    if (len1 === 0 || len2 === 0) continue;

    // 内積から方向転換角度（偏角）を計算
    const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
    const clampedDot = Math.max(-1, Math.min(1, dot));
    const angleTurn = Math.acos(clampedDot);

    // 角度変化が閾値以上なら角（Sharp Corner）
    if (angleTurn >= thresholdRad) {
      isCorner[i] = true;
    }
  }

  // 2. 各頂点での「前方接線」および「後方接線」を計算
  const tanForward: Point2D[] = new Array(n);
  const tanBackward: Point2D[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    if (isCorner[i]) {
      // 角の場合：接線を滑らかに連続させず、前後のエッジ方向をそのまま使う（鋭角を保つ）
      const fDist = Math.hypot(next.x - curr.x, next.y - curr.y);
      tanForward[i] = fDist > 0
        ? { x: (next.x - curr.x) / fDist, y: (next.y - curr.y) / fDist }
        : { x: 0, y: 0 };

      const bDist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      tanBackward[i] = bDist > 0
        ? { x: (curr.x - prev.x) / bDist, y: (curr.y - prev.y) / bDist }
        : { x: 0, y: 0 };
    } else {
      // 滑らかな曲線区間：Catmull-Rom 中心差分接線
      const chordX = next.x - prev.x;
      const chordY = next.y - prev.y;
      const cDist = Math.hypot(chordX, chordY);
      const unitTan = cDist > 0
        ? { x: chordX / cDist, y: chordY / cDist }
        : { x: 0, y: 0 };

      tanForward[i] = unitTan;
      tanBackward[i] = unitTan;
    }
  }

  // 3. 各区間 (i -> i+1) を3次ベジェ曲線セグメントとして構築
  const segments: { p0: Point2D; cp1: Point2D; cp2: Point2D; p1: Point2D; isSharpStart: boolean }[] = [];

  for (let i = 0; i < n; i++) {
    const nextIdx = (i + 1) % n;
    const p0 = points[i];
    const p1 = points[nextIdx];

    const segDist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const handleLen = segDist / 3;

    // 制御点 1: p0 から tanForward 方向に handleLen
    const cp1 = {
      x: p0.x + tanForward[i].x * handleLen,
      y: p0.y + tanForward[i].y * handleLen,
    };

    // 制御点 2: p1 から tanBackward 逆方向に handleLen
    const cp2 = {
      x: p1.x - tanBackward[nextIdx].x * handleLen,
      y: p1.y - tanBackward[nextIdx].y * handleLen,
    };

    segments.push({
      p0,
      cp1,
      cp2,
      p1,
      isSharpStart: isCorner[i],
    });
  }

  return segments;
}

/**
 * ベジェ曲線セグメント列の反転（向きの調整用）
 */
function reverseBezierSegments(
  segs: { p0: Point2D; cp1: Point2D; cp2: Point2D; p1: Point2D; isSharpStart: boolean }[]
): { p0: Point2D; cp1: Point2D; cp2: Point2D; p1: Point2D; isSharpStart: boolean }[] {
  const reversed = [];
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    reversed.push({
      p0: s.p1,
      cp1: s.cp2,
      cp2: s.cp1,
      p1: s.p0,
      isSharpStart: s.isSharpStart,
    });
  }
  return reversed;
}

/**
 * Douglas-Peucker アルゴリズムによるポリゴン頂点の単純化
 */
function simplifyPolygonDP(points: Point2D[], epsilon: number): Point2D[] {
  if (points.length < 3) return points;

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const rec1 = simplifyPolygonDP(points.slice(0, index + 1), epsilon);
    const rec2 = simplifyPolygonDP(points.slice(index), epsilon);
    return rec1.slice(0, rec1.length - 1).concat(rec2);
  } else {
    return [points[0], points[end]];
  }
}

function perpendicularDistance(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const num = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x);
  return num / Math.sqrt(lenSq);
}
