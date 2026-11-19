// A checkerboard texture, baked as plain pixels rather than drawn with canvas commands so it is tested
// without one: put on every material in place of its own map, a stretched or rotated UV shows at once as
// a square that is no longer square, and a low texel density as a checker that blurs under its mipmaps.

export const CHECKER_SIZE = 256
export const CHECKER_CELLS = 8

const LIGHT: readonly [number, number, number] = [235, 235, 235]
const DARK: readonly [number, number, number] = [60, 60, 60]

export function checkerPixels(size = CHECKER_SIZE, cells = CHECKER_CELLS): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(size * size * 4)
  const cellSize = size / cells
  for (let y = 0; y < size; y++) {
    const cellY = Math.floor(y / cellSize)
    for (let x = 0; x < size; x++) {
      const cellX = Math.floor(x / cellSize)
      const [r, g, b] = (cellX + cellY) % 2 === 0 ? LIGHT : DARK
      const at = (y * size + x) * 4
      pixels[at] = r
      pixels[at + 1] = g
      pixels[at + 2] = b
      pixels[at + 3] = 255
    }
  }
  return pixels
}
