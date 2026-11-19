import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { canSend, listTargets, sendNotes, type SendTarget } from '../src/notes-send.ts'

type Call = { name: string; input: unknown; timeoutMs: number | undefined }
type Request = (name: string, input?: unknown, options?: { timeoutMs?: number }) => Promise<unknown>

function setOrca(value: unknown): void {
  Object.defineProperty(globalThis, 'orca', { configurable: true, value })
}

function setPlugin(request: Request): void {
  setOrca({ plugin: { request } })
}

afterEach(() => setOrca(undefined))

describe('canSend', () => {
  it('is false with no orca, no plugin, or a plugin whose request is not a function, and true otherwise', () => {
    setOrca(undefined)
    assert.equal(canSend(), false)
    setOrca({})
    assert.equal(canSend(), false)
    setOrca({ plugin: {} })
    assert.equal(canSend(), false)
    setOrca({ plugin: { request: 'nope' } })
    assert.equal(canSend(), false)
    setPlugin(async () => undefined)
    assert.equal(canSend(), true)
  })
})

describe('listTargets', () => {
  it('rejects when Orca cannot be reached', async () => {
    setOrca(undefined)
    await assert.rejects(() => listTargets(), /cannot reach/)
  })

  it('asks notes.targets, with a timeout, for exactly what it was given', async () => {
    const calls: Call[] = []
    setPlugin(async (name, input, options) => {
      calls.push({ name, input, timeoutMs: options?.timeoutMs })
      return { running: [], launchable: [] }
    })
    await listTargets()
    assert.deepEqual(calls, [{ name: 'notes.targets', input: undefined, timeoutMs: 20_000 }])
  })

  it('falls back to empty lists when the answer is not the shape it expects', async () => {
    for (const answer of [undefined, null, 5, 'x', [], { running: 5, launchable: 'x' }]) {
      setPlugin(async () => answer)
      assert.deepEqual(await listTargets(), { running: [], launchable: [] })
    }
  })

  it('keeps only running rows with a string terminalId, filling in defaults for the rest', async () => {
    setPlugin(async () => ({
      running: [
        { terminalId: 't1', title: 'Fix the wheel', agent: 'claude', state: 'running' },
        { terminalId: 't2' },
        { terminalId: 't3', title: 5, agent: 5, state: 5 },
        { terminalId: 5 },
        null,
        'x',
        { title: 'no id' }
      ],
      launchable: []
    }))
    assert.deepEqual((await listTargets()).running, [
      { terminalId: 't1', title: 'Fix the wheel', agent: 'claude', state: 'running' },
      { terminalId: 't2', title: null, agent: null, state: 'waiting' },
      { terminalId: 't3', title: null, agent: null, state: 'waiting' }
    ])
  })

  it('keeps only the launchable agents that are strings', async () => {
    setPlugin(async () => ({ running: [], launchable: ['claude', 5, null, 'codex'] }))
    assert.deepEqual((await listTargets()).launchable, ['claude', 'codex'])
  })
})

describe('sendNotes', () => {
  it('sends the target and the text to notes.send, with a timeout', async () => {
    const calls: Call[] = []
    setPlugin(async (name, input, options) => {
      calls.push({ name, input, timeoutMs: options?.timeoutMs })
    })
    const target: SendTarget = { kind: 'terminal', terminalId: 't1' }
    await sendNotes(target, 'hello')
    assert.deepEqual(calls, [{ name: 'notes.send', input: { target, text: 'hello' }, timeoutMs: 20_000 }])
  })

  it('rejects when Orca cannot be reached, without sending anything', async () => {
    setOrca(undefined)
    await assert.rejects(() => sendNotes({ kind: 'new', agent: 'claude' }, 'hello'), /cannot reach/)
  })
})
