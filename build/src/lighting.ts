// How the model is lit. The defaults are the look the viewer always had; the panel changes them, and the
// choice is kept with the other toolbar preferences. Everything here is plain numbers, so it is tested without a GPU.

export type LightingMode = 'studio' | 'environment' | 'directional' | 'flat'
export const LIGHTING_MODES: readonly LightingMode[] = ['studio', 'environment', 'directional', 'flat']

export type Lighting = {
  mode: LightingMode
  /** Scales every light and the reflections; 1 is the default level. */
  intensity: number
  /** How bright the picture is made after lighting; lower it when a white model turns all white. */
  exposure: number
  /** Where the direct light comes from: degrees around the model, 0 in front, positive to the right. */
  azimuth: number
  /** How high the direct light is: degrees above the horizon. */
  elevation: number
}

export const DEFAULT_LIGHTING: Lighting = { mode: 'studio', intensity: 1, exposure: 1, azimuth: 34, elevation: 48 }

export const LIGHTING_LIMITS = {
  intensity: { min: 0, max: 3, step: 0.05 },
  exposure: { min: 0.1, max: 3, step: 0.05 },
  azimuth: { min: -180, max: 180, step: 1 },
  elevation: { min: 0, max: 90, step: 1 }
} as const

const clamp = (value: number, { min, max }: { min: number; max: number }): number => Math.min(max, Math.max(min, value))

/** Lighting read back from storage: anything that is not a valid choice falls back to its default. */
export function lightingFrom(value: unknown): Lighting {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_LIGHTING }
  // Why own properties only: a stored "__proto__" or "constructor" must not supply a choice.
  const own = (name: keyof Lighting): unknown => Object.getOwnPropertyDescriptor(value, name)?.value
  const mode = own('mode')
  const number = (name: Exclude<keyof Lighting, 'mode'>): number => {
    const stored = own(name)
    return typeof stored === 'number' && Number.isFinite(stored) ? clamp(stored, LIGHTING_LIMITS[name]) : DEFAULT_LIGHTING[name]
  }
  return {
    mode: LIGHTING_MODES.find((known) => known === mode) ?? DEFAULT_LIGHTING.mode,
    intensity: number('intensity'),
    exposure: number('exposure'),
    azimuth: number('azimuth'),
    elevation: number('elevation')
  }
}

export type LightLevels = {
  hemisphere: number
  key: number
  keyVisible: boolean
  keyPosition: [number, number, number]
  ambient: number
  /** The strength of the reflected room, which lights every glossy and diffuse surface alike. */
  environment: number
}

// The levels the viewer always used, at intensity 1.
const HEMISPHERE = 0.6
const KEY = 1.2
// Why pi: three.js divides a surface's colour by pi under an ambient light, so this shows the colour as it is.
const FLAT = Math.PI
// A model that carries its own lights is lit by them; ours only fill in.
const FILL_WHEN_LIT = 0.25
const KEY_DISTANCE = 3

export function lightLevels(lighting: Lighting, modelHasLights: boolean): LightLevels {
  const { mode, intensity } = lighting
  const azimuth = (lighting.azimuth * Math.PI) / 180
  const elevation = (lighting.elevation * Math.PI) / 180
  const withKey = mode === 'studio' || mode === 'directional'
  return {
    hemisphere: withKey ? HEMISPHERE * intensity * (modelHasLights ? FILL_WHEN_LIT : 1) : 0,
    key: KEY * intensity,
    keyVisible: withKey && !modelHasLights,
    keyPosition: [
      Math.cos(elevation) * Math.sin(azimuth) * KEY_DISTANCE,
      Math.sin(elevation) * KEY_DISTANCE,
      Math.cos(elevation) * Math.cos(azimuth) * KEY_DISTANCE
    ],
    ambient: mode === 'flat' ? FLAT * intensity : 0,
    environment: mode === 'studio' || mode === 'environment' ? intensity : 0
  }
}
