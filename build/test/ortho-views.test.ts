import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { orthoFrame } from '../src/ortho-views.ts'

describe('orthoFrame', () => {
  it('sits on the axis past the model, the right distance away, looking back at its centre', () => {
    const { position } = orthoFrame('front', [1, 2, 3], 5, 1)
    assert.deepEqual(position, [1, 2, 3 + 5 * 4])
  })

  it('places the camera above for top, aside for side, and front for front', () => {
    assert.deepEqual(orthoFrame('front', [0, 0, 0], 2, 1).position, [0, 0, 8])
    assert.deepEqual(orthoFrame('top', [0, 0, 0], 2, 1).position, [0, 8, 0])
    assert.deepEqual(orthoFrame('side', [0, 0, 0], 2, 1).position, [8, 0, 0])
  })

  it('gives top a screen-up that is not parallel with looking straight down', () => {
    assert.deepEqual(orthoFrame('top', [0, 0, 0], 2, 1).up, [0, 0, -1])
    assert.deepEqual(orthoFrame('front', [0, 0, 0], 2, 1).up, [0, 1, 0])
    assert.deepEqual(orthoFrame('side', [0, 0, 0], 2, 1).up, [0, 1, 0])
  })

  it('frames the whole bounding sphere, widening past a square aspect and heightening below it', () => {
    const square = orthoFrame('front', [0, 0, 0], 3, 1)
    assert.deepEqual(square, { ...square, left: -3, right: 3, top: 3, bottom: -3 })
    const wide = orthoFrame('front', [0, 0, 0], 3, 2)
    assert.deepEqual([wide.left, wide.right, wide.top, wide.bottom], [-6, 6, 3, -3])
    const tall = orthoFrame('front', [0, 0, 0], 3, 0.5)
    assert.deepEqual([tall.left, tall.right, tall.top, tall.bottom], [-3, 3, 6, -6])
  })
})
