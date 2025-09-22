export function exportPdf(pages) {
  return async function () {
    // load pdf-lib locally
    if (typeof window !== 'undefined' && !window.PDFLib) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        // Load from built artifact at /pdf-lib.min.js to avoid SPA rewrites
        s.src = '/pdf-lib.min.js';
        s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
      });
    }
    const { PDFDocument, StandardFonts } = window.PDFLib || {};
    if (!PDFDocument) return;

    const pdfDoc = await PDFDocument.create();
    for (const spec of pages) {
      const canvas = document.querySelector(spec.canvasSelector);
      if (!canvas) continue;
      const dataUrl = canvas.toDataURL('image/png');
      const pngBytes = await fetch(dataUrl).then(r => r.arrayBuffer());
      const pngImage = await pdfDoc.embedPng(pngBytes);
      const { width, height } = pngImage.scale(1);
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(pngImage, { x: 0, y: 0, width, height });
    }
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'document.pdf'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
}

