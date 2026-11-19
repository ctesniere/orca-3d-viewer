import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clippingFrom, clippingPlane, DEFAULT_CLIPPING } from '../src/clipping.ts'

const bounds = { min: [-2, -1, -4] as [number, number, number], max: [2, 3, 0] as [number, number, number] }

describe('clippingPlane', () => {
  it('is null while clipping is off, whatever the other fields say', () => {
    assert.equal(clippingPlane({ enabled: false, axis: 'x', position: 0.5, flipped: false }, bounds), null)
  })

  it('cuts at the fraction of the bounds along the chosen axis, keeping the far side', () => {
    assert.deepEqual(clippingPlane({ enabled: true, axis: 'x', position: 0.5, flipped: false }, bounds), { normal: [1, 0, 0], constant: 0 })
    assert.deepEqual(clippingPlane({ enabled: true, axis: 'y', position: 0, flipped: false }, bounds), { normal: [0, 1, 0], constant: 1 })
    assert.deepEqual(clippingPlane({ enabled: true, axis: 'z', position: 1, flipped: false }, bounds), { normal: [0, 0, 1], constant: 0 })
  })

  it('keeps the near side instead when flipped', () => {
    assert.deepEqual(clippingPlane({ enabled: true, axis: 'y', position: 0.25, flipped: true }, bounds), { normal: [0, -1, 0], constant: 0 })
  })
})

describe('clippingFrom', () => {
  it('falls back to the default for anything that is not a valid choice', () => {
    assert.deepEqual(clippingFrom(null), DEFAULT_CLIPPING)
    assert.deepEqual(clippingFrom({ enabled: 'yes', axis: 'w', position: 'half', flipped: 1 }), DEFAULT_CLIPPING)
    assert.deepEqual(clippingFrom({ enabled: true, axis: 'y', position: 1.5, flipped: true }), { ...DEFAULT_CLIPPING, enabled: true, axis: 'y', flipped: true, position: 1 })
    assert.deepEqual(clippingFrom({ enabled: true, axis: 'y', position: -0.5, flipped: true }), { ...DEFAULT_CLIPPING, enabled: true, axis: 'y', flipped: true, position: 0 })
  })

  it('keeps a valid choice as it is', () => {
    const clipping = { enabled: true, axis: 'z' as const, position: 0.3, flipped: true }
    assert.deepEqual(clippingFrom(clipping), clipping)
  })

  it('never lets a stored prototype supply a field', () => {
    const hostile = JSON.parse('{"enabled":true,"__proto__":{"axis":"z"}}')
    assert.equal(clippingFrom(hostile).axis, DEFAULT_CLIPPING.axis)
  })
})
