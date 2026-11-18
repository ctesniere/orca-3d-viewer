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

const MODE = 'Annotate: click the model to describe a change for the agent'
const TITLE = 'Describe what the agent should change here'
const modeButton = () => frame.page.getByRole('button', { name: MODE })
const popover = () => frame.page.locator('.popover')
const panel = () => frame.page.locator('.notes-panel')
const button = (name: string | RegExp) => frame.page.getByRole('button', { name })

/** Clicks around the middle of the view until the popover opens; the model is a thin triangle. */
async function clickModel(): Promise<boolean> {
  const box = await frame.page.locator('.viewport canvas').boundingBox()
  assert.ok(box)
  for (const dy of [0, 10, -10, 20, -20, 30, -30, 45, -45]) {
    for (const dx of [0, -10, 10, -20, 20, -30, 30, -45, 45]) {
      await frame.page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy)
      if (await popover().isVisible()) return true
    }
  }
  return false
}

async function addNote(comment: string, options: { question?: boolean; radius?: string } = {}): Promise<void> {
  assert.equal(await clickModel(), true)
  await popover().locator('textarea').fill(comment)
  if (options.question) await button(/^Question/).click()
  if (options.radius !== undefined) await popover().locator('input').fill(options.radius)
  await button(/^Add/).click()
}

