import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_LIGHTING, LIGHTING_LIMITS, lightingFrom, lightLevels } from '../src/lighting.ts'

describe('lighting levels', () => {
  it('give the default look the viewer always had: a 0.6 hemisphere, a 1.2 key light from (1, 2, 1.5) and the room', () => {
    const levels = lightLevels(DEFAULT_LIGHTING, false)
    assert.equal(levels.hemisphere, 0.6)
    assert.equal(levels.key, 1.2)
    assert.equal(levels.keyVisible, true)
    assert.equal(levels.environment, 1)
    assert.equal(levels.ambient, 0)
    const [x, y, z] = levels.keyPosition
    const length = Math.hypot(1, 2, 1.5)
    assert.ok(Math.abs(x / 3 - 1 / length) < 0.01 && Math.abs(y / 3 - 2 / length) < 0.01 && Math.abs(z / 3 - 1.5 / length) < 0.01)
  })

  it('light a model with the lights it carries only a little, and without the key light', () => {
    const levels = lightLevels(DEFAULT_LIGHTING, true)
    assert.equal(levels.hemisphere, 0.15)
    assert.equal(levels.keyVisible, false)
  })

  it('use only what each type names', () => {
    const only = (mode: 'studio' | 'environment' | 'directional' | 'flat') => lightLevels({ ...DEFAULT_LIGHTING, mode }, false)
    assert.deepEqual([only('environment').hemisphere, only('environment').keyVisible, only('environment').environment], [0, false, 1])
    assert.deepEqual([only('directional').hemisphere, only('directional').keyVisible, only('directional').environment], [0.6, true, 0])
    const flat = only('flat')
    assert.deepEqual([flat.hemisphere, flat.keyVisible, flat.environment], [0, false, 0])
    assert.ok(flat.ambient > 0)
  })

  it('scale every light with the intensity, and switch them all off at 0', () => {
    const half = lightLevels({ ...DEFAULT_LIGHTING, intensity: 0.5 }, false)
    assert.deepEqual([half.hemisphere, half.key, half.environment], [0.3, 0.6, 0.5])
    const none = lightLevels({ ...DEFAULT_LIGHTING, intensity: 0 }, false)
    assert.deepEqual([none.hemisphere, none.key, none.environment, none.ambient], [0, 0, 0, 0])
  })

  it('put the key light in front at azimuth 0, to the right at 90 and overhead at elevation 90', () => {
    const at = (azimuth: number, elevation: number) => lightLevels({ ...DEFAULT_LIGHTING, azimuth, elevation }, false).keyPosition.map((value) => Math.round(value * 1000) / 1000)
    assert.deepEqual(at(0, 0), [0, 0, 3])
    assert.deepEqual(at(90, 0), [3, 0, 0])
    assert.deepEqual(at(0, 90), [0, 3, 0])
  })
})

describe('stored lighting', () => {
  it('reads a valid choice back, and clamps numbers into their range', () => {
    assert.deepEqual(lightingFrom({ mode: 'flat', intensity: 2, exposure: 0.5, azimuth: -90, elevation: 10 }), { mode: 'flat', intensity: 2, exposure: 0.5, azimuth: -90, elevation: 10 })
    const wild = lightingFrom({ intensity: 99, exposure: -4, azimuth: 1000, elevation: -3 })
    assert.deepEqual([wild.intensity, wild.exposure, wild.azimuth, wild.elevation], [LIGHTING_LIMITS.intensity.max, LIGHTING_LIMITS.exposure.min, LIGHTING_LIMITS.azimuth.max, LIGHTING_LIMITS.elevation.min])
  })

  it('falls back to the defaults for anything else, and ignores inherited properties', () => {
    for (const stored of [undefined, null, 5, 'studio', [], { mode: 'disco', intensity: 'high', exposure: NaN, azimuth: Infinity, elevation: null }]) {
      assert.deepEqual(lightingFrom(stored), DEFAULT_LIGHTING)
    }
    assert.deepEqual(lightingFrom(JSON.parse('{"__proto__":{"mode":"flat"},"constructor":{"intensity":2}}')), DEFAULT_LIGHTING)
    assert.deepEqual(lightingFrom(Object.create({ mode: 'flat' })), DEFAULT_LIGHTING)
  })
})
