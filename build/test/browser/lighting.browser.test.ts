import assert from 'node:assert/strict'
import { after, afterEach, beforeEach, describe, it } from 'node:test'
import { glb, triangleGltf } from '../fixtures/models.ts'
import { closeBrowser, type Frame, openFrame } from './harness.ts'

let frame: Frame
beforeEach(async () => {
  frame = await openFrame()
  await frame.open({ bytes: glb(triangleGltf()) })
})
afterEach(() => frame.close())
after(closeBrowser)

const panel = () => frame.page.getByRole('dialog', { name: 'Lighting' })
const toggle = () => frame.page.getByRole('button', { name: 'Lighting', exact: true })
const slider = (name: string) => panel().getByRole('slider', { name })
const mode = () => panel().getByRole('combobox', { name: 'Type' })

/** The colour of the model at a point the orange triangle covers, from the composited page. */
async function modelPixel(): Promise<number[]> {
  const box = await frame.page.locator('.viewport canvas').boundingBox()
  assert.ok(box)
  return frame.pixel(Math.round(box.x + box.width / 2 - 20), Math.round(box.y + box.height / 2 + 10))
}
const brightness = (pixel: number[]): number => pixel[0]! + pixel[1]! + pixel[2]!

describe('lighting', () => {
  it('opens from the toolbar with the default look, and closes with Escape or Close', async () => {
    assert.equal(await panel().isVisible(), false)
    await toggle().click()
    assert.equal(await panel().isVisible(), true)
    assert.equal(await toggle().getAttribute('aria-pressed'), 'true')
    assert.equal(await mode().inputValue(), 'studio')
    assert.equal(await slider('Intensity').inputValue(), '1')
    assert.equal(await slider('Exposure').inputValue(), '1')
    await frame.page.keyboard.press('Escape')
    assert.equal(await panel().isVisible(), false)
    assert.equal(await toggle().getAttribute('aria-pressed'), 'false')
    await toggle().click()
    await panel().getByRole('button', { name: 'Close' }).click()
    assert.equal(await panel().isVisible(), false)
  })

  it('darkens the model with a lower exposure or intensity, and brightens it with a higher one', async () => {
    const before = brightness(await modelPixel())
    await toggle().click()
    await slider('Exposure').fill('0.4')
    const dim = brightness(await modelPixel())
    assert.ok(dim < before * 0.8, `${dim} should be darker than ${before}`)
    await slider('Exposure').fill('1')
    await slider('Intensity').fill('0.2')
    assert.ok(brightness(await modelPixel()) < before * 0.8)
    await slider('Intensity').fill('0')
    assert.ok(brightness(await modelPixel()) < 30, 'with no light at all the model is nearly black')
  })

  it('shows every type of light, and flat colours without the direct light’s controls', async () => {
    await toggle().click()
    const looks = new Map<string, number[]>()
    for (const type of ['studio', 'environment', 'directional', 'flat']) {
      await mode().selectOption(type)
      looks.set(type, await modelPixel())
      const direct = type === 'studio' || type === 'directional'
      assert.equal(await slider('Light direction').isDisabled(), !direct, type)
      assert.equal(await slider('Light height').isDisabled(), !direct, type)
    }
    assert.equal(new Set([...looks.values()].map((pixel) => pixel.join())).size, 4, 'each type looks different')
    assert.ok(brightness(looks.get('flat')!) > 60, JSON.stringify([...looks]))
  })

  it('gives a metal its look back when the flat type is left', async () => {
    const studio = await modelPixel()
    await toggle().click()
    await mode().selectOption('flat')
    assert.notDeepEqual(await modelPixel(), studio)
    await mode().selectOption('studio')
    assert.deepEqual(await modelPixel(), studio)
  })

  it('moves the direct light with its direction and height', async () => {
    await toggle().click()
    await mode().selectOption('directional')
    const front = await modelPixel()
    await slider('Light direction').fill('180')
    const behind = await modelPixel()
    assert.notDeepEqual(behind, front)
  })

  it('resets to the defaults, and keeps what was chosen for the next time', async () => {
    await toggle().click()
    await mode().selectOption('flat')
    await slider('Intensity').fill('1.5')
    await slider('Exposure').fill('0.5')
    await frame.page.reload()
    await frame.open({ bytes: glb(triangleGltf()) })
    await toggle().click()
    assert.equal(await mode().inputValue(), 'flat')
    assert.equal(await slider('Intensity').inputValue(), '1.5')
    assert.equal(await slider('Exposure').inputValue(), '0.5')
    await panel().getByRole('button', { name: 'Reset' }).click()
    assert.equal(await mode().inputValue(), 'studio')
    assert.equal(await slider('Intensity').inputValue(), '1')
    assert.equal(await slider('Exposure').inputValue(), '1')
  })

  it('ignores stored lighting that is not valid', async () => {
    await frame.page.evaluate(() => localStorage.setItem('viewer-preferences', '{"lighting":{"mode":"disco","intensity":"high","exposure":99,"__proto__":{"mode":"flat"}}}'))
    await frame.page.reload()
    await frame.open({ bytes: glb(triangleGltf()) })
    await toggle().click()
    assert.equal(await mode().inputValue(), 'studio')
    assert.equal(await slider('Intensity').inputValue(), '1')
    assert.equal(await slider('Exposure').inputValue(), '3')
  })
})
