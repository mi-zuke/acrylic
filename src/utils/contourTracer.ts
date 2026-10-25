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
  shapes: THREE.Shape[];
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

  // 2. アルファチャンネルから画像のすべての連結成分（島）の輪郭ポリゴンを抽出
  const rawContours = extractAllContoursAlpha(imgData, 20);

  // 画像内に有効な輪郭がない場合のフォールバック（四角形）
  const basePolygons: Point2D[][] = rawContours.length > 0 ? rawContours : [
    [
      { x: pad, y: pad },
      { x: pad + workW, y: pad },
      { x: pad + workW, y: pad + workH },
      { x: pad, y: pad + workH },
    ]
  ];

  // 微細なピクセル階段ノイズを閉曲線対応 Douglas-Peucker で整理 (1.2px)
  const simplifiedBases = basePolygons
    .map(poly => {
      const simplified = simplifyClosedPolygonDP(poly, 1.2);
      return simplified.length >= 3 ? simplified : poly;
    })
    .filter(poly => poly.length >= 3);

  const finalBases = simplifiedBases.length > 0 ? simplifiedBases : basePolygons;

  // 3. ClipperLib による「最小余白」Round offset 計算（すべての島を同時にオフセット）
  // 近接する島は自動的にマージされ、離れた島はそれぞれ独立したオフセットポリゴンとなる
  const offsetExPolys = offsetPolygonsWithClipper(finalBases, offsetMargin);

  // 4. キーホルダー用タブ（丸穴用突起）の作成と結合
  // 全要素の上部および左右の範囲を特定
  let minY = canvasH, minX = canvasW, maxX = 0;
  for (const base of finalBases) {
    for (const pt of base) {
      if (pt.y < minY) minY = pt.y;
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
    }
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

  // targetTabX 付近でのオフセットポリゴンの最上部Yを検索（全オフセットポリゴンから探索）
  let localMinY = canvasH;
  let effectiveTabX = targetTabX;

  for (const ep of offsetExPolys) {
    for (const pt of ep.outer) {
      const px = pt.X / CLIPPER_SCALE;
      const py = pt.Y / CLIPPER_SCALE;
      if (Math.abs(px - targetTabX) < tabR * 0.9) {
        if (py < localMinY) localMinY = py;
      }
    }
  }

  // もし targetTabX 直下にアクリルが存在しない場合（空白の隙間にある場合）：
  // 最寄りの島の最上部（ピーク）に安全にスナップし、中空浮きや側部への偏りを防止
  if (localMinY === canvasH && offsetExPolys.length > 0) {
    let bestIsland = offsetExPolys[0];
    let bestScore = Infinity;

    for (const ep of offsetExPolys) {
      let islandMinX = Infinity, islandMaxX = -Infinity;
      let islandMinY = Infinity;
      for (const pt of ep.outer) {
        const px = pt.X / CLIPPER_SCALE;
        const py = pt.Y / CLIPPER_SCALE;
        if (px < islandMinX) islandMinX = px;
        if (px > islandMaxX) islandMaxX = px;
        if (py < islandMinY) islandMinY = py;
      }

      // targetTabX からの水平距離
      let hDist = 0;
      if (targetTabX < islandMinX) hDist = islandMinX - targetTabX;
      else if (targetTabX > islandMaxX) hDist = targetTabX - islandMaxX;

      // 距離を優先しつつ、より上部にある島を優先
      const score = hDist + islandMinY * 0.1;
      if (score < bestScore) {
        bestScore = score;
        bestIsland = ep;
      }
    }

    // bestIsland の最上部（ピーク）の X 座標を決定
    let islandMinY = Infinity;
    for (const pt of bestIsland.outer) {
      const py = pt.Y / CLIPPER_SCALE;
      if (py < islandMinY) islandMinY = py;
    }

    // islandMinY 付近の頂点範囲からピークXを決定（丸い島では頂点中央、平らな上辺では端から内側にクランプ）
    let peakMinX = Infinity, peakMaxX = -Infinity;
    for (const pt of bestIsland.outer) {
      const px = pt.X / CLIPPER_SCALE;
      const py = pt.Y / CLIPPER_SCALE;
      if (py <= islandMinY + 2) {
        if (px < peakMinX) peakMinX = px;
        if (px > peakMaxX) peakMaxX = px;
      }
    }

    if (peakMinX <= peakMaxX) {
      const peakCenterX = (peakMinX + peakMaxX) / 2;
      const safeLeft = Math.min(peakCenterX, peakMinX + tabR * 0.5);
      const safeRight = Math.max(peakCenterX, peakMaxX - tabR * 0.5);
      effectiveTabX = Math.max(safeLeft, Math.min(safeRight, targetTabX));
    } else {
      effectiveTabX = targetTabX;
    }

    localMinY = canvasH;
    for (const pt of bestIsland.outer) {
      const px = pt.X / CLIPPER_SCALE;
      const py = pt.Y / CLIPPER_SCALE;
      if (Math.abs(px - effectiveTabX) < tabR * 0.9) {
        if (py < localMinY) localMinY = py;
      }
    }
    if (localMinY === canvasH) localMinY = islandMinY;
  }

  // 穴の中心Y: 余計な空白を作らず、本体オフセットのすぐ上（絵柄に近い位置）に配置
  const tabCenterY = localMinY - holeRPx * 0.25;
  // タブの裾野を本体内部深くまで伸ばして確実にUnion結合
  const tabBottomY = localMinY + offsetMargin + 20;

  // タブポリゴン（半円突起＋接続台形）
  const tabPoly = createTabPolygon(effectiveTabX, tabCenterY, tabR, tabBottomY);

  // ClipperLib によるオフセット輪郭群とタブの Union 結合
  const mergedExPolys = unionExPolygonsWithTab(offsetExPolys, tabPoly);

  // 5. 頂点列の適度な整理とベジェ曲線の構築
  const dpTolerance = 0.5 + smoothness * 0.35;
  const origCenterX = pad + workW / 2;
  const origCenterY = pad + workH / 2;

  const toWorld = (pt: Point2D): THREE.Vector2 => {
    return new THREE.Vector2(
      (pt.x - origCenterX) * worldScale,
      -(pt.y - origCenterY) * worldScale
    );
  };

  const holeWorldX = (effectiveTabX - origCenterX) * worldScale;
  const holeWorldY = -(tabCenterY - origCenterY) * worldScale;
  const holeWorldRadius = (holeDiameter / 2) * (targetSizeWorld / 70);

  // キーホルダー穴のパス（ベジェ曲線の集合）を生成
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
  // Three.js の holes は時計回り (CW)
  if (!THREE.ShapeUtils.isClockWise(holePoints)) {
    holePoints.reverse();
  }
  holePoints.forEach((p, idx) => {
    if (idx === 0) holePath.moveTo(p.x, p.y);
    else holePath.lineTo(p.x, p.y);
  });
  holePath.closePath();

  // キーホルダー穴の位置判定用 IntPoint
  const holeIntPoint: ClipperLib.IntPoint = {
    X: Math.round(effectiveTabX * CLIPPER_SCALE),
    Y: Math.round(tabCenterY * CLIPPER_SCALE),
  };

  // キーホルダー穴を付与すべき最適なポリゴンのインデックスを特定
  let bestHolePolyIdx = 0;
  let bestHoleDist = Infinity;
  for (let i = 0; i < mergedExPolys.length; i++) {
    const ep = mergedExPolys[i];
    const isInside = ClipperLib.Clipper.PointInPolygon(holeIntPoint, ep.outer) !== 0;
    if (isInside) {
      bestHolePolyIdx = i;
      break;
    }
    for (const pt of ep.outer) {
      const d = (pt.X - holeIntPoint.X) ** 2 + (pt.Y - holeIntPoint.Y) ** 2;
      if (d < bestHoleDist) {
        bestHoleDist = d;
        bestHolePolyIdx = i;
      }
    }
  }

  const allShapes: THREE.Shape[] = [];
  const allWorldBezierSegments: BezierSegment[] = [];
  const allWorldPoints: THREE.Vector2[] = [];
  const canvasBezierLoops: { p0: Point2D; cp1: Point2D; cp2: Point2D; p1: Point2D; isSharpStart: boolean }[][] = [];
  let holePlaced = false;

  for (let idx = 0; idx < mergedExPolys.length; idx++) {
    const ep = mergedExPolys[idx];
    const outerPts: Point2D[] = ep.outer.map(pt => ({
      x: pt.X / CLIPPER_SCALE,
      y: pt.Y / CLIPPER_SCALE,
    }));
    if (outerPts.length < 3) continue;

    const cleanOuter = simplifyClosedPolygonDP(outerPts, dpTolerance);
    if (cleanOuter.length < 3) continue;

    const bezierSegments = fitCornerPreservingBezier(cleanOuter, 45);
    canvasBezierLoops.push(bezierSegments);

    const worldPoints: THREE.Vector2[] = cleanOuter.map(toWorld);
    const isClockwise = THREE.ShapeUtils.isClockWise(worldPoints);

    const shape = new THREE.Shape();
    if (bezierSegments.length > 0) {
      const segmentsToUse = isClockwise ? reverseBezierSegments(bezierSegments) : bezierSegments;
      const startPt = toWorld(segmentsToUse[0].p0);
      shape.moveTo(startPt.x, startPt.y);

      for (const seg of segmentsToUse) {
        const cp1 = toWorld(seg.cp1);
        const cp2 = toWorld(seg.cp2);
        const p1 = toWorld(seg.p1);
        shape.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p1.x, p1.y);

        allWorldBezierSegments.push({
          p0: toWorld(seg.p0),
          cp1,
          cp2,
          p1,
          isSharpStart: seg.isSharpStart,
        });
      }
      shape.closePath();
    } else {
      const p0 = toWorld(cleanOuter[0]);
      shape.moveTo(p0.x, p0.y);
      for (let i = 1; i < cleanOuter.length; i++) {
        const p = toWorld(cleanOuter[i]);
        shape.lineTo(p.x, p.y);
      }
      shape.closePath();
    }

    worldPoints.forEach(p => allWorldPoints.push(p));

    // 内側の穴 (holes) があれば処理
    if (ep.holes && ep.holes.length > 0) {
      for (const hole of ep.holes) {
        const holePts: Point2D[] = hole.map(pt => ({
          x: pt.X / CLIPPER_SCALE,
          y: pt.Y / CLIPPER_SCALE,
        }));
        if (holePts.length < 3) continue;

        const cleanHole = simplifyClosedPolygonDP(holePts, dpTolerance);
        if (cleanHole.length < 3) continue;

        const holeBezier = fitCornerPreservingBezier(cleanHole, 45);
        canvasBezierLoops.push(holeBezier);

        const holeWorldPts = cleanHole.map(toWorld);
        const holeIsCw = THREE.ShapeUtils.isClockWise(holeWorldPts);
        const holeSegsToUse = !holeIsCw ? reverseBezierSegments(holeBezier) : holeBezier;

        const innerHolePath = new THREE.Path();
        if (holeSegsToUse.length > 0) {
          const startHolePt = toWorld(holeSegsToUse[0].p0);
          innerHolePath.moveTo(startHolePt.x, startHolePt.y);
          for (const seg of holeSegsToUse) {
            const cp1 = toWorld(seg.cp1);
            const cp2 = toWorld(seg.cp2);
            const p1 = toWorld(seg.p1);
            innerHolePath.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p1.x, p1.y);
          }
          innerHolePath.closePath();
        } else {
          const p0 = toWorld(cleanHole[0]);
          innerHolePath.moveTo(p0.x, p0.y);
          for (let i = 1; i < cleanHole.length; i++) {
            const p = toWorld(cleanHole[i]);
            innerHolePath.lineTo(p.x, p.y);
          }
          innerHolePath.closePath();
        }
        shape.holes.push(innerHolePath);
      }
    }

    // キーホルダー穴をタブが結合されたポリゴンに確実に追加
    if (idx === bestHolePolyIdx && !holePlaced) {
      shape.holes.push(holePath);
      holePlaced = true;
    }

    allShapes.push(shape);
  }

  // フォールバック
  if (!holePlaced && allShapes.length > 0) {
    const targetShape = allShapes[bestHolePolyIdx] || allShapes[0];
    targetShape.holes.push(holePath);
    holePlaced = true;
  }

  // 6. 2DプレビューとSVGパスデータの生成
  // プレビューCanvas上にベジェ曲線の赤いカットラインを描画（すべての島）
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ef4444'; // 切断線（赤）
  for (const loop of canvasBezierLoops) {
    if (loop.length === 0) continue;
    ctx.beginPath();
    ctx.moveTo(loop[0].p0.x, loop[0].p0.y);
    for (const seg of loop) {
      ctx.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.p1.x, seg.p1.y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // 穴のプレビュー
  ctx.beginPath();
  ctx.arc(effectiveTabX, tabCenterY, holeRPx, 0, Math.PI * 2);
  ctx.fillStyle = '#1e293b';
  ctx.fill();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // SVG パスデータ文字列 (M ... C ... Z)
  let svgD = '';
  for (const loop of canvasBezierLoops) {
    if (loop.length === 0) continue;
    svgD += `M ${loop[0].p0.x.toFixed(2)} ${loop[0].p0.y.toFixed(2)}`;
    for (const seg of loop) {
      svgD += ` C ${seg.cp1.x.toFixed(2)} ${seg.cp1.y.toFixed(2)}, ${seg.cp2.x.toFixed(2)} ${seg.cp2.y.toFixed(2)}, ${seg.p1.x.toFixed(2)} ${seg.p1.y.toFixed(2)}`;
    }
    svgD += ' Z ';
  }
  // キーホルダー穴も SVG パスに含める
  svgD += ` M ${(effectiveTabX - holeRPx).toFixed(2)} ${tabCenterY.toFixed(2)}`;
  svgD += ` A ${holeRPx.toFixed(2)} ${holeRPx.toFixed(2)} 0 1 0 ${(effectiveTabX + holeRPx).toFixed(2)} ${tabCenterY.toFixed(2)}`;
  svgD += ` A ${holeRPx.toFixed(2)} ${holeRPx.toFixed(2)} 0 1 0 ${(effectiveTabX - holeRPx).toFixed(2)} ${tabCenterY.toFixed(2)} Z `;

  const primaryShape = allShapes[0] || new THREE.Shape();

  return {
    shape: primaryShape,
    shapes: allShapes,
    outlinePoints: allWorldPoints,
    bezierSegments: allWorldBezierSegments,
    holeCenter: new THREE.Vector2(holeWorldX, holeWorldY),
    holeRadius: holeWorldRadius,
    width: workW * worldScale,
    height: workH * worldScale,
    previewCanvasUrl: canvas.toDataURL('image/png'),
    svgPathData: svgD.trim(),
  };
}

/**
 * アルファチャンネルからすべての連結成分（島）の輪郭ポリゴンを抽出
 */
function extractAllContoursAlpha(imageData: ImageData, alphaThreshold: number = 20): Point2D[][] {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  const visited = new Int32Array(width * height);
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];
  const contours: Point2D[][] = [];

  const queue = new Int32Array(width * height);
  let nextCompId = 1;

  const isComp = (x: number, y: number, compId: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    return visited[y * width + x] === compId;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (data[idx * 4 + 3] < alphaThreshold || visited[idx] !== 0) continue;

      const compId = nextCompId++;
      // 8連結 BFS で連結成分（島）の全画素を compId でマーク
      let head = 0, tail = 0;
      queue[tail++] = idx;
      visited[idx] = compId;

      let compMinX = x, compMaxX = x, compMinY = y, compMaxY = y;

      while (head < tail) {
        const curr = queue[head++];
        const cx = curr % width;
        const cy = (curr / width) | 0;
        if (cx < compMinX) compMinX = cx;
        if (cx > compMaxX) compMaxX = cx;
        if (cy < compMinY) compMinY = cy;
        if (cy > compMaxY) compMaxY = cy;

        for (let d = 0; d < 8; d++) {
          const nx = cx + dx[d];
          const ny = cy + dy[d];
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nidx = ny * width + nx;
            if (data[nidx * 4 + 3] >= alphaThreshold && visited[nidx] === 0) {
              visited[nidx] = compId;
              queue[tail++] = nidx;
            }
          }
        }
      }

      // 微小なノイズ（4画素未満）は無視
      if (tail < 4) continue;

      // この島の最上部・最左画素 (x, y) から外周輪郭をトレース (Moore-Neighbor Tracing)
      const startX = x;
      const startY = y;
      const contour: Point2D[] = [];
      let curX = startX;
      let curY = startY;
      let curDir = 7;
      let steps = 0;
      const maxSteps = tail * 4 + 16;
      let initialDir = -1;
      let trMinX = startX, trMaxX = startX, trMinY = startY, trMaxY = startY;

      do {
        contour.push({ x: curX, y: curY });
        if (curX < trMinX) trMinX = curX;
        if (curX > trMaxX) trMaxX = curX;
        if (curY < trMinY) trMinY = curY;
        if (curY > trMaxY) trMaxY = curY;

        let foundNext = false;
        let dir = (curDir + 6) % 8;

        for (let i = 0; i < 8; i++) {
          const nx = curX + dx[dir];
          const ny = curY + dy[dir];
          if (isComp(nx, ny, compId)) {
            if (steps === 0) initialDir = dir;
            curX = nx;
            curY = ny;
            curDir = dir;
            foundNext = true;
            break;
          }
          dir = (dir + 1) % 8;
        }

        if (!foundNext) break;
        steps++;

        // 開始点に戻り、かつ最初の移動方向と一致したらトレース完了（Jacob stopping condition）
        if (curX === startX && curY === startY) {
          let nextDir = (curDir + 6) % 8;
          let matchedDir = -1;
          for (let i = 0; i < 8; i++) {
            const nx = curX + dx[nextDir];
            const ny = curY + dy[nextDir];
            if (isComp(nx, ny, compId)) {
              matchedDir = nextDir;
              break;
            }
            nextDir = (nextDir + 1) % 8;
          }
          if (matchedDir === initialDir) break;
        }
      } while (steps < maxSteps);

      if (contour.length >= 3) {
        contours.push(contour);
      }

      // 万が一1px突起等でトレースが早期閉路し島全体をカバーできなかった場合のフォールバック
      if (
        contour.length < 3 ||
        trMinX > compMinX + 2 ||
        trMaxX < compMaxX - 2 ||
        trMaxY < compMaxY - 2
      ) {
        contours.push([
          { x: compMinX, y: compMinY },
          { x: compMaxX + 1, y: compMinY },
          { x: compMaxX + 1, y: compMaxY + 1 },
          { x: compMinX, y: compMaxY + 1 },
        ]);
      }
    }
  }

  return contours;
}

