import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, afterEach, beforeEach, describe, it } from 'node:test'
import { glb, triangleGltf } from '../fixtures/models.ts'
import { decodePng, pixelAt } from '../fixtures/png-decode.ts'
import { closeBrowser, type Frame, openFrame } from './harness.ts'

let frame: Frame
beforeEach(async () => {
  frame = await openFrame()
})
afterEach(() => frame.close())
after(closeBrowser)

const button = () => frame.page.getByRole('button', { name: 'Save a screenshot' })

/** Where the triangle sits, as a fraction of the canvas, so it is found whatever the exported image's resolution. */
async function trianglePixelFraction(): Promise<{ fx: number; fy: number }> {
  const box = await frame.page.locator('.viewport canvas').boundingBox()
  assert.ok(box)
  return { fx: 0.5 - 20 / box.width, fy: 0.5 + 10 / box.height }
}

describe('screenshot', () => {
  it('is disabled until a model is on screen', async () => {
    assert.equal(await button().isDisabled(), true)
    await frame.open({ bytes: glb(triangleGltf()) })
    assert.equal(await button().isDisabled(), false)
  })

  it('downloads the current view, with the model drawn in it, as a dated PNG', async () => {
    await frame.open({ bytes: glb(triangleGltf()) })
    const { fx, fy } = await trianglePixelFraction()
    const [download] = await Promise.all([frame.page.waitForEvent('download'), button().click()])
    assert.match(download.suggestedFilename(), /^3d-viewer-\d{4}-\d{2}-\d{2}-\d{6}\.png$/)
    const path = await download.path()
    assert.ok(path)
    const png = decodePng(await readFile(path))
    const pixel = pixelAt(png, Math.round(fx * png.width), Math.round(fy * png.height))
    // The triangle's own colour (0.8, 0.5, 0.2) stays more red than blue through tone mapping.
    assert.ok(pixel[0]! > pixel[2]!, `expected the orange triangle in the screenshot, got rgb(${pixel.join(',')})`)
  })

  it('makes no request Orca’s frame would have refused', async () => {
    await frame.open({ bytes: glb(triangleGltf()) })
    await Promise.all([frame.page.waitForEvent('download'), button().click()])
    const report = await frame.report()
    assert.deepEqual(report.egress, [])
    assert.deepEqual(report.hostCalls, [])
  })
})
