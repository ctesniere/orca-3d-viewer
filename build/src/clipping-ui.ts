// The panel that cuts away one side of the model along an axis, to see inside it. Every change is applied
// at once and reported to `onChange`, the same way the lighting panel works.
import { CLIPPING_AXES, type Clipping, type ClippingAxis } from './clipping.ts'
import { element } from './dom.ts'
import type { MessageKey, Translate } from './messages.ts'

export type ClippingUi = {
  panel: HTMLElement
  isOpen: () => boolean
  toggle: () => void
  close: () => void
  /** Shows `clipping` in the controls without reporting it as a change. */
  set: (clipping: Clipping) => void
}

const AXIS_LABELS: Record<ClippingAxis, MessageKey> = { x: 'clippingAxisX', y: 'clippingAxisY', z: 'clippingAxisZ' }

export function createClippingUi(t: Translate, initial: Clipping, onChange: (clipping: Clipping) => void, onClose: () => void): ClippingUi {
  let clipping = initial

  const enabledInput = element('input', { type: 'checkbox', className: 'zone-input' })
  const axisSelect = element(
    'select',
    { className: 'select', ariaLabel: t('clippingAxis') },
    CLIPPING_AXES.map((axis) => element('option', { value: axis, textContent: t(AXIS_LABELS[axis]) }))
  )
  const positionInput = element('input', { type: 'range', className: 'lighting-range', min: '0', max: '1', step: '0.01', ariaLabel: t('clippingPosition') })
  const flippedInput = element('input', { type: 'checkbox', className: 'zone-input' })
  const closeButton = element('button', { type: 'button', className: 'text-button', textContent: t('close') })
  const panel = element('div', { className: 'lighting', role: 'dialog', ariaLabel: t('clippingTitle'), hidden: true }, [
    element('strong', { textContent: t('clippingTitle') }),
    element('label', { className: 'zone-row' }, [enabledInput, element('span', { textContent: t('clippingEnabled') })]),
    element('label', { className: 'lighting-row' }, [element('span', { textContent: t('clippingAxis') }), axisSelect]),
    element('label', { className: 'lighting-row' }, [element('span', { textContent: t('clippingPosition') }), positionInput]),
    element('label', { className: 'zone-row' }, [flippedInput, element('span', { textContent: t('clippingFlip') })]),
    element('div', { className: 'details-actions' }, [closeButton])
  ])

  const render = (): void => {
    enabledInput.checked = clipping.enabled
    axisSelect.value = clipping.axis
    axisSelect.disabled = !clipping.enabled
    positionInput.valueAsNumber = clipping.position
    positionInput.disabled = !clipping.enabled
    flippedInput.checked = clipping.flipped
    flippedInput.disabled = !clipping.enabled
  }

  const change = (next: Clipping): void => {
    clipping = next
    render()
    onChange(clipping)
  }
  enabledInput.addEventListener('change', () => change({ ...clipping, enabled: enabledInput.checked }))
  axisSelect.addEventListener('change', () => change({ ...clipping, axis: CLIPPING_AXES.find((axis) => axis === axisSelect.value) ?? clipping.axis }))
  positionInput.addEventListener('input', () => change({ ...clipping, position: positionInput.valueAsNumber }))
  flippedInput.addEventListener('change', () => change({ ...clipping, flipped: flippedInput.checked }))
  const close = (): void => {
    if (panel.hidden) return
    panel.hidden = true
    onClose()
  }
  closeButton.addEventListener('click', close)
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close()
  })
  render()

  return {
    panel,
    isOpen: () => !panel.hidden,
    toggle: () => {
      panel.hidden = !panel.hidden
      if (panel.hidden) onClose()
      else enabledInput.focus()
    },
    close,
    set: (next) => {
      clipping = next
      render()
    }
  }
}
