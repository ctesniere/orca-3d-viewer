// The controls for annotating the model: a popover that asks what to change at a clicked spot, and a list at
// the bottom right of the notes so far, which can be copied or sent to an agent.
import { ChevronDown, ChevronRight, CircleHelp, Copy, MessageSquarePlus, Pencil, Send, Trash2, X } from 'lucide'
import { annotationSummary, MAX_COMMENT_CHARACTERS, MAX_FILE_PATH_CHARACTERS, type ModelPick, type Note, type NoteKind, notesMessage } from './annotation.ts'
import { cleanText, formatCount } from './display-format.ts'
import { element, icon } from './dom.ts'
import type { Translate } from './messages.ts'
import type { SpotMarker } from './model-scene.ts'
import { canSend, listTargets, type SendTarget, sendNotes, type SendTargets } from './notes-send.ts'

export type AnnotationHost = {
  /** Draws the notes, and the spot being written, on the model. */
  showMarkers: (notes: SpotMarker[], pending: SpotMarker | null) => void
}

/** The loaded model's size and the unit its lengths are shown in, which the radius field is written in. */
export type ModelSize = { diagonal: number; unit: string; scale: number }

export type AnnotationUi = {
  popover: HTMLElement
  panel: HTMLElement
  /** Asks about the spot `pick`, near `at` (CSS pixels from the view's corner). */
  open: (pick: ModelPick, at: { x: number; y: number }) => void
  /** Closes the popover and the menu, without losing the notes. */
  close: (returnFocus: boolean) => void
  setModelSize: (size: ModelSize) => void
  /** Draws the markers again, as when the model's stage was replaced. */
  redraw: () => void
  /** Hides the list while the view shows no model. */
  setVisible: (visible: boolean) => void
}

// Why 0: a note marks one point until the person widens it, and a radius nobody asked for would only be noise.
const DEFAULT_RADIUS = 0
const MAX_REASON_CHARACTERS = 160
// Names Orca gives its agents, as people know them.
const AGENT_NAMES: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
  antigravity: 'Antigravity',
  gemini: 'Gemini',
  copilot: 'GitHub Copilot',
  cursor: 'Cursor',
  grok: 'Grok'
}
const agentName = (agent: string | null): string => (agent === null ? '' : (AGENT_NAMES[agent] ?? cleanText(agent, 40)))

