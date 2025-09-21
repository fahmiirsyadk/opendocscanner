export function resizeCanvas(selector) {
  return function(w) {
    return function(h) {
      return function() {
        const c = document.querySelector(selector);
        if (!c) return;
        c.width = w;
        c.height = h;
      };
    };
  };
}

export function drawOverlay(selector) {
  return function(points) {
    return function() {
      const c = document.querySelector(selector);
      if (!c) return;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (!points || points.length !== 8) return;
      const [tl, tr, br, bl, tm, rm, bm, lm] = points;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#00e0ff';
      ctx.fillStyle = 'rgba(0, 224, 255, 0.12)';
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.quadraticCurveTo(tm.x, tm.y, tr.x, tr.y);
      ctx.quadraticCurveTo(rm.x, rm.y, br.x, br.y);
      ctx.quadraticCurveTo(bm.x, bm.y, bl.x, bl.y);
      ctx.quadraticCurveTo(lm.x, lm.y, tl.x, tl.y);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      // draw corner/midpoint handles on top of the curve
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        // outer ring for visibility
        ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
        // inner solid dot
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = i < 4 ? '#ff2d55' : '#ffee00'; ctx.fill();
      }
    };
  };
}

export function offsetXY(e) {
  return function() {
    const target = e.target;
    const rect = target.getBoundingClientRect();
    // Compute scale based on displayed size vs canvas internal size
    const scaleX = target.width / rect.width;
    const scaleY = target.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    return { x, y };
  };
}

