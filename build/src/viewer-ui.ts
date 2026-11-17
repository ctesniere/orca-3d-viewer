import { Axis3d, Box, createElement, Grid3x3, type IconNode, Info, MessageSquarePlus, Moon, Pause, Play, RotateCcw } from 'lucide'
import type { ModelPick } from './annotation.ts'
import { createAnnotationUi } from './annotation-ui.ts'
import { element, icon } from './dom.ts'
import { cleanName, formatCount, lengthFormat } from './display-format.ts'
import type { Translate } from './messages.ts'
import type { ModelSummary, SpotMarker } from './model-scene.ts'
import { ALL_CLIPS } from './scene-animation.ts'
import { loadPreferences, savePreferences } from './viewer-preferences.ts'

export type ViewerActions = {
  resetView: () => void
  setWireframe: (enabled: boolean) => void
  setGuidesVisible: (visible: boolean) => void
  playAnimation: (clipIndex: number) => void
  setAnimationPaused: (paused: boolean) => void
  setAnnotationMarkers: (notes: SpotMarker[], pending: SpotMarker | null) => void
  setPickingEnabled: (enabled: boolean) => void
}

export type ViewerUi = {
  viewport: HTMLElement
  showLoading: () => void
  showError: (message: string) => void
  /** Notes in the toolbar that a newer save is loading while the current model stays up. */
  setPending: (text: string | null) => void
  /** Asks what to change at the spot the user picked, near `at`; the notes can then be copied or sent to an agent. */
  openAnnotation: (pick: ModelPick, at: { x: number; y: number }) => void
  /** Shows a model's figures; `keepToggles` carries wireframe and guides over from the last model. */
  showModel: (summary: ModelSummary, actions: ViewerActions, notices: string[], keepToggles: boolean) => void
}

function toolButton(iconNode: IconNode, title: string): HTMLButtonElement {
  return element('button', { type: 'button', className: 'tool', title, ariaLabel: title }, [icon(iconNode)])
}

