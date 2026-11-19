import assert from 'node:assert/strict'
import { after, afterEach, beforeEach, describe, it } from 'node:test'
import { glb, type GltfJson } from '../fixtures/models.ts'
import { closeBrowser, type Frame, openFrame } from './harness.ts'

let frame: Frame
beforeEach(async () => {
  frame = await openFrame()
})
afterEach(() => frame.close())
after(closeBrowser)

const uvCheckerButton = () => frame.page.getByRole('button', { name: 'UV checker' })

const QUAD_POSITIONS = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0])
const QUAD_UVS = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0])
const QUAD_INDICES = new Uint16Array([0, 1, 2, 0, 2, 3])

function bytesOf(array: Float32Array | Uint16Array): Uint8Array {
  return new Uint8Array(array.buffer, array.byteOffset, array.byteLength)
}
function padTo4(bytes: Uint8Array): Uint8Array {
  const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4)
  padded.set(bytes)
  return padded
}

const buildBin = (): { bin: Uint8Array; positions: Uint8Array; uvs: Uint8Array; indices: Uint8Array } => {
  const positions = bytesOf(QUAD_POSITIONS)
  const uvs = bytesOf(QUAD_UVS)
  const indices = padTo4(bytesOf(QUAD_INDICES))
  return { bin: new Uint8Array([...positions, ...uvs, ...indices]), positions, uvs, indices }
}

// A plain, untextured quad: the UV checker has nothing to replace but its own colour, unlike a model
// with no TEXCOORD_0 at all (the other fixtures here), where a map would have nowhere to map onto.
function quadGltf(): GltfJson {
  const { bin, positions, uvs, indices } = buildBin()
  return {
    asset: { version: '2.0', generator: 'orca-3d-viewer tests' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.8, 0.5, 0.2, 1] } }],
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: uvs.byteLength },
      { buffer: 0, byteOffset: positions.byteLength + uvs.byteLength, byteLength: indices.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
      { bufferView: 1, componentType: 5126, count: 4, type: 'VEC2' },
      { bufferView: 2, componentType: 5123, count: 6, type: 'SCALAR' }
    ]
  }
}
const QUAD_GLB = (): Uint8Array => glb(quadGltf(), buildBin().bin)

/** How orange the quad's own colour reads; a grey checker square reads near zero on this. */
const orangeness = (pixel: number[]): number => pixel[0]! - pixel[2]!
const ORANGE = 40

async function modelPixel(): Promise<number[]> {
  const box = await frame.page.locator('.viewport canvas').boundingBox()
  assert.ok(box)
  return frame.pixel(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2))
}

describe('UV checker', () => {
  it('is disabled until a model is on screen', async () => {
    assert.equal(await uvCheckerButton().isDisabled(), true)
    await frame.open({ bytes: QUAD_GLB() })
    assert.equal(await uvCheckerButton().isDisabled(), false)
  })

  it('replaces the surface with a checker pattern, and brings the original colour back when turned off', async () => {
    await frame.open({ bytes: QUAD_GLB() })
    assert.ok(orangeness(await modelPixel()) > ORANGE, 'the quad’s own colour shows with the checker off')
    await uvCheckerButton().click()
    assert.equal(await uvCheckerButton().getAttribute('aria-pressed'), 'true')
    assert.ok(orangeness(await modelPixel()) < ORANGE, 'a checker square is grey, not orange')
    await uvCheckerButton().click()
    assert.equal(await uvCheckerButton().getAttribute('aria-pressed'), 'false')
    assert.ok(orangeness(await modelPixel()) > ORANGE, 'the quad’s own colour, not the checker, shows again')
  })

  it('keeps the choice for the next time, like the other look preferences', async () => {
    await frame.open({ bytes: QUAD_GLB() })
    await uvCheckerButton().click()
    await frame.page.reload()
    await frame.open({ bytes: QUAD_GLB() })
    assert.equal(await uvCheckerButton().getAttribute('aria-pressed'), 'true')
    assert.ok(orangeness(await modelPixel()) < ORANGE, 'the checker should already show on this new model')
  })

  it('makes no request Orca’s frame would have refused', async () => {
    await frame.open({ bytes: QUAD_GLB() })
    await uvCheckerButton().click()
    const report = await frame.report()
    assert.deepEqual(report.egress, [])
    assert.deepEqual(report.hostCalls, [])
  })
})