export function createAnnotationUi(t: Translate, locale: string, host: AnnotationHost, focusView: () => void): AnnotationUi {
  let notes: Note[] = []
  let pending: ModelPick | null = null
  let kind: NoteKind = 'change'
  let size: ModelSize = { diagonal: 1, unit: 'm', scale: 1 }
  let visible = true
  let expanded = true
  // Orca never tells the viewer where the file is, so the person names it; it is kept for this tab only.
  let filePath = ''

  // --- The popover that asks for a note ---
  const target = element('strong', { className: 'popover-target' })
  const text = element('textarea', { className: 'popover-text', placeholder: t('annotateTitle'), ariaLabel: t('annotateTitle'), maxLength: MAX_COMMENT_CHARACTERS, rows: 4 })
  const changeButton = element('button', { type: 'button', className: 'segment' }, [icon(Pencil), t('noteChange')])
  const questionButton = element('button', { type: 'button', className: 'segment' }, [icon(CircleHelp), t('noteQuestion')])
  const radiusInput = element('input', { type: 'number', className: 'radius-input', min: '0', step: 'any', ariaLabel: t('noteRadius') })
  const radiusUnit = element('span', { className: 'radius-unit' })
  const cancelButton = element('button', { type: 'button', className: 'text-button', textContent: t('noteCancel') })
  const shortcut = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘↵' : 'Ctrl+↵'
  const addButton = element('button', { type: 'button', className: 'text-button primary', disabled: true }, [
    icon(MessageSquarePlus),
    t('noteAdd'),
    element('kbd', { textContent: shortcut })
  ])
  const popover = element('div', { className: 'popover', role: 'dialog', ariaLabel: t('annotateTitle'), hidden: true }, [
    target,
    text,
    element('div', { className: 'segments', role: 'group', ariaLabel: t('annotateTitle') }, [changeButton, questionButton]),
    element('label', { className: 'radius-row' }, [element('span', { textContent: t('noteRadius') }), radiusInput, radiusUnit]),
    element('div', { className: 'popover-actions' }, [cancelButton, addButton])
  ])

  const showRadius = (meters: number): void => {
    radiusInput.value = String(Number((meters / size.scale).toPrecision(2)))
  }
  /** The radius written in the field, in metres; the default when the field holds no number. */
  const radius = (): number => {
    const written = radiusInput.valueAsNumber * size.scale
    return Number.isFinite(written) && written >= 0 ? Math.min(written, size.diagonal) : DEFAULT_RADIUS
  }
  const setKind = (next: NoteKind): void => {
    kind = next
    changeButton.setAttribute('aria-pressed', String(next === 'change'))
    questionButton.setAttribute('aria-pressed', String(next === 'question'))
  }

  const redraw = (): void => {
    host.showMarkers(
      notes.map((note) => ({ point: note.pick.point, radius: note.radius })),
      pending && !popover.hidden ? { point: pending.point, radius: radius() } : null
    )
  }

  // --- The list of notes, with Copy and Send ---
  const toggle = element('button', { type: 'button', className: 'notes-toggle', ariaLabel: t('notesToggle') })
  const sendButton = element('button', { type: 'button', className: 'text-button with-icon', ariaHasPopup: 'menu', ariaExpanded: 'false' }, [
    icon(Send),
    t('notesSend')
  ])
  const copyButton = element('button', { type: 'button', className: 'text-button with-icon' }, [icon(Copy), t('notesCopy')])
  const clearButton = element('button', { type: 'button', className: 'tool', title: t('notesClear'), ariaLabel: t('notesClear') }, [icon(Trash2)])
  const fileInput = element('input', {
    type: 'text',
    className: 'notes-file-input',
    placeholder: t('notesFilePlaceholder'),
    ariaLabel: t('notesFile'),
    maxLength: MAX_FILE_PATH_CHARACTERS,
    spellcheck: false
  })
  const fileRow = element('label', { className: 'notes-file' }, [element('span', { textContent: t('notesFile') }), fileInput])
  const status = element('p', { className: 'notes-status', role: 'status', hidden: true })
  const list = element('ol', { className: 'notes-list' })
  // Why off screen rather than hidden: a copy needs a selection, and a hidden element cannot have one.
  const copyBuffer = element('textarea', { className: 'copy-buffer off-screen', readOnly: true, spellcheck: false, tabIndex: -1, ariaHidden: 'true' })
  const menu = element('div', { className: 'send-menu', role: 'menu', ariaLabel: t('sendTo'), hidden: true })
  const panel = element('div', { className: 'notes-panel', hidden: true }, [
    menu,
    element('div', { className: 'notes-head' }, [toggle, sendButton, copyButton, clearButton]),
    fileRow,
    status,
    list,
    copyBuffer
  ])

  const say = (message: string | null): void => {
    status.hidden = message === null
    status.textContent = message ?? ''
  }
  const noteTitle = (note: Note): string => annotationSummary(note.pick) || t('noteUnnamed')

  const renderNotes = (): void => {
    panel.hidden = !visible || notes.length === 0
    if (notes.length === 0) say(null)
    toggle.replaceChildren(icon(expanded ? ChevronDown : ChevronRight, 16), t('notesCount', { count: formatCount(notes.length, locale) }, notes.length))
    toggle.setAttribute('aria-expanded', String(expanded))
    list.hidden = !expanded
    fileRow.hidden = !expanded
    list.replaceChildren(
      ...notes.map((note, index) => {
        const remove = element('button', { type: 'button', className: 'tool note-remove', title: t('noteRemove', { index: index + 1 }), ariaLabel: t('noteRemove', { index: index + 1 }) }, [icon(X)])
        remove.addEventListener('click', () => {
          notes = notes.filter((entry) => entry !== note)
          renderNotes()
          redraw()
        })
        return element('li', { className: 'note' }, [
          element('span', { className: 'note-badge', textContent: String(index + 1) }),
          element('div', { className: 'note-body' }, [
            element('strong', { textContent: noteTitle(note) }),
            element('p', { className: 'note-comment', textContent: note.comment }),
            element('span', { className: 'note-kind', textContent: t(note.kind === 'change' ? 'noteChange' : 'noteQuestion').toLowerCase() })
          ]),
          remove
        ])
      })
    )
  }

  // --- Sending ---
  let menuToken = 0
  const closeMenu = (): void => {
    menuToken++
    menu.hidden = true
    sendButton.setAttribute('aria-expanded', 'false')
    document.removeEventListener('pointerdown', onOutsidePress, true)
  }
  function onOutsidePress(event: Event): void {
    if (!(event.target instanceof Node) || (!menu.contains(event.target) && !sendButton.contains(event.target))) closeMenu()
  }
  const menuItem = (label: string, detail: string | null, choose: () => void): HTMLButtonElement => {
    const item = element('button', { type: 'button', className: 'menu-item', role: 'menuitem' }, [
      element('span', { textContent: label }),
      ...(detail ? [element('span', { className: 'menu-detail', textContent: detail })] : [])
    ])
    item.addEventListener('click', choose)
    return item
  }
  const heading = (label: string): HTMLElement => element('p', { className: 'menu-heading', textContent: label })

  const deliver = async (to: SendTarget, label: string): Promise<void> => {
    closeMenu()
    say(null)
    try {
      await sendNotes(to, notesMessage(notes, filePath))
      say(t('sendDone', { agent: label }))
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      say(t('sendFailed', { reason: cleanText(reason, MAX_REASON_CHARACTERS) }))
    }
  }
  const fillMenu = (targets: SendTargets): void => {
    menu.replaceChildren(
      heading(t('sendTo')),
      heading(t('sendRunning')),
      ...(targets.running.length === 0
        ? [element('p', { className: 'menu-empty', textContent: t('sendNoneRunning') })]
        : targets.running.map((agent) => {
            const label = cleanText(agent.title ?? '', 60) || agentName(agent.agent) || t('noteUnnamed')
            return menuItem(label, agent.state, () => void deliver({ kind: 'terminal', terminalId: agent.terminalId }, label))
          })),
      heading(t('sendNew')),
      ...targets.launchable.map((agent) => menuItem(agentName(agent), null, () => void deliver({ kind: 'new', agent }, agentName(agent))))
    )
  }
  const openMenu = async (): Promise<void> => {
    if (!menu.hidden) return closeMenu()
    const token = ++menuToken
    menu.hidden = false
    sendButton.setAttribute('aria-expanded', 'true')
    menu.replaceChildren(heading(t('sendTo')), element('p', { className: 'menu-empty', textContent: t('sendLooking') }))
    document.addEventListener('pointerdown', onOutsidePress, true)
    try {
      const targets = await listTargets()
      if (token === menuToken) fillMenu(targets)
    } catch (error) {
      if (token !== menuToken) return
      closeMenu()
      say(t('sendFailed', { reason: cleanText(error instanceof Error ? error.message : String(error), MAX_REASON_CHARACTERS) }))
    }
  }

  const copy = (): void => {
    copyBuffer.value = notesMessage(notes, filePath)
    copyBuffer.select()
    // Why execCommand: Orca's frames refuse navigator.clipboard, and allow a copy inside a click.
    let copied = false
    try {
      copied = document.execCommand('copy')
    } catch {
      copied = false
    }
    // Why shown on failure: the person can still select the text and copy it by hand.
    copyBuffer.classList.toggle('off-screen', copied)
    say(copied ? t('copied') : t('copyByHand'))
  }

  // --- Wiring ---
  const close = (returnFocus: boolean): void => {
    const wasOpen = !popover.hidden
    popover.hidden = true
    pending = null
    closeMenu()
    if (wasOpen) redraw()
    if (returnFocus) focusView()
  }
  const add = (): void => {
    const comment = text.value.trim()
    if (!pending || comment === '') return
    notes = [...notes, { kind, comment, radius: radius(), pick: pending }]
    close(true)
    renderNotes()
  }

  changeButton.addEventListener('click', () => setKind('change'))
  questionButton.addEventListener('click', () => setKind('question'))
  text.addEventListener('input', () => {
    addButton.disabled = text.value.trim() === ''
  })
  radiusInput.addEventListener('input', redraw)
  cancelButton.addEventListener('click', () => close(true))
  addButton.addEventListener('click', add)
  popover.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close(true)
    else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) add()
  })
  toggle.addEventListener('click', () => {
    expanded = !expanded
    renderNotes()
  })
  fileInput.addEventListener('input', () => {
    filePath = fileInput.value
  })
  sendButton.addEventListener('click', () => void openMenu())
  copyButton.addEventListener('click', copy)
  clearButton.addEventListener('click', () => {
    notes = []
    closeMenu()
    renderNotes()
    redraw()
  })
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      closeMenu()
      sendButton.focus()
    }
  })
  sendButton.disabled = !canSend()
  if (sendButton.disabled) sendButton.title = t('sendUnavailable')

  setKind('change')
  renderNotes()

  return {
    popover,
    panel,
    open: (pick, at) => {
      const fresh = popover.hidden
      if (fresh) {
        text.value = ''
        addButton.disabled = true
        setKind('change')
        showRadius(DEFAULT_RADIUS)
        say(null)
      }
      closeMenu()
      pending = pick
      target.textContent = annotationSummary(pick) || t('noteUnnamed')
      popover.hidden = false
      // Why after it is shown: its size is only known then, and it must stay inside the view.
      const area = popover.parentElement
      const room = (extent: number | undefined, own: number, wanted: number): number => Math.max(8, Math.min(wanted, (extent ?? 0) - own - 8))
      popover.style.left = `${room(area?.clientWidth, popover.offsetWidth, at.x + 14)}px`
      popover.style.top = `${room(area?.clientHeight, popover.offsetHeight, at.y + 14)}px`
      text.focus()
      redraw()
    },
    close,
    setModelSize: (next) => {
      size = next
      radiusUnit.textContent = next.unit
    },
    redraw,
    setVisible: (next) => {
      visible = next
      renderNotes()
    }
  }
}
