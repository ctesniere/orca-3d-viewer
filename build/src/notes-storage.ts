// The notes written on a document, kept in the frame's own localStorage so they survive Orca recreating the frame
// when the person leaves the tab and comes back. They are keyed by the document's content (see document-id.ts),
// only the last few documents are kept, and everything read back is checked: storage is not trusted.
import { MAX_COMMENT_CHARACTERS, MAX_FILE_PATH_CHARACTERS, type ModelPick, type Note, type Vec3 } from './annotation.ts'
import { MAX_STORED_NAME } from './piece-id.ts'

export type StoredNotes = { filePath: string; notes: Note[] }

const KEY = 'viewer-notes'
export const MAX_STORED_DOCUMENTS = 8
export const MAX_STORED_NOTES = 100
const MAX_ID = 64
const MAX_PIECE_ID = 4000
const MAX_PATH_DEPTH = 64
const MAX_LENGTH = 1e9

const own = (value: unknown, name: string): unknown =>
  typeof value === 'object' && value !== null ? Object.getOwnPropertyDescriptor(value, name)?.value : undefined
const text = (value: unknown, max: number): string | null => (typeof value === 'string' && value.length <= max ? value : null)
const number = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_LENGTH ? value : null)

function vector(value: unknown): Vec3 | null {
  if (!Array.isArray(value) || value.length !== 3) return null
  const parts = value.map(number)
  return parts.every((part) => part !== null) ? (parts as Vec3) : null
}

function pickFrom(value: unknown): ModelPick | null {
  const point = vector(own(value, 'point'))
  const localPoint = vector(own(value, 'localPoint'))
  const rawNormal = own(value, 'normal')
  const normal = rawNormal === null ? null : vector(rawNormal)
  const pieceId = text(own(value, 'pieceId'), MAX_PIECE_ID)
  const rawPath = own(value, 'path')
  const path = Array.isArray(rawPath) && rawPath.length <= MAX_PATH_DEPTH ? rawPath.map((name) => text(name, MAX_STORED_NAME)) : null
  const rawMaterial = own(value, 'material')
  const material = rawMaterial === null ? null : text(rawMaterial, MAX_STORED_NAME)
  const camera = own(value, 'camera')
  const position = vector(own(camera, 'position'))
  const target = vector(own(camera, 'target'))
  if (!point || !localPoint || (rawNormal !== null && !normal) || pieceId === null || !path || path.includes(null)) return null
  if ((rawMaterial !== null && material === null) || !position || !target) return null
  return { point, localPoint, normal, pieceId, path: path as string[], material, camera: { position, target } }
}

function noteFrom(value: unknown): Note | null {
  const kind = own(value, 'kind')
  const comment = text(own(value, 'comment'), MAX_COMMENT_CHARACTERS)
  const zone = own(value, 'zone')
  const radius = number(own(value, 'radius'))
  const pick = pickFrom(own(value, 'pick'))
  if ((kind !== 'change' && kind !== 'question') || !comment || typeof zone !== 'boolean' || radius === null || radius < 0 || !pick) return null
  return { kind, comment, zone, radius, pick }
}

/** The valid notes in `value`; a note that is not valid is dropped, and so is everything past the limit. */
export function notesFrom(value: unknown): Note[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_STORED_NOTES).flatMap((entry) => noteFrom(entry) ?? [])
}

type Entry = { id: string; filePath: string; notes: Note[] }

function readAll(): Entry[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    const documents = own(stored, 'documents')
    if (!Array.isArray(documents)) return []
    return documents.slice(0, MAX_STORED_DOCUMENTS).flatMap((entry): Entry[] => {
      const id = text(own(entry, 'id'), MAX_ID)
      const filePath = text(own(entry, 'filePath'), MAX_FILE_PATH_CHARACTERS)
      return id ? [{ id, filePath: filePath ?? '', notes: notesFrom(own(entry, 'notes')) }] : []
    })
  } catch {
    return []
  }
}

export function loadNotes(id: string): StoredNotes | null {
  const found = readAll().find((entry) => entry.id === id)
  return found ? { filePath: found.filePath, notes: found.notes } : null
}

/** Keeps `notes` for the document `id`, newest first; no notes and no path forgets the document. */
export function saveNotes(id: string, filePath: string, notes: Note[]): void {
  const others = readAll().filter((entry) => entry.id !== id)
  const entries = notes.length > 0 || filePath !== '' ? [{ id, filePath, notes: notes.slice(0, MAX_STORED_NOTES) }, ...others] : others
  const stored = { documents: entries.slice(0, MAX_STORED_DOCUMENTS) }
  try {
    localStorage.setItem(KEY, JSON.stringify(stored))
  } catch {
    // Storage refused or full: the notes still hold until the frame closes.
  }
}
