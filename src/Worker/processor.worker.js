// Minimal message protocol: { id, url, name, op?: 'grayscale' | 'warp' | 'passthrough', points?: [...8 points...] }
const OPENCV_CANDIDATES = (() => {
  const urls = ['/opencv.js'];
  try {
    const base = new URL('./', self.location.href);
    urls.push(new URL('../assets/opencv/opencv.js', base).toString());
  } catch (_) {
    urls.push('../assets/opencv/opencv.js');
  }
  return Array.from(new Set(urls));
})();

function tryLoadOpenCv() {
  for (const candidate of OPENCV_CANDIDATES) {
    try {
      importScripts(candidate);
      if (typeof cv !== 'undefined' && typeof cv.Mat === 'function') {
        return true;
      }
    } catch (_) {
      // try next candidate
    }
  }
  return typeof cv !== 'undefined' && typeof cv.Mat === 'function';
}

async function ensureCvReady() {
  if (typeof cv !== 'undefined' && typeof cv.Mat === 'function') return;
  tryLoadOpenCv();
  if (typeof cv !== 'undefined' && typeof cv.Mat === 'function') return;
  await new Promise((resolve) => {
    if (typeof cv !== 'undefined' && cv && typeof cv.onRuntimeInitialized === 'function') {
      const prev = cv.onRuntimeInitialized;
      cv.onRuntimeInitialized = function() { try { if (typeof prev === 'function') prev(); } catch (_) {} resolve(); };
    } else {
      let tries = 0; const t = setInterval(() => {
        if (typeof cv !== 'undefined' && typeof cv.Mat === 'function') { clearInterval(t); resolve(); }
        else if (++tries > 300) { clearInterval(t); resolve(); }
      }, 10);
    }
  });
}

self.distance = function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); };
function getQuadraticBezierPoint(t, p0, p1, p2) {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  return { x: uu * p0.x + 2 * u * t * p1.x + tt * p2.x,
           y: uu * p0.y + 2 * u * t * p1.y + tt * p2.y };
}