/** `report` builds the Details panel's text when the panel opens. */
export function createViewerUi(root: HTMLElement, t: Translate, locale: string, report: () => string): ViewerUi {
  const animationLabel = (name: string | undefined, index: number): string =>
    cleanName(name ?? '') || t('animationFallback', { index: index + 1 })

  // Why a group, not an img: an img's children are hidden from assistive technology, and the canvas takes focus.
  const viewport = element('div', { className: 'viewport', role: 'group', ariaLabel: t('loading') })
  const overlayIcon = element('span', { className: 'overlay-icon' })
  const overlayText = element('p')
  const overlayDetails = element('button', { type: 'button', className: 'text-button', textContent: t('details'), hidden: true })
  const overlay = element('div', { className: 'overlay' }, [overlayIcon, overlayText, overlayDetails])
  // Why a status region: a later save that failed must be announced, not only shown.
  const notice = element('div', { className: 'notice', role: 'status', hidden: true })

  const reset = toolButton(RotateCcw, t('resetView'))
  const wireframe = toolButton(Grid3x3, t('wireframe'))
  const guides = toolButton(Axis3d, t('guides'))
  const annotate = toolButton(MessageSquarePlus, t('annotateMode'))
  const theme = toolButton(Moon, t('darkTheme'))
  const detailsButton = toolButton(Info, t('details'))
  const play = element('button', { type: 'button', className: 'tool' })
  const animationSelect = element('select', { className: 'select', ariaLabel: t('animation') })
  const animationName = element('span', { className: 'clip-name' })
  const animationGroup = element('div', { className: 'group', hidden: true }, [play, animationSelect, animationName])
  const stats = element('span', { className: 'figure' })
  const dimensions = element('span', { className: 'figure', title: t('dimensionsTitle') })
  const gridCell = element('span', { className: 'figure' })
  const pending = element('span', { className: 'pending', role: 'status', hidden: true })
  const toolbar = element('footer', { className: 'toolbar' }, [
    element('div', { className: 'group' }, [reset, wireframe, guides, annotate, theme, detailsButton]),
    animationGroup,
    stats,
    dimensions,
    gridCell,
    pending
  ])
  const detailsText = element('textarea', { className: 'details-text', readOnly: true, spellcheck: false, ariaLabel: t('detailsTitle') })
  const copyButton = element('button', { type: 'button', className: 'text-button', textContent: t('copyDetails') })
  const closeButton = element('button', { type: 'button', className: 'text-button', textContent: t('close') })
  const copyStatus = element('span', { className: 'copy-status', role: 'status' })
  const details = element('div', { className: 'details', role: 'dialog', ariaLabel: t('detailsTitle'), hidden: true }, [
    element('strong', { textContent: t('detailsTitle') }),
    element('p', { textContent: t('detailsNote') }),
    detailsText,
    element('div', { className: 'details-actions' }, [copyStatus, copyButton, closeButton])
  ])

  const annotations = createAnnotationUi(
    t,
    locale,
    { showMarkers: (notes, pending) => actions?.setAnnotationMarkers(notes, pending) },
    () => viewport.querySelector('canvas')?.focus()
  )
  root.replaceChildren(element('div', { className: 'stage' }, [viewport, overlay, details, annotations.popover, annotations.panel]), notice, toolbar)

  const openDetails = (): void => {
    annotations.close(false)
    detailsText.value = report()
    copyStatus.textContent = ''
    details.hidden = false
    detailsText.focus()
  }
  const closeDetails = (): void => {
    details.hidden = true
  }
  detailsButton.addEventListener('click', () => (details.hidden ? openDetails() : closeDetails()))
  overlayDetails.addEventListener('click', openDetails)
  closeButton.addEventListener('click', closeDetails)
  details.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDetails()
  })
  copyButton.addEventListener('click', () => {
    detailsText.focus()
    detailsText.select()
    // Why execCommand: Orca's frames refuse navigator.clipboard, and allow a copy inside a click.
    let copied = false
    try {
      copied = document.execCommand('copy')
    } catch {
      copied = false
    }
    copyStatus.textContent = copied ? t('copied') : t('copyByHand')
  })

  let actions: ViewerActions | null = null
  const saved = loadPreferences()
  let dark = saved.dark
  let wireframeOn = saved.wireframe
  let guidesOn = saved.guides
  const save = (): void => savePreferences({ dark, wireframe: wireframeOn, guides: guidesOn })
  // Why not saved with the other toggles: it should not turn itself on in the next file someone opens.
  let annotating = false
  let paused = false

  const setPressed = (button: HTMLButtonElement, pressed: boolean): void => {
    button.setAttribute('aria-pressed', String(pressed))
  }
  const renderPlay = (): void => {
    const title = paused ? t('playAnimation') : t('pauseAnimation')
    play.replaceChildren(icon(paused ? Play : Pause))
    play.title = title
    play.ariaLabel = title
  }
  const setToolsEnabled = (enabled: boolean): void => {
    for (const button of [reset, wireframe, guides, annotate]) button.disabled = !enabled
  }

  reset.addEventListener('click', () => actions?.resetView())
  wireframe.addEventListener('click', () => {
    wireframeOn = !wireframeOn
    setPressed(wireframe, wireframeOn)
    actions?.setWireframe(wireframeOn)
    save()
  })
  guides.addEventListener('click', () => {
    guidesOn = !guidesOn
    setPressed(guides, guidesOn)
    gridCell.hidden = !guidesOn
    actions?.setGuidesVisible(guidesOn)
    save()
  })
  annotate.addEventListener('click', () => {
    annotating = !annotating
    setPressed(annotate, annotating)
    actions?.setPickingEnabled(annotating)
    if (!annotating) annotations.close(false)
  })
  const applyTheme = (): void => {
    document.documentElement.classList.toggle('dark', dark)
    setPressed(theme, dark)
  }
  applyTheme()
  theme.addEventListener('click', () => {
    dark = !dark
    applyTheme()
    save()
  })
  play.addEventListener('click', () => {
    paused = !paused
    renderPlay()
    actions?.setAnimationPaused(paused)
  })
  animationSelect.addEventListener('change', () => {
    paused = false
    renderPlay()
    actions?.playAnimation(Number(animationSelect.value))
  })

  const setPending = (text: string | null): void => {
    pending.hidden = text === null
    pending.textContent = text ?? ''
  }
  const clearFigures = (): void => {
    setPending(null)
    actions = null
    setToolsEnabled(false)
    animationGroup.hidden = true
    notice.hidden = true
    for (const figure of [stats, dimensions, gridCell]) figure.textContent = ''
  }

  const showOverlay = (text: string, isError: boolean): void => {
    annotations.close(false)
    annotations.setVisible(false)
    clearFigures()
    overlay.hidden = false
    toolbar.hidden = isError
    // Why alert only for errors: a screen reader should interrupt for a failure, not for "Loading…".
    overlay.setAttribute('role', isError ? 'alert' : 'status')
    overlay.classList.toggle('error', isError)
    overlayText.textContent = text
    overlayIcon.replaceChildren(...(isError ? [icon(Box, 40)] : []))
    overlayDetails.hidden = !isError
    viewport.hidden = isError
    viewport.ariaLabel = text
  }

  clearFigures()
  return {
    viewport,
    showLoading: () => showOverlay(t('loading'), false),
    showError: (message) => showOverlay(message, true),
    setPending,
    openAnnotation: annotations.open,
    showModel: (summary, modelActions, notices, keepToggles) => {
      clearFigures()
      actions = modelActions
      if (!keepToggles) {
        const last = loadPreferences()
        wireframeOn = last.wireframe
        guidesOn = last.guides
      }
      paused = false
      setPressed(wireframe, wireframeOn)
      setPressed(guides, guidesOn)
      setPressed(annotate, annotating)
      modelActions.setPickingEnabled(annotating)
      if (!summary.wireframeAvailable) {
        wireframeOn = false
        setPressed(wireframe, false)
      }
      modelActions.setWireframe(wireframeOn)
      modelActions.setGuidesVisible(guidesOn)
      overlay.hidden = true
      toolbar.hidden = false
      viewport.hidden = false
      setToolsEnabled(true)
      wireframe.disabled = !summary.wireframeAvailable
      wireframe.title = summary.wireframeAvailable ? t('wireframe') : t('wireframeTooLarge')
      notice.hidden = notices.length === 0
      notice.textContent = notices.join(' ')

      const names = summary.animationNames
      animationGroup.hidden = names.length === 0
      renderPlay()
      // Why the position as the value: clip names may repeat or be empty, so only the order identifies a clip.
      animationSelect.replaceChildren(
        ...names.map((name, index) => element('option', { value: String(index), textContent: animationLabel(name, index) })),
        ...(names.length > 1 ? [element('option', { value: String(ALL_CLIPS), textContent: t('allClips') })] : [])
      )
      animationSelect.hidden = names.length < 2
      animationName.hidden = names.length !== 1
      animationName.textContent = animationLabel(names[0], 0)

      const counts = summary.stats
      const figure = (key: 'vertices' | 'triangles' | 'points' | 'lineSegments', count: number): string =>
        t(key, { count: formatCount(count, locale) }, count)
      stats.textContent = [
        figure('vertices', counts.vertices),
        figure('triangles', counts.triangles),
        ...(counts.points > 0 ? [figure('points', counts.points)] : []),
        ...(counts.lineSegments > 0 ? [figure('lineSegments', counts.lineSegments)] : [])
      ].join(' · ')
      const { width, height, depth } = summary.dimensions
      const lengths = lengthFormat([width, height, depth], locale)
      dimensions.textContent = t('dimensions', {
        width: lengths.format(width),
        height: lengths.format(height),
        depth: lengths.format(depth),
        unit: lengths.unit
      })
      annotations.setModelSize({ diagonal: Math.hypot(width, height, depth), unit: lengths.unit, scale: lengths.scale })
      annotations.setVisible(true)
      annotations.redraw()
      gridCell.hidden = !guidesOn
      gridCell.textContent = t('gridCell', { size: `${lengths.format(summary.gridCellSize)} ${lengths.unit}` })
      viewport.ariaLabel = t('viewportLabel', { summary: `${stats.textContent}, ${dimensions.textContent}` })
    }
  }
}
