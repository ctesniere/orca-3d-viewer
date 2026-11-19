// The model's scene graph as a tree the outliner panel can draw: tested with plain Three.js objects,
// no renderer involved.
import type { Object3D } from 'three'
import { pieceIdOf } from './piece-id.ts'

export type OutlineNode = {
  pieceId: string
  name: string
  /** Whether this node draws geometry of its own, so a click here can actually find something to hide or focus. */
  isMesh: boolean
  children: OutlineNode[]
}

// A node count the existing glTF and mesh budgets already allow past this, by far: this caps how much of
// the tree the panel draws, not what the viewer opens.
export const MAX_OUTLINE_NODES = 2000

export function buildOutline(root: Object3D): { tree: OutlineNode; truncated: boolean } {
  let count = 1
  let truncated = false
  const visit = (node: Object3D): OutlineNode => {
    const children = node.children.flatMap((child) => {
      if (count >= MAX_OUTLINE_NODES) {
        truncated = true
        return []
      }
      count++
      return [visit(child)]
    })
    return { pieceId: pieceIdOf(node, root), name: node.name, isMesh: (node as { isMesh?: boolean }).isMesh === true, children }
  }
  return { tree: visit(root), truncated }
}
