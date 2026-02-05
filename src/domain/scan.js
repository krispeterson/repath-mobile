export const CAMERA_FPS = 1;
export const YOLO_INPUT = 640;
export const YOLO_SCORE_THRESHOLD = 0.35;

export function resizeFrameToRgb(frame, targetWidth, targetHeight, swapRB) {
  "worklet";
  const srcWidth = frame.width;
  const srcHeight = frame.height;
  const srcStride = frame.bytesPerRow;
  const src = new Uint8Array(frame.toArrayBuffer());
  const out = new Uint8Array(targetWidth * targetHeight * 3);

  for (let y = 0; y < targetHeight; y += 1) {
    const sy = Math.floor((y * srcHeight) / targetHeight);
    const rowStart = sy * srcStride;
    for (let x = 0; x < targetWidth; x += 1) {
      const sx = Math.floor((x * srcWidth) / targetWidth);
      const si = rowStart + sx * 4;
      let r = src[si];
      const g = src[si + 1];
      let b = src[si + 2];
      if (swapRB) {
        const tmp = r;
        r = b;
        b = tmp;
      }
      const di = (y * targetWidth + x) * 3;
      out[di] = r;
      out[di + 1] = g;
      out[di + 2] = b;
    }
  }

  return out;
}


export function resizeFrameToRgbFloat(frame, targetWidth, targetHeight, swapRB) {
  "worklet";
  const rgb = resizeFrameToRgb(frame, targetWidth, targetHeight, swapRB);
  const out = new Float32Array(rgb.length);
  for (let i = 0; i < rgb.length; i += 1) {
    out[i] = rgb[i] / 255;
  }
  return out;
}
