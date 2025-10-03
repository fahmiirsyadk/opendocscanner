// message protocol: { id, url, name, op?: 'grayscale' | 'warp' | 'passthrough', points?: [...8 points...] }
let opencvReadyPromise = null;

async function ensureOpenCVReady() {
  if (typeof self.cv !== 'undefined' && self.cv && self.cv.Mat) {
    return;
  }
  if (!opencvReadyPromise) {
    opencvReadyPromise = new Promise((resolve, reject) => {
      try {
        importScripts('/opencv.js');
        if (typeof self.cv === 'undefined') {
          reject(new Error('Failed to load OpenCV script'));
          return;
        }
        self.cv['onRuntimeInitialized'] = () => resolve();
      } catch (err) {
        reject(err);
      }
    });
  }
  await opencvReadyPromise;
}

self.distance = function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); };
function getQuadraticBezierPoint(t, p0, p1, p2) {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  return { x: uu * p0.x + 2 * u * t * p1.x + tt * p2.x,
           y: uu * p0.y + 2 * u * t * p1.y + tt * p2.y };
}

async function fetchBitmap(url) {
  const blob = await fetch(url).then(r => r.blob());
  return await createImageBitmap(blob);
}

function imageDataFromBitmap(bitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

function matFromImageData(imageData) {
  const mat = new cv.Mat(imageData.height, imageData.width, cv.CV_8UC4);
  mat.data.set(imageData.data);
  return mat;
}

async function blobFromMat(mat) {
  const outCanvas = new OffscreenCanvas(mat.cols, mat.rows);
  const outCtx = outCanvas.getContext('2d');
  const outImageData = new ImageData(new Uint8ClampedArray(mat.data), mat.cols, mat.rows);
  outCtx.putImageData(outImageData, 0, 0);
  return await outCanvas.convertToBlob({ type: 'image/png' });
}

function computeDstSizeFromCorners(tl, tr, br, bl) {
  const dstW = Math.max(1, Math.round((self.distance(tl, tr) + self.distance(bl, br)) / 2));
  const dstH = Math.max(1, Math.round((self.distance(tl, bl) + self.distance(tr, br)) / 2));
  return { dstW, dstH };
}

function createRemapMaps(dstW, dstH, tl, tr, br, bl, tm, rm, bm, lm) {
  const map1 = new cv.Mat(dstH, dstW, cv.CV_32FC1);
  const map2 = new cv.Mat(dstH, dstW, cv.CV_32FC1);
  const denomW = Math.max(1, dstW - 1);
  const denomH = Math.max(1, dstH - 1);
  for (let j = 0; j < dstH; j++) {
    for (let i = 0; i < dstW; i++) {
      const u = i / denomW; const v = j / denomH;
      const top_p = getQuadraticBezierPoint(u, tl, tm, tr);
      const bottom_p = getQuadraticBezierPoint(u, bl, bm, br);
      const left_p = getQuadraticBezierPoint(v, tl, lm, bl);
      const right_p = getQuadraticBezierPoint(v, tr, rm, br);
      const p1 = { x: (1 - v) * top_p.x + v * bottom_p.x, y: (1 - v) * top_p.y + v * bottom_p.y };
      const p2 = { x: (1 - u) * left_p.x + u * right_p.x, y: (1 - u) * left_p.y + u * right_p.y };
      const src_x = (p1.x + p2.x) / 2; const src_y = (p1.y + p2.y) / 2;
      map1.floatPtr(j, i)[0] = src_x; map2.floatPtr(j, i)[0] = src_y;
    }
  }
  return { map1, map2 };
}

self.onmessage = async (e) => {
  const { id, url, name, op = 'passthrough', points } = e.data || {};
  try {
    if (op === 'passthrough') {
      self.postMessage({ tag: 'done', id, url, name });
      return;
    }

    // Ensure OpenCV is available for all operations that need it
    await ensureOpenCVReady();

    if (op === 'grayscale') {
      const bitmap = await fetchBitmap(url);
      const imageData = imageDataFromBitmap(bitmap);
      const src = matFromImageData(imageData);
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      // Convert back to 4-channel for PNG encoding
      const rgba = new cv.Mat();
      cv.cvtColor(gray, rgba, cv.COLOR_GRAY2RGBA, 0);
      const outBlob = await blobFromMat(rgba);
      // Post Blob directly (structured clone); main will createObjectURL
      self.postMessage({ tag: 'doneBlob', id, name, mime: outBlob.type, blob: outBlob });
      src.delete(); gray.delete(); rgba.delete();
      return;
    }

    if (op === 'warp' && Array.isArray(points) && points.length === 8) {
      const bitmap = await fetchBitmap(url);
      const imageData = imageDataFromBitmap(bitmap);
      const src = matFromImageData(imageData);

      const [tl, tr, br, bl, tm, rm, bm, lm] = points;
      const { dstW, dstH } = computeDstSizeFromCorners(tl, tr, br, bl);
      const { map1, map2 } = createRemapMaps(dstW, dstH, tl, tr, br, bl, tm, rm, bm, lm);

      const dst = new cv.Mat(dstH, dstW, src.type());
      cv.remap(src, dst, map1, map2, cv.INTER_LINEAR, cv.BORDER_REPLICATE);

      const outBlob = await blobFromMat(dst);
      self.postMessage({ tag: 'doneBlob', id, name, mime: outBlob.type, blob: outBlob });

      src.delete(); map1.delete(); map2.delete(); dst.delete();
      return;
    }

    if (op === 'warp_auto' || op === 'detect_corners') {
      const bitmap = await fetchBitmap(url);
      const imageData = imageDataFromBitmap(bitmap);
      const src = matFromImageData(imageData);

      // Auto-detect 4 corners using contours
      const gray = new cv.Mat(); const blur = new cv.Mat(); const thresh = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
      cv.threshold(blur, thresh, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
      const contours = new cv.MatVector(); const hierarchy = new cv.Mat();
      cv.findContours(thresh, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      let maxArea = 0; let best = null;
      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);
        if (area > 1000) {
          const peri = cv.arcLength(cnt, true);
          const approx = new cv.Mat();
          cv.approxPolyDP(cnt, approx, 0.015 * peri, true);
          if (approx.rows === 4 && area > maxArea) {
            maxArea = area;
            const pts = [];
            for (let r = 0; r < 4; r++) { pts.push({ x: approx.intAt(r, 0), y: approx.intAt(r, 1) }); }
            pts.sort((a, b) => a.y - b.y);
            const top = [pts[0], pts[1]].sort((a, b) => a.x - b.x);
            const bottom = [pts[2], pts[3]].sort((a, b) => a.x - b.x);
            best = { tl: top[0], tr: top[1], br: bottom[1], bl: bottom[0] };
          }
          approx.delete();
        }
        cnt.delete();
      }
      contours.delete(); hierarchy.delete(); blur.delete(); thresh.delete();

      if (!best) {
        best = { tl: { x: 0, y: 0 }, tr: { x: src.cols, y: 0 }, br: { x: src.cols, y: src.rows }, bl: { x: 0, y: src.rows } };
      }
      const { tl, tr, br, bl } = best;
      const tm = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
      const rm = { x: (tr.x + br.x) / 2, y: (tr.y + br.y) / 2 };
      const bm = { x: (bl.x + br.x) / 2, y: (bl.y + br.y) / 2 };
      const lm = { x: (tl.x + bl.x) / 2, y: (tl.y + bl.y) / 2 };

      if (op === 'detect_corners') {
        const pts = [tl, tr, br, bl, tm, rm, bm, lm];
        self.postMessage({ tag: 'detected', id, points: pts, width: src.cols, height: src.rows });
        src.delete(); gray.delete(); return;
      }

      const { dstW, dstH } = computeDstSizeFromCorners(tl, tr, br, bl);
      const { map1, map2 } = createRemapMaps(dstW, dstH, tl, tr, br, bl, tm, rm, bm, lm);

      const dst = new cv.Mat(dstH, dstW, src.type());
      cv.remap(src, dst, map1, map2, cv.INTER_LINEAR, cv.BORDER_REPLICATE);

      // Background cleanup (HSV S-channel mask -> largest contour -> white bg)
      try {
        const hsv = new cv.Mat(); cv.cvtColor(dst, hsv, cv.COLOR_RGBA2HSV, 0);
        const channels = new cv.MatVector(); cv.split(hsv, channels);
        const S = channels.get(1); const mask = new cv.Mat();
        cv.threshold(S, mask, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
        const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
        cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
        const cts = new cv.MatVector(); const hier = new cv.Mat();
        cv.findContours(mask, cts, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        let output = dst;
        if (cts.size() > 0) {
          let bestIdx = 0, bestArea2 = 0;
          for (let i = 0; i < cts.size(); i++) { const a = cv.contourArea(cts.get(i)); if (a > bestArea2) { bestArea2 = a; bestIdx = i; } }
          const cleanMask = cv.Mat_zeros(mask.rows, mask.cols, mask.type());
          cv.drawContours(cleanMask, cts, bestIdx, new cv.Scalar(255), -1);
          const whiteBg = new cv.Mat(dst.rows, dst.cols, dst.type(), new cv.Scalar(255, 255, 255, 255));
          cv.copyTo(dst, whiteBg, cleanMask);
          output = whiteBg;
          cleanMask.delete();
        }

        const outRgba = new cv.Mat();
        cv.cvtColor(output, outRgba, cv.COLOR_RGBA2RGBA, 0);
        const outBlob = await blobFromMat(outRgba);
        self.postMessage({ tag: 'doneBlob', id, name, mime: outBlob.type, blob: outBlob });
        outRgba.delete(); hsv.delete(); channels.delete(); S.delete(); mask.delete(); kernel.delete(); cts.delete(); hier.delete();
      } catch (e) {
        // Fallback: just output dst
        const outBlob = await blobFromMat(dst);
        self.postMessage({ tag: 'doneBlob', id, name, mime: outBlob.type, blob: outBlob });
      }

      src.delete(); gray.delete(); map1.delete(); map2.delete();
      return;
    }

    // Default: pass-through
    self.postMessage({ tag: 'done', id, url, name });
  } catch (err) {
    self.postMessage({ tag: 'error', id, reason: String((err && err.message) || err) });
  }
};
