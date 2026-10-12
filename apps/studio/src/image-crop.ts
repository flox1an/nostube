/** A cover crop in source pixels; positions run from 0 (left/top) to 1 (right/bottom). */
export function cropRect(
  width: number,
  height: number,
  aspect: number,
  zoom: number,
  position: { x: number; y: number }
) {
  const w = Math.min(width, height * aspect) / zoom
  const h = w / aspect
  return { x: (width - w) * position.x, y: (height - h) * position.y, width: w, height: h }
}