describe('annotating the model', () => {
  it('does nothing until the toolbar button turns annotating on, and again once it is off', async () => {
    assert.equal(await modeButton().getAttribute('aria-pressed'), 'false')
    assert.equal(await clickModel(), false)
    await modeButton().click()
    assert.equal(await modeButton().getAttribute('aria-pressed'), 'true')
    assert.equal(await clickModel(), true)
    await modeButton().click()
    assert.equal(await popover().isVisible(), false)
    assert.equal(await clickModel(), false)
  })

  it('asks for a comment, a kind and a radius, and lists the note only once it is added', async () => {
    await modeButton().click()
    assert.equal(await panel().isVisible(), false)
    assert.equal(await clickModel(), true)
    assert.equal(await popover().locator('textarea').getAttribute('placeholder'), TITLE)
    assert.equal(await button(/^Add/).isDisabled(), true)
    assert.equal(await popover().locator('input').inputValue(), '0')
    assert.match((await popover().locator('.radius-unit').textContent()) ?? '', /^(mm|m|µm|km)$/)
    assert.equal(await button(/^Change/).getAttribute('aria-pressed'), 'true')

    await popover().locator('textarea').fill('Make this corner round')
    await button(/^Question/).click()
    assert.equal(await button(/^Question/).getAttribute('aria-pressed'), 'true')
    await popover().locator('input').fill('0.2')
    await button(/^Add/).click()

    assert.equal(await popover().isVisible(), false)
    assert.equal(await panel().isVisible(), true)
    assert.equal(await panel().locator('.notes-toggle').innerText(), '1 annotation')
    const note = panel().locator('.note')
    assert.equal(await note.locator('.note-badge').innerText(), '1')
    assert.equal(await note.locator('.note-comment').innerText(), 'Make this corner round')
    assert.equal(await note.locator('.note-kind').innerText(), 'question')
  })

  it('keeps every note, and removes one or all of them', async () => {
    await modeButton().click()
    await addNote('First')
    await addNote('Second')
    assert.equal(await panel().locator('.notes-toggle').innerText(), '2 annotations')
    assert.deepEqual(await panel().locator('.note-comment').allInnerTexts(), ['First', 'Second'])
    await button('Remove annotation 1').click()
    assert.deepEqual(await panel().locator('.note-comment').allInnerTexts(), ['Second'])
    await button('Delete all annotations').click()
    assert.equal(await panel().isVisible(), false)
  })

  it('keeps the notes when annotating is turned off, and collapses the list', async () => {
    await modeButton().click()
    await addNote('Stays')
    await modeButton().click()
    assert.equal(await panel().isVisible(), true)
    await button('Show or hide the annotations').click()
    assert.equal(await panel().locator('.notes-list').isVisible(), false)
    await button('Show or hide the annotations').click()
    assert.equal(await panel().locator('.notes-list').isVisible(), true)
  })

  it('copies all the notes with their spots', async () => {
    await modeButton().click()
    await addNote('First')
    await addNote('Second', { question: true, radius: '0.5' })
    await button(/^Copy/).click()
    const copied = await panel().locator('.copy-buffer').inputValue()
    assert.match(copied, /^A user reviewing/)
    assert.match(copied, /left 2 notes\./)
    assert.match(copied, /^Note 1 \(change\): First$/m)
    assert.match(copied, /^Note 2 \(question\): Second$/m)
    assert.match(copied, /- Spot in the viewer's scene \(metres, Y up\): .*, radius /)
  })

  it('starts the copied and the sent text with the file the person names', async () => {
    await frame.page.evaluate(() => {
      window.__orcaTest.workerAnswers['notes.targets'] = { running: [], launchable: ['claude'] }
      window.__orcaTest.workerAnswers['notes.send'] = { sent: true }
    })
    await modeButton().click()
    await addNote('Fix it')
    await panel().getByRole('textbox', { name: 'File' }).fill('assets/robot.glb')
    await button(/^Copy/).click()
    assert.match(await panel().locator('.copy-buffer').inputValue(), /^File: assets\/robot\.glb\n\nA user reviewing/)
    await button('Send').click()
    await frame.page.getByRole('menuitem', { name: 'Claude' }).click()
    const sent = (await frame.page.evaluate(() => window.__orcaTest.workerCalls)).find((call) => call.name === 'notes.send')
    assert.match((sent?.input as { text: string }).text, /^File: assets\/robot\.glb\n/)
  })

  it('sends the notes to a running agent, or to a new one, through the worker', async () => {
    await frame.page.evaluate(() => {
      window.__orcaTest.workerAnswers['notes.targets'] = {
        running: [{ terminalId: 't-1', title: 'Claude Code', agent: 'claude', state: 'working' }],
        launchable: ['claude', 'codex']
      }
      window.__orcaTest.workerAnswers['notes.send'] = { sent: true }
    })
    await modeButton().click()
    await addNote('Fix the corner')
    await button('Send').click()
    const menu = frame.page.getByRole('menu')
    assert.match(await menu.innerText(), /Send notes to[\s\S]*Running agents[\s\S]*Claude Code[\s\S]*New agent[\s\S]*Claude[\s\S]*Codex/)

    await menu.getByRole('menuitem', { name: /Claude Code/ }).click()
    assert.equal(await panel().locator('.notes-status').innerText(), 'Sent to Claude Code.')
    await button('Send').click()
    await menu.getByRole('menuitem', { name: 'Codex' }).click()
    assert.equal(await panel().locator('.notes-status').innerText(), 'Sent to Codex.')

    const calls = await frame.page.evaluate(() => window.__orcaTest.workerCalls)
    const sends = calls.filter((call) => call.name === 'notes.send').map((call) => call.input as { target: unknown; text: string })
    assert.deepEqual(
      sends.map((send) => send.target),
      [{ kind: 'terminal', terminalId: 't-1' }, { kind: 'new', agent: 'codex' }]
    )
    assert.match(sends[0]!.text, /Note 1 \(change\): Fix the corner/)
  })

  it('says why a note could not be sent, and what to do when no agent runs', async () => {
    await frame.page.evaluate(() => {
      window.__orcaTest.workerAnswers['notes.targets'] = { running: [], launchable: ['claude'] }
      window.__orcaTest.workerAnswers['notes.send'] = { error: 'The agent did not accept the note' }
    })
    await modeButton().click()
    await addNote('Anything')
    await button('Send').click()
    assert.match(await frame.page.getByRole('menu').innerText(), /No agent is running in this workspace\./)
    await frame.page.getByRole('menuitem', { name: 'Claude' }).click()
    assert.equal(await panel().locator('.notes-status').innerText(), 'Could not send: The agent did not accept the note')
  })

  it('does not open for a drag, a click beside the model, or a right click', async () => {
    await modeButton().click()
    const box = await frame.page.locator('.viewport canvas').boundingBox()
    assert.ok(box)
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
    await frame.page.mouse.move(x, y)
    await frame.page.mouse.down()
    await frame.page.mouse.move(x + 60, y + 20, { steps: 5 })
    await frame.page.mouse.up()
    await frame.page.mouse.click(box.x + 4, box.y + 4)
    await frame.page.mouse.click(x, y, { button: 'right' })
    assert.equal(await popover().isVisible(), false)
  })

  it('cancels on Escape or Cancel, adds nothing, and gives the focus back to the view', async () => {
    await modeButton().click()
    assert.equal(await clickModel(), true)
    await popover().locator('textarea').fill('Never mind')
    await frame.page.keyboard.press('Escape')
    assert.equal(await popover().isVisible(), false)
    assert.equal(await frame.page.evaluate(() => document.activeElement?.tagName), 'CANVAS')
    assert.equal(await clickModel(), true)
    await button('Cancel').click()
    assert.equal(await popover().isVisible(), false)
    assert.equal(await panel().isVisible(), false)
  })

  it('adds with Ctrl+Enter', async () => {
    await modeButton().click()
    assert.equal(await clickModel(), true)
    await popover().locator('textarea').fill('Quick')
    await frame.page.keyboard.press('Control+Enter')
    assert.equal(await panel().locator('.note-comment').innerText(), 'Quick')
  })
})
