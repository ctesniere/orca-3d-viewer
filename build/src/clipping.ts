// A single axis-aligned clipping plane, cutting away one side of the model to see inside it. Plain numbers,
// so the plane itself is tested without a GPU; model-scene.ts turns it into an actual three.js Plane.

export type ClippingAxis = 'x' | 'y' | 'z'
export const CLIPPING_AXES: readonly ClippingAxis[] = ['x', 'y', 'z']

export type Clipping = {
  enabled: boolean
  axis: ClippingAxis
  /** Where the cut sits between the model's bounds on that axis: 0 at the near face, 1 at the far one. */
  position: number
  /** Which side is kept: the far side by default, the near one when flipped. */
  flipped: boolean
}

export const DEFAULT_CLIPPING: Clipping = { enabled: false, axis: 'x', position: 0.5, flipped: false }

type Vec3 = [number, number, number]
export type Plane = { normal: Vec3; constant: number }

const AXIS_INDEX: Record<ClippingAxis, number> = { x: 0, y: 1, z: 2 }

/** The plane to clip with, or null while clipping is off. `bounds` is the model's box on each axis. */
export function clippingPlane(clipping: Clipping, bounds: { min: Vec3; max: Vec3 }): Plane | null {
  if (!clipping.enabled) return null
  const index = AXIS_INDEX[clipping.axis]
  const value = bounds.min[index] + (bounds.max[index] - bounds.min[index]) * clipping.position
  const sign = clipping.flipped ? -1 : 1
  const normal: Vec3 = [0, 0, 0]
  normal[index] = sign
  // Why `|| 0`: -0 and 0 clip the same point, but would otherwise compare unequal.
  return { normal, constant: -sign * value || 0 }
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/** Clipping read back from storage: anything that is not a valid choice falls back to its default. */
export function clippingFrom(value: unknown): Clipping {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_CLIPPING }
  // Why own properties only: a stored "__proto__" or "constructor" must not supply a choice.
  const own = (name: keyof Clipping): unknown => Object.getOwnPropertyDescriptor(value, name)?.value
  const enabled = own('enabled')
  const axis = own('axis')
  const position = own('position')
  const flipped = own('flipped')
  return {
    enabled: typeof enabled === 'boolean' ? enabled : DEFAULT_CLIPPING.enabled,
    axis: CLIPPING_AXES.find((known) => known === axis) ?? DEFAULT_CLIPPING.axis,
    position: typeof position === 'number' && Number.isFinite(position) ? clamp01(position) : DEFAULT_CLIPPING.position,
    flipped: typeof flipped === 'boolean' ? flipped : DEFAULT_CLIPPING.flipped
  }
}
