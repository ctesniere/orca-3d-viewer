// The panel showing the model's scene graph: a name to click to centre the view on that piece, and an
// eye to hide or show it, sharing the same hidden set the isolate tool uses.
import { Eye, EyeOff } from 'lucide'
import { element, icon } from './dom.ts'
import type { Translate } from './messages.ts'
import type { OutlineNode } from './model-scene.ts'

export type OutlinerUi = {
  panel: HTMLElement
  isOpen: () => boolean
  toggle: () => void
  close: () => void
  setTree: (tree: OutlineNode | null, truncated: boolean) => void
  setHidden: (hidden: Set<string>) => void
}

const INDENT_PX = 14

export function createOutlinerUi(t: Translate, onFocus: (pieceId: string) => void, onToggleHide: (pieceId: string) => void, onClose: () => void): OutlinerUi {
  let tree: OutlineNode | null = null
  let truncated = false
  let hidden = new Set<string>()

  const list = element('div', { className: 'outline-tree' })
  const note = element('p', { className: 'outline-note', textContent: t('outlineTruncated'), hidden: true })
  const closeButton = element('button', { type: 'button', className: 'text-button', textContent: t('close') })
  const panel = element('div', { className: 'outline', role: 'dialog', ariaLabel: t('outlineTitle'), hidden: true }, [
    element('div', { className: 'outline-head' }, [element('strong', { textContent: t('outlineTitle') }), closeButton]),
    list,
    note
  ])

  const row = (node: OutlineNode, depth: number): HTMLElement => {
    const name = element('button', { type: 'button', className: 'text-button outline-name', textContent: node.name.trim() === '' ? t('noteUnnamed') : node.name, title: t('focusPiece') })
    name.style.paddingLeft = `${depth * INDENT_PX}px`
    name.addEventListener('click', () => onFocus(node.pieceId))
    const isHidden = hidden.has(node.pieceId)
    const eye = element('button', { type: 'button', className: 'tool', title: t(isHidden ? 'showPiece' : 'hidePiece'), ariaLabel: t(isHidden ? 'showPiece' : 'hidePiece') }, [
      icon(isHidden ? EyeOff : Eye, 14)
    ])
    eye.addEventListener('click', () => onToggleHide(node.pieceId))
    return element('div', {}, [element('div', { className: 'outline-row' }, [name, eye]), ...node.children.map((child) => row(child, depth + 1))])
  }

  const render = (): void => {
    note.hidden = !truncated
    list.replaceChildren(...(tree ? [row(tree, 0)] : []))
  }

  const close = (): void => {
    if (panel.hidden) return
    panel.hidden = true
    onClose()
  }
  closeButton.addEventListener('click', close)
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close()
  })

  return {
    panel,
    isOpen: () => !panel.hidden,
    toggle: () => {
      panel.hidden = !panel.hidden
      if (panel.hidden) onClose()
      else closeButton.focus()
    },
    close,
    setTree: (next, nextTruncated) => {
      tree = next
      truncated = nextTruncated
      render()
    },
    setHidden: (next) => {
      hidden = next
      render()
    }
  }
}