/**
 * ClipperLib を使った複数ポリゴンの最小余白オフセット（Round Offset）
 */
function offsetPolygonsWithClipper(polygons: Point2D[][], margin: number): ClipperLib.ExPolygons {
  const paths: ClipperLib.Paths = [];
  for (const points of polygons) {
    if (points.length < 3) continue;
    const path = points.map(p => ({
      X: Math.round(p.x * CLIPPER_SCALE),
      Y: Math.round(p.y * CLIPPER_SCALE),
    }));
    // 外周ポリゴンは正の向き（Screen座標系ではClockwiseがArea > 0）を保証
    if (!ClipperLib.Clipper.Orientation(path)) {
      ClipperLib.Clipper.ReversePath(path);
    }
    paths.push(path);
  }
  if (paths.length === 0) return [];

  const co = new ClipperLib.ClipperOffset();
  co.ArcTolerance = 0.4 * CLIPPER_SCALE;
  co.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);

  const polytree = new ClipperLib.PolyTree();
  co.Execute(polytree, margin * CLIPPER_SCALE);

  return ClipperLib.JS.PolyTreeToExPolygons(polytree);
}

/**
 * オフセット済みポリゴン群とキーホルダー穴タブのブーリアン結合（Union）
 */
function unionExPolygonsWithTab(
  exPolys: ClipperLib.ExPolygons,
  tabPoly: Point2D[]
): ClipperLib.ExPolygons {
  const c = new ClipperLib.Clipper();
  for (const ep of exPolys) {
    c.AddPath(ep.outer, ClipperLib.PolyType.ptSubject, true);
    for (const h of ep.holes) {
      c.AddPath(h, ClipperLib.PolyType.ptSubject, true);
    }
  }

  const tabPath = tabPoly.map(p => ({
    X: Math.round(p.x * CLIPPER_SCALE),
    Y: Math.round(p.y * CLIPPER_SCALE),
  }));
  c.AddPath(tabPath, ClipperLib.PolyType.ptClip, true);

  const unionTree = new ClipperLib.PolyTree();
  c.Execute(
    ClipperLib.ClipType.ctUnion,
    unionTree,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero
  );

  const result = ClipperLib.JS.PolyTreeToExPolygons(unionTree);
  return result.length > 0 ? result : exPolys;
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
 * 閉曲線（ポリゴン）に対する Douglas-Peucker 単純化
 */
function simplifyClosedPolygonDP(points: Point2D[], epsilon: number): Point2D[] {
  if (points.length <= 3) return points;
  const closed = [...points, points[0]];
  const simplified = simplifyPolygonDP(closed, epsilon);
  return simplified.slice(0, simplified.length - 1);
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
