import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { checkerPixels } from '../src/uv-checker.ts'

describe('checkerPixels', () => {
  it('is size*size RGBA pixels, fully opaque', () => {
    const pixels = checkerPixels(8, 2)
    assert.equal(pixels.length, 8 * 8 * 4)
    for (let at = 3; at < pixels.length; at += 4) assert.equal(pixels[at], 255)
  })

  it('alternates light and dark squares in a grid of the given size', () => {
    const pixels = checkerPixels(8, 2)
    const at = (x: number, y: number): number => (y * 8 + x) * 4
    // Cell (0,0) and cell (1,1) are the same colour; cell (1,0) and (0,1) are the other one.
    assert.deepEqual([...pixels.slice(at(0, 0), at(0, 0) + 3)], [...pixels.slice(at(4, 4), at(4, 4) + 3)])
    assert.deepEqual([...pixels.slice(at(4, 0), at(4, 0) + 3)], [...pixels.slice(at(0, 4), at(0, 4) + 3)])
    assert.notDeepEqual([...pixels.slice(at(0, 0), at(0, 0) + 3)], [...pixels.slice(at(4, 0), at(4, 0) + 3)])
  })

  it('is the same pixels every time, so the overlay never flickers between renders', () => {
    assert.deepEqual(checkerPixels(), checkerPixels())
  })
})
