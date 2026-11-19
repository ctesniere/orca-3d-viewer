import assert from 'node:assert/strict'
import { after, afterEach, beforeEach, describe, it } from 'node:test'
import { glb, triangleGltf } from '../fixtures/models.ts'
import { closeBrowser, type Frame, openFrame } from './harness.ts'

let frame: Frame
beforeEach(async () => {
  frame = await openFrame()
})
afterEach(() => frame.close())
after(closeBrowser)

const clippingButton = () => frame.page.getByRole('button', { name: 'Clipping plane' })
const panel = () => frame.page.getByRole('dialog', { name: 'Clipping plane' })
const enabled = () => panel().getByRole('checkbox', { name: 'Enabled' })
const position = () => panel().getByRole('slider', { name: 'Position' })
const flip = () => panel().getByRole('checkbox', { name: 'Flip side' })

const orangeness = (pixel: number[]): number => pixel[0]! - pixel[2]!
const ORANGE = 40

/** The colour of the model at a point the orange triangle covers, from the composited page. */
async function modelPixel(): Promise<number[]> {
  const box = await frame.page.locator('.viewport canvas').boundingBox()
  assert.ok(box)
  return frame.pixel(Math.round(box.x + box.width / 2 - 20), Math.round(box.y + box.height / 2 + 10))
}

describe('clipping', () => {
  it('is disabled until a model is on screen', async () => {
    assert.equal(await clippingButton().isDisabled(), true)
    await frame.open({ bytes: glb(triangleGltf()) })
    assert.equal(await clippingButton().isDisabled(), false)
  })

  it('opens from the toolbar with clipping off, and closes with Escape or Close', async () => {
    await frame.open({ bytes: glb(triangleGltf()) })
    assert.equal(await panel().isVisible(), false)
    await clippingButton().click()
    assert.equal(await panel().isVisible(), true)
    assert.equal(await enabled().isChecked(), false)
    assert.equal(await position().isDisabled(), true)
    await frame.page.keyboard.press('Escape')
    assert.equal(await panel().isVisible(), false)
    assert.equal(await clippingButton().getAttribute('aria-pressed'), 'false')
    await clippingButton().click()
    await panel().getByRole('button', { name: 'Close' }).click()
    assert.equal(await panel().isVisible(), false)
  })

  it('cuts the model away past the plane, and flipping keeps the other side instead', async () => {
    await frame.open({ bytes: glb(triangleGltf()) })
    assert.ok(orangeness(await modelPixel()) > ORANGE, 'the triangle should show with clipping off')
    await clippingButton().click()
    await enabled().check()
    await position().fill('1')
    assert.ok(orangeness(await modelPixel()) < ORANGE, 'the far side of the model should be cut away')
    await flip().check()
    assert.ok(orangeness(await modelPixel()) > ORANGE, 'flipping should keep the near side instead')
    await enabled().uncheck()
    assert.ok(orangeness(await modelPixel()) > ORANGE, 'turning clipping off should show the whole model again')
  })

  it('keeps the choice for the next time, like the other look preferences', async () => {
    await frame.open({ bytes: glb(triangleGltf()) })
    await clippingButton().click()
    await enabled().check()
    await frame.page.reload()
    await frame.open({ bytes: glb(triangleGltf()) })
    await clippingButton().click()
    assert.equal(await enabled().isChecked(), true)
  })

  it('makes no request Orca’s frame would have refused', async () => {
    await frame.open({ bytes: glb(triangleGltf()) })
    await clippingButton().click()
    await enabled().check()
    await position().fill('1')
    const report = await frame.report()
    assert.deepEqual(report.egress, [])
    assert.deepEqual(report.hostCalls, [])
  })
})
