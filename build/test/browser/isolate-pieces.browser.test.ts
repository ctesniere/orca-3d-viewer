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

const ISOLATE_MODE = 'Hide: click the model to hide a piece and see what is behind it'
const isolateButton = () => frame.page.getByRole('button', { name: ISOLATE_MODE })
const annotateButton = () => frame.page.getByRole('button', { name: 'Annotate: click the model to describe a change for the agent' })
const panel = () => frame.page.getByRole('region', { name: 'Hidden pieces' })
const showButton = () => panel().getByRole('button', { name: 'Show this piece again' })
const showAllButton = () => panel().getByRole('button', { name: 'Show all' })

/** How orange the triangle's own colour reads; well above its background in either theme, which is roughly grey. */
const orangeness = (pixel: number[]): number => pixel[0]! - pixel[2]!
const ORANGE = 40

/** Clicks around the middle of the view until a piece is hidden; the model is a thin triangle. */
async function hideTriangle(): Promise<{ x: number; y: number }> {
  const box = await frame.page.locator('.viewport canvas').boundingBox()
  assert.ok(box)
  for (const dy of [0, 10, -10, 20, -20, 30, -30, 45, -45]) {
    for (const dx of [0, -10, 10, -20, 20, -30, 30, -45, 45]) {
      const x = box.x + box.width / 2 + dx
      const y = box.y + box.height / 2 + dy
      await frame.page.mouse.click(x, y)
      if (await panel().isVisible()) return { x, y }
    }
  }
  throw new Error('no piece was found to hide')
}

describe('isolating pieces', () => {
  it('is disabled until a model is on screen', async () => {
    assert.equal(await isolateButton().isDisabled(), true)
    await frame.open({ bytes: glb(triangleGltf()) })
    assert.equal(await isolateButton().isDisabled(), false)
  })

  it('turns off Annotate, and Annotate turns it off back', async () => {
    await frame.open({ bytes: glb(triangleGltf()) })
    await annotateButton().click()
    assert.equal(await annotateButton().getAttribute('aria-pressed'), 'true')
    await isolateButton().click()
    assert.equal(await isolateButton().getAttribute('aria-pressed'), 'true')
    assert.equal(await annotateButton().getAttribute('aria-pressed'), 'false')
    await annotateButton().click()
    assert.equal(await annotateButton().getAttribute('aria-pressed'), 'true')
    assert.equal(await isolateButton().getAttribute('aria-pressed'), 'false')
  })

  it('hides the piece a click lands on, lists it, and shows it again on its own Show button', async () => {
    await frame.open({ bytes: glb(triangleGltf()) })
    await isolateButton().click()
    const { x, y } = await hideTriangle()
    assert.equal(await panel().isVisible(), true)
    assert.ok(orangeness(await frame.pixel(Math.round(x), Math.round(y))) < ORANGE, 'the hidden piece should no longer be drawn')
    await showButton().click()
    assert.equal(await panel().isVisible(), false)
    assert.ok(orangeness(await frame.pixel(Math.round(x), Math.round(y))) > ORANGE, 'the piece should be drawn again')
  })

  it('shows every hidden piece again on Show all', async () => {
    await frame.open({ bytes: glb(triangleGltf()) })
    await isolateButton().click()
    const { x, y } = await hideTriangle()
    assert.ok(orangeness(await frame.pixel(Math.round(x), Math.round(y))) < ORANGE)
    await showAllButton().click()
    assert.equal(await panel().isVisible(), false)
    assert.ok(orangeness(await frame.pixel(Math.round(x), Math.round(y))) > ORANGE, 'the piece should be drawn again')
  })

  it('makes no request Orca’s frame would have refused', async () => {
    await frame.open({ bytes: glb(triangleGltf()) })
    await isolateButton().click()
    await hideTriangle()
    await showAllButton().click()
    const report = await frame.report()
    assert.deepEqual(report.egress, [])
    assert.deepEqual(report.hostCalls, [])
  })
})
