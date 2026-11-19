// The toolbar's last choices, kept in the frame's own localStorage: Orca gives each plugin its own,
// on disk and cleared on uninstall. Older Orca frames refuse storage, and then nothing is kept.

import { type Clipping, clippingFrom, DEFAULT_CLIPPING } from './clipping.ts'
import { DEFAULT_LIGHTING, type Lighting, lightingFrom } from './lighting.ts'

export type ViewerPreferences = { dark: boolean; wireframe: boolean; guides: boolean; uvChecker: boolean; lighting: Lighting; clipping: Clipping }

const KEY = 'viewer-preferences'
export const DEFAULT_PREFERENCES: ViewerPreferences = {
  dark: false,
  wireframe: false,
  guides: true,
  uvChecker: false,
  lighting: DEFAULT_LIGHTING,
  clipping: DEFAULT_CLIPPING
}

export function loadPreferences(): ViewerPreferences {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (typeof stored !== 'object' || stored === null) return { ...DEFAULT_PREFERENCES, lighting: { ...DEFAULT_LIGHTING }, clipping: { ...DEFAULT_CLIPPING } }
    const flag = (name: 'dark' | 'wireframe' | 'guides' | 'uvChecker'): boolean => {
      const value = Object.getOwnPropertyDescriptor(stored, name)?.value
      return typeof value === 'boolean' ? value : DEFAULT_PREFERENCES[name]
    }
    return {
      dark: flag('dark'),
      wireframe: flag('wireframe'),
      guides: flag('guides'),
      uvChecker: flag('uvChecker'),
      lighting: lightingFrom(Object.getOwnPropertyDescriptor(stored, 'lighting')?.value),
      clipping: clippingFrom(Object.getOwnPropertyDescriptor(stored, 'clipping')?.value)
    }
  } catch {
    return { ...DEFAULT_PREFERENCES, lighting: { ...DEFAULT_LIGHTING }, clipping: { ...DEFAULT_CLIPPING } }
  }
}

export function savePreferences(preferences: ViewerPreferences): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(preferences))
  } catch {
    // Storage refused or full: the choice still holds until the viewer closes.
  }
}
