// Where the camera was, kept in the frame's own localStorage under the document's content id (see document-id.ts),
// so the view is the same when Orca recreates the frame after the person leaves the tab and comes back. Only the
// last few documents are kept, and what is read back is checked: storage is not trusted.
import type { Vec3 } from './annotation.ts'

export type SavedView = { position: Vec3; target: Vec3 }

const KEY = 'viewer-cameras'
export const MAX_SAVED_VIEWS = 16
const MAX_ID = 64
const MAX_LENGTH = 1e9

const own = (value: unknown, name: string): unknown =>
  typeof value === 'object' && value !== null ? Object.getOwnPropertyDescriptor(value, name)?.value : undefined

function vector(value: unknown): Vec3 | null {
  if (!Array.isArray(value) || value.length !== 3) return null
  return value.every((part) => typeof part === 'number' && Number.isFinite(part) && Math.abs(part) <= MAX_LENGTH) ? (value as Vec3) : null
}

type Entry = { id: string; view: SavedView }

function readAll(): Entry[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    const views = own(stored, 'views')
    if (!Array.isArray(views)) return []
    return views.slice(0, MAX_SAVED_VIEWS).flatMap((entry): Entry[] => {
      const id = own(entry, 'id')
      const position = vector(own(entry, 'position'))
      const target = vector(own(entry, 'target'))
      return typeof id === 'string' && id.length <= MAX_ID && position && target ? [{ id, view: { position, target } }] : []
    })
  } catch {
    return []
  }
}

export function loadView(id: string): SavedView | null {
  return readAll().find((entry) => entry.id === id)?.view ?? null
}

/** Keeps `view` for the document `id`, newest first. */
export function saveView(id: string, view: SavedView): void {
  const views = [{ id, ...view }, ...readAll().filter((entry) => entry.id !== id).map((entry) => ({ id: entry.id, ...entry.view }))]
  const stored = { views: views.slice(0, MAX_SAVED_VIEWS) }
  try {
    localStorage.setItem(KEY, JSON.stringify(stored))
  } catch {
    // Storage refused or full: the view still holds until the frame closes.
  }
}
