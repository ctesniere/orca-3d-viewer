// Which pieces an isolate-mode click hid, so each (or all of them) can be shown again. Kept apart from the
// scene itself so it is tested with plain Three.js objects, with no renderer or canvas involved.
import type { Object3D } from 'three'
import { namePath, pieceIdOf } from './piece-id.ts'

export type HiddenPiece = { pieceId: string; path: string[] }

export type Isolation = {
  /** Hides `node`, or shows it again if it was already hidden. */
  toggle: (node: Object3D, root: Object3D) => void
  /** Shows the piece `pieceId` names, if it is one this is holding hidden. */
  show: (pieceId: string) => void
  /** Shows every piece this is holding hidden. */
  showAll: () => void
  /** Every hidden piece, named by its path from `root`; empty without a root to resolve it against. */
  list: (root: Object3D | null) => HiddenPiece[]
  /** Forgets every hidden piece, without changing their visibility: for a model about to be disposed. */
  clear: () => void
}

export function createIsolation(): Isolation {
  const hidden = new Map<string, Object3D>()
  return {
    toggle: (node, root) => {
      const id = pieceIdOf(node, root)
      if (hidden.has(id)) {
        node.visible = true
        hidden.delete(id)
      } else {
        node.visible = false
        hidden.set(id, node)
      }
    },
    show: (pieceId) => {
      const node = hidden.get(pieceId)
      if (!node) return
      node.visible = true
      hidden.delete(pieceId)
    },
    showAll: () => {
      for (const node of hidden.values()) node.visible = true
      hidden.clear()
    },
    list: (root) => (root ? [...hidden.entries()].map(([pieceId, node]) => ({ pieceId, path: namePath(node, root) })) : []),
    clear: () => hidden.clear()
  }
}
