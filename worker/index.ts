// The plugin's worker: the only part that can reach an agent. The 3D view runs in a sandboxed frame that
// cannot call Orca's terminal or agent methods, so it asks this worker, which does three things and no more:
// list the agents running in the focused workspace, type a note into one of them, or start a new one with it.
// It imports nothing and touches no file or network. Orca runs it as TypeScript with no build step.

type HostCall = (method: string, params?: Record<string, unknown>) => Promise<any>
type Handler = (input: unknown) => unknown
export type WorkerApi = {
  host: { call: HostCall }
  panels: { handle: (name: string, handler: Handler) => unknown }
}

/** The agents a note may start, as Orca names them. Anything else is refused, whatever the frame asks. */
export const LAUNCHABLE_AGENTS = ['claude', 'codex', 'opencode', 'antigravity', 'gemini', 'copilot', 'cursor', 'grok']
export const MAX_NOTE_CHARACTERS = 30_000
const MAX_RUNNING_AGENTS = 20
const MAX_TITLE_CHARACTERS = 80

// Controls (Cc), invisible formatting such as bidirectional overrides (Cf), and line or paragraph separators.
const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu

function refuse(message: string, code = 'invalid_params'): never {
  throw Object.assign(new Error(message), { code })
}

/**
 * The note as one line of plain text. A terminal agent reads a line break as Enter, which would send the
 * note in pieces, and the frame's text is not trusted to hold no control characters.
 */
export function oneLine(text: unknown): string {
  if (typeof text !== 'string') return refuse('The note must be text')
  const line = text.replace(CONTROL_CHARACTERS, ' ').replace(/ {2,}/g, ' ').trim()
  if (line === '') return refuse('The note is empty')
  return [...line].slice(0, MAX_NOTE_CHARACTERS).join('')
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

type RunningAgent = { terminalId: string; title: string | null; agent: string | null; state: string }

async function runningAgents(orca: WorkerApi): Promise<RunningAgent[]> {
  const answer = await orca.host.call('agents.list', {})
  const rows: unknown[] = Array.isArray(answer?.agents) ? answer.agents : []
  const agents: RunningAgent[] = []
  for (const row of rows) {
    if (!isRecord(row) || typeof row.terminalId !== 'string' || row.terminalId === '') continue
    agents.push({
      terminalId: row.terminalId,
      title: typeof row.title === 'string' ? [...row.title.replace(CONTROL_CHARACTERS, ' ').trim()].slice(0, MAX_TITLE_CHARACTERS).join('') || null : null,
      agent: typeof row.agent === 'string' ? row.agent : null,
      state: typeof row.state === 'string' ? row.state : 'waiting'
    })
  }
  return agents.slice(0, MAX_RUNNING_AGENTS)
}

export function createHandlers(orca: WorkerApi): Record<string, Handler> {
  return {
    'notes.targets': async () => ({ running: await runningAgents(orca), launchable: LAUNCHABLE_AGENTS }),

    'notes.send': async (input) => {
      if (!isRecord(input) || !isRecord(input.target)) return refuse('Name where to send the note')
      const text = oneLine(input.text)
      const { target } = input

      if (target.kind === 'terminal') {
        // Why checked against the list: a terminal id alone could name a shell, and typing into a shell runs commands.
        const agent = (await runningAgents(orca)).find((entry) => entry.terminalId === target.terminalId)
        if (!agent) return refuse('That terminal is not a running agent')
        const sent = await orca.host.call('terminal.sendText', { terminalId: agent.terminalId, text, enter: true })
        if (!sent?.accepted) return refuse('The agent did not accept the note', 'action_failed')
        return { sent: true }
      }

      if (target.kind === 'new') {
        if (typeof target.agent !== 'string' || !LAUNCHABLE_AGENTS.includes(target.agent)) return refuse('That agent is not offered')
        const context = await orca.host.call('workspace.readContext', {})
        if (!isRecord(context) || typeof context.workspaceId !== 'string') return refuse('No workspace is focused', 'action_failed')
        await orca.host.call('agent.launch', { workspaceId: context.workspaceId, agent: target.agent, prompt: text })
        return { sent: true }
      }

      return refuse('Name where to send the note')
    }
  }
}

export default function activate(orca: WorkerApi): void {
  for (const [name, handler] of Object.entries(createHandlers(orca))) orca.panels.handle(name, handler)
}
