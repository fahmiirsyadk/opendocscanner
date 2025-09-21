export function drawImageToCanvas(canvasSelector) {
  return function (imageUrl) {
    return function () {
      const canvas = document.querySelector(canvasSelector);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = function () {
        // Resize canvas to image dimensions to preserve quality
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
      };
      img.src = imageUrl;
    };
  };
}


