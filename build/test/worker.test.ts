import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import activate, { createHandlers, LAUNCHABLE_AGENTS, MAX_NOTE_CHARACTERS, oneLine, type WorkerApi } from '../../worker/index.ts'

type Call = [string, Record<string, unknown> | undefined]

function fakeOrca(answers: Record<string, unknown>): { orca: WorkerApi; calls: Call[]; handlers: Map<string, (input: unknown) => unknown> } {
  const calls: Call[] = []
  const handlers = new Map<string, (input: unknown) => unknown>()
  const orca: WorkerApi = {
    host: {
      call: async (method, params) => {
        calls.push([method, params])
        if (!(method in answers)) throw new Error(`unexpected host call ${method}`)
        return answers[method]
      }
    },
    panels: { handle: (name, handler) => handlers.set(name, handler) }
  }
  return { orca, calls, handlers }
}

const AGENTS = {
  agents: [
    { terminalId: 't-claude', title: 'Claude‮\nCode', agent: 'claude', state: 'working' },
    { terminalId: null, title: 'no terminal', agent: 'codex', state: 'done' },
    { terminalId: 't-codex', title: null, agent: 'codex', state: 'waiting' }
  ]
}

describe('worker', () => {
  it('registers the two handlers the frame calls', () => {
    const { orca, handlers } = fakeOrca({})
    activate(orca)
    assert.deepEqual([...handlers.keys()].sort(), ['notes.send', 'notes.targets'])
  })

  it('lists only agents that have a terminal, with clean titles, and what a note may start', async () => {
    const { orca } = fakeOrca({ 'agents.list': AGENTS })
    const answer = (await createHandlers(orca)['notes.targets']!(undefined)) as { running: unknown[]; launchable: string[] }
    assert.deepEqual(answer.running, [
      { terminalId: 't-claude', title: 'Claude Code', agent: 'claude', state: 'working' },
      { terminalId: 't-codex', title: null, agent: 'codex', state: 'waiting' }
    ])
    assert.deepEqual(answer.launchable, LAUNCHABLE_AGENTS)
  })

  it('types a note into a running agent, on one line, and presses Enter', async () => {
    const { orca, calls } = fakeOrca({ 'agents.list': AGENTS, 'terminal.sendText': { accepted: true } })
    await createHandlers(orca)['notes.send']!({ target: { kind: 'terminal', terminalId: 't-codex' }, text: 'one\ntwo\r\n‮three\u0007' })
    assert.deepEqual(calls.at(-1), ['terminal.sendText', { terminalId: 't-codex', text: 'one two three', enter: true }])
  })

  it('refuses a terminal that is not a listed agent, so a shell can never be typed into', async () => {
    const { orca, calls } = fakeOrca({ 'agents.list': AGENTS, 'terminal.sendText': { accepted: true } })
    await assert.rejects(
      async () => createHandlers(orca)['notes.send']!({ target: { kind: 'terminal', terminalId: 'a-shell' }, text: 'rm -rf ~' }),
      { code: 'invalid_params' }
    )
    assert.ok(!calls.some(([method]) => method === 'terminal.sendText'))
  })

  it('starts a new agent in the focused workspace with the note as its prompt', async () => {
    const { orca, calls } = fakeOrca({
      'workspace.readContext': { workspaceId: 'wt-1', branch: 'b', displayName: 'n', terminals: [] },
      'agent.launch': { terminalId: 't' }
    })
    await createHandlers(orca)['notes.send']!({ target: { kind: 'new', agent: 'claude' }, text: 'Make it blue' })
    assert.deepEqual(calls.at(-1), ['agent.launch', { workspaceId: 'wt-1', agent: 'claude', prompt: 'Make it blue' }])
  })

  it('refuses an agent that is not offered, and a launch with no focused workspace', async () => {
    const none = fakeOrca({ 'workspace.readContext': null, 'agent.launch': {} })
    await assert.rejects(async () => createHandlers(none.orca)['notes.send']!({ target: { kind: 'new', agent: 'claude' }, text: 'x' }), { code: 'action_failed' })
    await assert.rejects(async () => createHandlers(none.orca)['notes.send']!({ target: { kind: 'new', agent: 'bash' }, text: 'x' }), { code: 'invalid_params' })
    assert.ok(!none.calls.some(([method]) => method === 'agent.launch'))
  })

  it('refuses malformed requests without calling the host', async () => {
    const { orca, calls } = fakeOrca({})
    const send = createHandlers(orca)['notes.send']!
    const bad = [
      undefined,
      null,
      [],
      {},
      { target: null, text: 'x' },
      { target: { kind: 'other' }, text: 'x' },
      { target: { kind: 'new', agent: 'claude' }, text: 5 },
      { target: { kind: 'new', agent: 'claude' }, text: ' \n ' }
    ]
    for (const input of bad) await assert.rejects(async () => send(input), { code: 'invalid_params' })
    assert.equal(calls.length, 0)
  })

  it('cuts a note past its limit and drops control characters', () => {
    assert.equal([...oneLine('a'.repeat(MAX_NOTE_CHARACTERS * 2))].length, MAX_NOTE_CHARACTERS)
    assert.equal(oneLine('a\u0000b​c\n\n d'), 'a b c d')
  })
})

describe('worker source', () => {
  const source = readFileSync(path.join(import.meta.dirname, '../../worker/index.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

  it('imports nothing and reaches no file, process or network', () => {
    assert.doesNotMatch(
      source,
      /^\s*import\s|\brequire\s*\(|\bimport\s*\(|node:|process\.|child_process|\bfetch\s*\(|WebSocket|XMLHttpRequest|\beval\s*\(|new\s+Function/m
    )
  })

  it('calls only the four host methods the manifest asks for', () => {
    const methods = [...source.matchAll(/host\.call\(\s*'([^']+)'/g)].map((match) => match[1])
    assert.deepEqual([...new Set(methods)].sort(), ['agent.launch', 'agents.list', 'terminal.sendText', 'workspace.readContext'])
  })
})
