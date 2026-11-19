import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Group, Mesh, Object3D } from 'three'
import { createIsolation } from '../src/isolation.ts'

const tree = (): { root: Group; wheel: Mesh; body: Group } => {
  const root = new Group()
  root.name = 'Scene'
  const body = new Group()
  body.name = 'Body'
  const wheel = new Mesh()
  wheel.name = 'Wheel'
  body.add(new Object3D(), wheel)
  root.add(body)
  return { root, wheel, body }
}

describe('isolation', () => {
  it('hides a piece on toggle, and shows it again on a second toggle', () => {
    const { root, wheel } = tree()
    const isolation = createIsolation()
    assert.deepEqual(isolation.list(root), [])
    isolation.toggle(wheel, root)
    assert.equal(wheel.visible, false)
    assert.equal(isolation.list(root).length, 1)
    assert.deepEqual(isolation.list(root)[0]!.path, ['Scene', 'Body', 'Wheel'])
    isolation.toggle(wheel, root)
    assert.equal(wheel.visible, true)
    assert.deepEqual(isolation.list(root), [])
  })

  it('shows one hidden piece by id, leaving the others hidden', () => {
    const { root, wheel, body } = tree()
    const isolation = createIsolation()
    isolation.toggle(wheel, root)
    isolation.toggle(body, root)
    const [first, second] = isolation.list(root)
    isolation.show(first!.pieceId)
    assert.equal(wheel.visible, true)
    assert.equal(body.visible, false)
    assert.deepEqual(isolation.list(root).map((piece) => piece.pieceId), [second!.pieceId])
  })

  it('does nothing when asked to show an id it is not holding', () => {
    const { root, wheel } = tree()
    const isolation = createIsolation()
    isolation.toggle(wheel, root)
    isolation.show('not a known id')
    assert.equal(wheel.visible, false)
    assert.equal(isolation.list(root).length, 1)
  })

  it('shows every hidden piece at once', () => {
    const { root, wheel, body } = tree()
    const isolation = createIsolation()
    isolation.toggle(wheel, root)
    isolation.toggle(body, root)
    isolation.showAll()
    assert.equal(wheel.visible, true)
    assert.equal(body.visible, true)
    assert.deepEqual(isolation.list(root), [])
  })

  it('forgets every hidden piece on clear, as when a new model replaces the old one', () => {
    const { root, wheel } = tree()
    const isolation = createIsolation()
    isolation.toggle(wheel, root)
    isolation.clear()
    assert.deepEqual(isolation.list(root), [])
    // Why not reset to visible: the old node is about to be disposed with the rest of its model.
    assert.equal(wheel.visible, false)
  })

  it('reports nothing without a root to resolve paths against', () => {
    const isolation = createIsolation()
    assert.deepEqual(isolation.list(null), [])
  })
})
