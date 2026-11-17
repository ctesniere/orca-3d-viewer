// How the frame reaches the plugin's worker, which alone can list agents and type a note into one. The frame
// only asks; the worker checks every request again. Answers are read defensively, as the worker is another program.
import { editorFrame } from './orca-editor-host.ts'

export type RunningAgent = { terminalId: string; title: string | null; agent: string | null; state: string }
export type SendTargets = { running: RunningAgent[]; launchable: string[] }
export type SendTarget = { kind: 'terminal'; terminalId: string } | { kind: 'new'; agent: string }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Whether this Orca can reach the worker at all; an older one, or a browser client, cannot. */
export function canSend(): boolean {
  return typeof editorFrame()?.plugin?.request === 'function'
}

async function request(name: string, input?: unknown): Promise<unknown> {
  const plugin = editorFrame()?.plugin
  if (!plugin) throw new Error('Orca cannot reach the plugin’s worker here')
  return plugin.request(name, input, { timeoutMs: 20_000 })
}

export async function listTargets(): Promise<SendTargets> {
  const answer = await request('notes.targets')
  if (!isRecord(answer)) return { running: [], launchable: [] }
  const running = (Array.isArray(answer.running) ? answer.running : []).flatMap((row): RunningAgent[] =>
    isRecord(row) && typeof row.terminalId === 'string'
      ? [
          {
            terminalId: row.terminalId,
            title: typeof row.title === 'string' ? row.title : null,
            agent: typeof row.agent === 'string' ? row.agent : null,
            state: typeof row.state === 'string' ? row.state : 'waiting'
          }
        ]
      : []
  )
  const launchable = (Array.isArray(answer.launchable) ? answer.launchable : []).filter((agent): agent is string => typeof agent === 'string')
  return { running, launchable }
}

export async function sendNotes(target: SendTarget, text: string): Promise<void> {
  await request('notes.send', { target, text })
}
