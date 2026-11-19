import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Group, Mesh, Object3D } from 'three'
import { buildOutline, MAX_OUTLINE_NODES } from '../src/outliner.ts'
import { findPiece } from '../src/piece-id.ts'

const tree = (): { root: Group; wheel: Mesh } => {
  const root = new Group()
  root.name = 'Scene'
  const body = new Group()
  body.name = 'Body'
  const wheel = new Mesh()
  wheel.name = 'Wheel'
  body.add(wheel)
  root.add(body)
  return { root, wheel }
}

describe('buildOutline', () => {
  it('nests every node under the root, by name, and tells meshes from groups', () => {
    const { root } = tree()
    const { tree: outline, truncated } = buildOutline(root)
    assert.equal(truncated, false)
    assert.equal(outline.name, 'Scene')
    assert.equal(outline.isMesh, false)
    assert.equal(outline.children.length, 1)
    const body = outline.children[0]!
    assert.equal(body.name, 'Body')
    assert.equal(body.isMesh, false)
    assert.equal(body.children.length, 1)
    const wheel = body.children[0]!
    assert.equal(wheel.name, 'Wheel')
    assert.equal(wheel.isMesh, true)
    assert.deepEqual(wheel.children, [])
  })

  it('gives each node the id that finds it again, as piece-id.ts does for annotations', () => {
    const { root, wheel } = tree()
    const { tree: outline } = buildOutline(root)
    const found = findPiece(outline.children[0]!.children[0]!.pieceId, root)
    assert.equal(found, wheel)
  })

  it('stops past a node limit, so a pathological scene cannot hang the panel', () => {
    const root = new Group()
    root.name = 'Scene'
    for (let index = 0; index < MAX_OUTLINE_NODES + 50; index++) {
      const child = new Object3D()
      child.name = `n${index}`
      root.add(child)
    }
    const { tree: outline, truncated } = buildOutline(root)
    assert.equal(truncated, true)
    assert.ok(outline.children.length < MAX_OUTLINE_NODES + 50)
  })
})
