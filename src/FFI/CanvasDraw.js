export function naturalWidthImpl(img) {
  return function() {
    return img.naturalWidth;
  };
}

export function naturalHeightImpl(img) {
  return function() {
    return img.naturalHeight;
  };
}