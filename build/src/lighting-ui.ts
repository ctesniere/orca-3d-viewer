// The panel that sets how the model is lit: the type of light, how strong, how bright the picture is, and where
// the direct light comes from. Every change is applied at once and reported to `onChange`.
import { DEFAULT_LIGHTING, LIGHTING_LIMITS, LIGHTING_MODES, type Lighting, type LightingMode } from './lighting.ts'
import { element } from './dom.ts'
import type { MessageKey, Translate } from './messages.ts'

export type LightingUi = {
  panel: HTMLElement
  isOpen: () => boolean
  toggle: () => void
  close: () => void
  /** Shows `lighting` in the controls without reporting it as a change. */
  set: (lighting: Lighting) => void
}

const MODE_LABELS: Record<LightingMode, MessageKey> = {
  studio: 'lightingStudio',
  environment: 'lightingEnvironment',
  directional: 'lightingDirectional',
  flat: 'lightingFlat'
}

type SliderKey = 'intensity' | 'exposure' | 'azimuth' | 'elevation'

export function createLightingUi(t: Translate, initial: Lighting, onChange: (lighting: Lighting) => void, onClose: () => void): LightingUi {
  let lighting = initial

  const modeSelect = element(
    'select',
    { className: 'select lighting-mode', ariaLabel: t('lightingType') },
    LIGHTING_MODES.map((mode) => element('option', { value: mode, textContent: t(MODE_LABELS[mode]) }))
  )
  const slider = (key: SliderKey, label: MessageKey, show: (value: number) => string) => {
    const { min, max, step } = LIGHTING_LIMITS[key]
    const input = element('input', { type: 'range', className: 'lighting-range', min: String(min), max: String(max), step: String(step), ariaLabel: t(label) })
    const output = element('output', { className: 'lighting-value' })
    const row = element('label', { className: 'lighting-row' }, [element('span', { textContent: t(label) }), input, output])
    input.addEventListener('input', () => {
      lighting = { ...lighting, [key]: input.valueAsNumber }
      render()
      onChange(lighting)
    })
    return { row, input, output, show }
  }
  const sliders = {
    intensity: slider('intensity', 'lightingIntensity', (value) => value.toFixed(2)),
    exposure: slider('exposure', 'lightingExposure', (value) => value.toFixed(2)),
    azimuth: slider('azimuth', 'lightingAzimuth', (value) => `${Math.round(value)}°`),
    elevation: slider('elevation', 'lightingElevation', (value) => `${Math.round(value)}°`)
  }
  const resetButton = element('button', { type: 'button', className: 'text-button', textContent: t('lightingReset') })
  const closeButton = element('button', { type: 'button', className: 'text-button', textContent: t('close') })
  const panel = element('div', { className: 'lighting', role: 'dialog', ariaLabel: t('lighting'), hidden: true }, [
    element('strong', { textContent: t('lighting') }),
    element('label', { className: 'lighting-row' }, [element('span', { textContent: t('lightingType') }), modeSelect]),
    ...Object.values(sliders).map((entry) => entry.row),
    element('div', { className: 'details-actions' }, [resetButton, closeButton])
  ])

  // Why disabled and not hidden: the direct light's direction means nothing to the other types, but the rows should not jump.
  const render = (): void => {
    modeSelect.value = lighting.mode
    for (const key of Object.keys(sliders) as SliderKey[]) {
      const entry = sliders[key]
      entry.input.value = String(lighting[key])
      entry.output.textContent = entry.show(lighting[key])
    }
    const direct = lighting.mode === 'studio' || lighting.mode === 'directional'
    sliders.azimuth.input.disabled = !direct
    sliders.elevation.input.disabled = !direct
  }

  modeSelect.addEventListener('change', () => {
    lighting = { ...lighting, mode: LIGHTING_MODES.find((mode) => mode === modeSelect.value) ?? lighting.mode }
    render()
    onChange(lighting)
  })
  resetButton.addEventListener('click', () => {
    lighting = { ...DEFAULT_LIGHTING }
    render()
    onChange(lighting)
  })
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
      else modeSelect.focus()
    },
    close,
    set: (next) => {
      lighting = next
      render()
    }
  }
}
