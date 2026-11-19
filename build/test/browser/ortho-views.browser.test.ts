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

const viewSelect = () => frame.page.getByRole('combobox', { name: 'Camera view' })
const resetButton = () => frame.page.getByRole('button', { name: 'Reset view' })

const orangeness = (pixel: number[]): number => pixel[0]! - pixel[2]!
const ORANGE = 40

/** The colour of the model at a point the orange triangle covers when seen from the front, from the composited page. */
async function modelPixel(): Promise<number[]> {
  const box = await frame.page.locator('.viewport canvas').boundingBox()
  assert.ok(box)
  return frame.pixel(Math.round(box.x + box.width / 2 - 20), Math.round(box.y + box.height / 2 + 10))
}

/** Clicks around the middle of the view until the annotation popover opens; the model is a thin triangle. */
async function clickModel(): Promise<boolean> {
  const box = await frame.page.locator('.viewport canvas').boundingBox()
  assert.ok(box)
  for (const dy of [0, 10, -10, 20, -20, 30, -30, 45, -45]) {
    for (const dx of [0, -10, 10, -20, 20, -30, 30, -45, 45]) {
      await frame.page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy)
      if (await frame.page.locator('.popover').isVisible()) return true
    }
  }
  return false
}

describe('camera views', () => {
  it('is disabled until a model is on screen, and starts on Perspective', async () => {
    assert.equal(await viewSelect().isDisabled(), true)
    await frame.open({ bytes: glb(triangleGltf()) })
    assert.equal(await viewSelect().isDisabled(), false)
    assert.equal(await viewSelect().inputValue(), 'perspective')
  })

  it('front looks the same as the starting perspective view, top and side look along another axis', async () => {
    await frame.open({ bytes: glb(triangleGltf()) })
    const perspective = orangeness(await modelPixel())
    assert.ok(perspective > ORANGE, 'the triangle should show in the starting perspective view')
    await viewSelect().selectOption('front')
    assert.ok(orangeness(await modelPixel()) > ORANGE, 'front looks down the same axis as the starting view')
    await viewSelect().selectOption('top')
    assert.ok(orangeness(await modelPixel()) < ORANGE, 'the flat triangle, edge-on from the top, should not cover this point any more')
    await viewSelect().selectOption('side')
    assert.ok(orangeness(await modelPixel()) < ORANGE, 'the flat triangle, edge-on from the side, should not cover this point any more')
    await viewSelect().selectOption('perspective')
    assert.ok(orangeness(await modelPixel()) > ORANGE, 'back to perspective, the triangle shows again')
  })

  it('Reset view returns to Perspective', async () => {
    await frame.open({ bytes: glb(triangleGltf()) })
    await viewSelect().selectOption('top')
    assert.equal(await viewSelect().inputValue(), 'top')
    await resetButton().click()
    assert.equal(await viewSelect().inputValue(), 'perspective')
  })

  it('still picks a spot to annotate while looking from the front', async () => {
    await frame.open({ bytes: glb(triangleGltf()) })
    await viewSelect().selectOption('front')
    await frame.page.getByRole('button', { name: 'Annotate: click the model to describe a change for the agent' }).click()
    assert.equal(await clickModel(), true)
  })

  it('resets to Perspective for the next model, even keeping other toggles over a save', async () => {
    await frame.open({ bytes: glb(triangleGltf()) })
    await viewSelect().selectOption('top')
    await frame.open({ bytes: glb(triangleGltf()) })
    assert.equal(await viewSelect().inputValue(), 'perspective')
  })

  it('makes no request Orca’s frame would have refused', async () => {
    await frame.open({ bytes: glb(triangleGltf()) })
    await viewSelect().selectOption('top')
    await viewSelect().selectOption('side')
    await resetButton().click()
    const report = await frame.report()
    assert.deepEqual(report.egress, [])
    assert.deepEqual(report.hostCalls, [])
  })
})
