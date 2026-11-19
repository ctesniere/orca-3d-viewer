import assert from 'node:assert/strict'
import { after, afterEach, beforeEach, describe, it } from 'node:test'
import { glb, type GltfJson, triangleGltf } from '../fixtures/models.ts'
import { closeBrowser, type Frame, openFrame } from './harness.ts'

let frame: Frame
beforeEach(async () => {
  frame = await openFrame()
})
afterEach(() => frame.close())
after(closeBrowser)

function namedTriangleGltf(name: string): GltfJson {
  const json = triangleGltf()
  ;(json as { nodes: unknown[] }).nodes = [{ name, mesh: 0 }]
  return json
}

const outlineButton = () => frame.page.getByRole('button', { name: 'Model structure' })
const panel = () => frame.page.getByRole('dialog', { name: 'Model structure' })
const wheelName = () => panel().getByRole('button', { name: 'Wheel', exact: true })
const wheelRow = () => panel().locator('.outline-row', { hasText: 'Wheel' })
const hiddenPanel = () => frame.page.getByRole('region', { name: 'Hidden pieces' })

const orangeness = (pixel: number[]): number => pixel[0]! - pixel[2]!
const ORANGE = 40

/** Where the triangle sits in the composited page, as other single-triangle tests find it. */
async function trianglePoint(): Promise<{ x: number; y: number }> {
  const box = await frame.page.locator('.viewport canvas').boundingBox()
  assert.ok(box)
  return { x: Math.round(box.x + box.width / 2 - 20), y: Math.round(box.y + box.height / 2 + 10) }
}

describe('outliner', () => {
  it('is disabled until a model is on screen', async () => {
    assert.equal(await outlineButton().isDisabled(), true)
    await frame.open({ bytes: glb(namedTriangleGltf('Wheel')) })
    assert.equal(await outlineButton().isDisabled(), false)
  })

  it('opens from the toolbar and lists the model’s named node', async () => {
    await frame.open({ bytes: glb(namedTriangleGltf('Wheel')) })
    assert.equal(await panel().isVisible(), false)
    await outlineButton().click()
    assert.equal(await panel().isVisible(), true)
    assert.equal(await outlineButton().getAttribute('aria-pressed'), 'true')
    await wheelName().waitFor()
  })

  it('hides and shows the named piece from its own eye button, and the Hidden pieces panel agrees', async () => {
    await frame.open({ bytes: glb(namedTriangleGltf('Wheel')) })
    const { x, y } = await trianglePoint()
    await outlineButton().click()
    assert.ok(orangeness(await frame.pixel(x, y)) > ORANGE, 'the triangle should show before anything is hidden')
    await wheelRow().getByRole('button', { name: 'Hide this piece' }).click()
    assert.ok(orangeness(await frame.pixel(x, y)) < ORANGE, 'the piece should no longer be drawn')
    assert.equal(await hiddenPanel().isVisible(), true)
    await wheelRow().getByRole('button', { name: 'Show this piece again' }).click()
    assert.ok(orangeness(await frame.pixel(x, y)) > ORANGE, 'the piece should be drawn again')
    assert.equal(await hiddenPanel().isVisible(), false)
  })

  it('closes with Escape or Close, and un-presses the toolbar button', async () => {
    await frame.open({ bytes: glb(namedTriangleGltf('Wheel')) })
    await outlineButton().click()
    await frame.page.keyboard.press('Escape')
    assert.equal(await panel().isVisible(), false)
    assert.equal(await outlineButton().getAttribute('aria-pressed'), 'false')
    await outlineButton().click()
    await panel().getByRole('button', { name: 'Close' }).click()
    assert.equal(await panel().isVisible(), false)
  })

  it('makes no request Orca’s frame would have refused', async () => {
    await frame.open({ bytes: glb(namedTriangleGltf('Wheel')) })
    await outlineButton().click()
    await wheelRow().getByRole('button', { name: 'Hide this piece' }).click()
    const report = await frame.report()
    assert.deepEqual(report.egress, [])
    assert.deepEqual(report.hostCalls, [])
  })
})