self.onmessage = async (e) => {
  const { id, url, name, op = 'passthrough', points } = e.data || {};
  try {
    if (op === 'passthrough') {
      self.postMessage({ tag: 'done', id, url, name });
      return;
    }

    if (op === 'grayscale') {
      await ensureCvReady();
      const hasCV = (typeof cv !== 'undefined' && typeof cv.Mat === 'function');
      if (!hasCV) { self.postMessage({ tag: 'done', id, url, name }); return; }

      const blob = await fetch(url).then(r => r.blob());
      const bitmap = await createImageBitmap(blob);
      const srcCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const srcCtx = srcCanvas.getContext('2d');
      srcCtx.drawImage(bitmap, 0, 0);

      // Read into cv.Mat using ImageData (cv.imread may not support OffscreenCanvas)
      const imageData = srcCtx.getImageData(0, 0, bitmap.width, bitmap.height);
      const src = new cv.Mat(imageData.height, imageData.width, cv.CV_8UC4);
      src.data.set(imageData.data);
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      // Convert back to 4-channel for PNG encoding
      const rgba = new cv.Mat();
      cv.cvtColor(gray, rgba, cv.COLOR_GRAY2RGBA, 0);
      const outCanvas = new OffscreenCanvas(rgba.cols, rgba.rows);
      const outCtx = outCanvas.getContext('2d');
      const outImageData = new ImageData(new Uint8ClampedArray(rgba.data), rgba.cols, rgba.rows);
      outCtx.putImageData(outImageData, 0, 0);
      const outBlob = await outCanvas.convertToBlob({ type: 'image/png' });
      // Post Blob directly (structured clone); main will createObjectURL
      self.postMessage({ tag: 'doneBlob', id, name, mime: outBlob.type, blob: outBlob });
      src.delete(); gray.delete(); rgba.delete();
      return;
    }

    if (op === 'warp' && Array.isArray(points) && points.length === 8) {
      await ensureCvReady();
      if (typeof cv === 'undefined' || typeof cv.Mat !== 'function') { self.postMessage({ tag: 'done', id, url, name }); return; }

      const blob = await fetch(url).then(r => r.blob());
      const bitmap = await createImageBitmap(blob);
      const srcCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = srcCanvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

      const src = new cv.Mat(imageData.height, imageData.width, cv.CV_8UC4);
      src.data.set(imageData.data);

      const [tl, tr, br, bl, tm, rm, bm, lm] = points;
      const dstW = Math.max(1, Math.round((self.distance(tl, tr) + self.distance(bl, br)) / 2));
      const dstH = Math.max(1, Math.round((self.distance(tl, bl) + self.distance(tr, br)) / 2));

      const map1 = new cv.Mat(dstH, dstW, cv.CV_32FC1);
      const map2 = new cv.Mat(dstH, dstW, cv.CV_32FC1);
      const denomW = Math.max(1, dstW - 1); const denomH = Math.max(1, dstH - 1);
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

      const dst = new cv.Mat(dstH, dstW, src.type());
      cv.remap(src, dst, map1, map2, cv.INTER_LINEAR, cv.BORDER_REPLICATE);

      // Output as PNG
      const outCanvas = new OffscreenCanvas(dstW, dstH);
      const outCtx = outCanvas.getContext('2d');
      const outImageData = new ImageData(new Uint8ClampedArray(dst.data), dst.cols, dst.rows);
      outCtx.putImageData(outImageData, 0, 0);
      const outBlob = await outCanvas.convertToBlob({ type: 'image/png' });
      self.postMessage({ tag: 'doneBlob', id, name, mime: outBlob.type, blob: outBlob });

      src.delete(); map1.delete(); map2.delete(); dst.delete();
      return;
    }

    if (op === 'warp_auto' || op === 'detect_corners') {
      await ensureCvReady();
      if (typeof cv === 'undefined' || typeof cv.Mat !== 'function') { self.postMessage({ tag: 'done', id, url, name }); return; }

      const blob = await fetch(url).then(r => r.blob());
      const bitmap = await createImageBitmap(blob);
      const srcCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx2d = srcCanvas.getContext('2d');
      ctx2d.drawImage(bitmap, 0, 0);
      const imageData = ctx2d.getImageData(0, 0, bitmap.width, bitmap.height);

      const src = new cv.Mat(imageData.height, imageData.width, cv.CV_8UC4);
      src.data.set(imageData.data);

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

      const dstW = Math.max(1, Math.round((self.distance(tl, tr) + self.distance(bl, br)) / 2));
      const dstH = Math.max(1, Math.round((self.distance(tl, bl) + self.distance(tr, br)) / 2));

      const map1 = new cv.Mat(dstH, dstW, cv.CV_32FC1);
      const map2 = new cv.Mat(dstH, dstW, cv.CV_32FC1);
      const denomW = Math.max(1, dstW - 1); const denomH = Math.max(1, dstH - 1);
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

        const outCanvas = new OffscreenCanvas(dstW, dstH);
        const outCtx = outCanvas.getContext('2d');
        const outRgba = new cv.Mat();
        cv.cvtColor(output, outRgba, cv.COLOR_RGBA2RGBA, 0);
        const outImageData = new ImageData(new Uint8ClampedArray(outRgba.data), outRgba.cols, outRgba.rows);
        outCtx.putImageData(outImageData, 0, 0);
        const outBlob = await outCanvas.convertToBlob({ type: 'image/png' });
        self.postMessage({ tag: 'doneBlob', id, name, mime: outBlob.type, blob: outBlob });
        outRgba.delete(); hsv.delete(); channels.delete(); S.delete(); mask.delete(); kernel.delete(); cts.delete(); hier.delete();
      } catch (e) {
        // Fallback: just output dst
        const outCanvas = new OffscreenCanvas(dstW, dstH);
        const outCtx = outCanvas.getContext('2d');
        const outImageData = new ImageData(new Uint8ClampedArray(dst.data), dst.cols, dst.rows);
        outCtx.putImageData(outImageData, 0, 0);
        const outBlob = await outCanvas.convertToBlob({ type: 'image/png' });
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
