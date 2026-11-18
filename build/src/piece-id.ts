// Names a mesh by where it sits in the model: its position among its parent's children at each level from the
// root, and the names along the way. Unlike a uuid it is the same every time the same file is loaded, so a note
// can find its piece again after the frame was recreated. The names guard against another file with the same
// shape; the id is read back from storage, so it is never trusted.
import type { Object3D } from 'three'

/** Names are cut to this length wherever they are kept, so the same name compares equal after a round trip. */
export const MAX_STORED_NAME = 200
const MAX_DEPTH = 64

export const storedName = (name: string): string => name.slice(0, MAX_STORED_NAME)

/** The names from `root` down to `node`, cut to the stored length. */
export function namePath(node: Object3D, root: Object3D): string[] {
  const names: string[] = []
  for (let at: Object3D | null = node; at; at = at === root ? null : at.parent) names.unshift(storedName(at.name))
  return names
}

export function pieceIdOf(node: Object3D, root: Object3D): string {
  const indices: number[] = []
  for (let at: Object3D = node; at !== root && at.parent; at = at.parent) indices.unshift(at.parent.children.indexOf(at))
  return JSON.stringify([indices, namePath(node, root)])
}

/** The node an id names in `root`, or null when the id is malformed or the model is shaped differently. */
export function findPiece(id: string, root: Object3D): Object3D | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(id)
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) return null
  const [indices, names] = parsed as [unknown, unknown]
  if (!Array.isArray(indices) || !Array.isArray(names) || indices.length > MAX_DEPTH || names.length !== indices.length + 1) return null
  let node: Object3D | undefined = root
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0) return null
    node = node.children[index]
    if (!node) return null
  }
  const actual = namePath(node, root)
  return actual.every((name, position) => name === names[position]) ? node : null
}
