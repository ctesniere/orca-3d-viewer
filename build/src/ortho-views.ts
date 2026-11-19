// Where to put an orthographic camera for a front, top or side preset, and the frustum that frames the
// model's bounding sphere in it. Plain numbers, so it is tested without a renderer; model-scene.ts turns
// this into an actual three.js OrthographicCamera.

export type OrthoPreset = 'front' | 'top' | 'side'

type Vec3 = [number, number, number]

export type OrthoFrame = {
  position: Vec3
  up: Vec3
  left: number
  right: number
  top: number
  bottom: number
}

// Why top gets its own up: looking straight down along Y, (0, 1, 0) is parallel to the view direction and
// leaves lookAt() nothing to roll around; -Z there reads as "north" is up on screen, as most viewers show it.
const AXES: Record<OrthoPreset, { direction: Vec3; up: Vec3 }> = {
  front: { direction: [0, 0, 1], up: [0, 1, 0] },
  top: { direction: [0, 1, 0], up: [0, 0, -1] },
  side: { direction: [1, 0, 0], up: [0, 1, 0] }
}

// How far past the model the camera sits; only its direction matters for an orthographic projection, but
// it still needs to clear the model so near/far planes set from this distance hold it.
const DISTANCE_FACTOR = 4

export function orthoFrame(preset: OrthoPreset, center: Vec3, radius: number, aspect: number): OrthoFrame {
  const { direction, up } = AXES[preset]
  const distance = radius * DISTANCE_FACTOR
  const position: Vec3 = [center[0] + direction[0] * distance, center[1] + direction[1] * distance, center[2] + direction[2] * distance]
  const halfWidth = aspect >= 1 ? radius * aspect : radius
  const halfHeight = aspect >= 1 ? radius : radius / aspect
  return { position, up, left: -halfWidth, right: halfWidth, top: halfHeight, bottom: -halfHeight }
}
