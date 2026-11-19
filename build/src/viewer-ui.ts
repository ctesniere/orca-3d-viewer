import { Axis3d, Box, Camera, createElement, EyeOff, Grid3x3, type IconNode, Info, ListTree, MessageSquarePlus, Moon, Pause, Play, RotateCcw, Scissors, Sun } from 'lucide'
import type { ModelPick } from './annotation.ts'
import { createAnnotationUi } from './annotation-ui.ts'
import { createClippingUi } from './clipping-ui.ts'
import type { Clipping } from './clipping.ts'
import { element, icon } from './dom.ts'
import { createIsolationUi } from './isolation-ui.ts'
import { createLightingUi } from './lighting-ui.ts'
import type { Lighting } from './lighting.ts'
import { cleanName, formatCount, lengthFormat } from './display-format.ts'
import type { MessageKey, Translate } from './messages.ts'
import type { CameraView, HiddenPiece, ModelSummary, OutlineNode, PickMode, SpotMarker } from './model-scene.ts'
import { createOutlinerUi } from './outliner-ui.ts'
import { screenshotFilename } from './screenshot.ts'
import { ALL_CLIPS } from './scene-animation.ts'
import { loadPreferences, savePreferences } from './viewer-preferences.ts'

export type ViewerActions = {
  resetView: () => void
  setWireframe: (enabled: boolean) => void
  setGuidesVisible: (visible: boolean) => void
  playAnimation: (clipIndex: number) => void
  setAnimationPaused: (paused: boolean) => void
  setLighting: (lighting: Lighting) => void
  setClipping: (clipping: Clipping) => void
  setCameraView: (view: CameraView) => void
  setAnnotationMarkers: (notes: SpotMarker[], pending: SpotMarker | null) => void
  setPickMode: (mode: PickMode) => void
  showPiece: (pieceId: string) => void
  showAllHidden: () => void
  toggleHidden: (pieceId: string) => void
  focusPiece: (pieceId: string) => void
  captureScreenshot: () => string | null
}

export type ViewerUi = {
  viewport: HTMLElement
  showLoading: () => void
  showError: (message: string) => void
  /** Notes in the toolbar that a newer save is loading while the current model stays up. */
  setPending: (text: string | null) => void
  /** Asks what to change at the spot the user picked, near `at`; the notes can then be copied or sent to an agent. */
  openAnnotation: (pick: ModelPick, at: { x: number; y: number }) => void
  /** Says which document is shown, so that its notes come back after Orca recreated the frame. */
  setDocument: (id: string) => void
  /** Shows the pieces an isolate-mode click has hidden, so each (or all of them) can be shown again. */
  setHiddenPieces: (pieces: HiddenPiece[]) => void
  /** Shows the model's scene graph in the outliner panel. */
  setOutline: (tree: OutlineNode | null, truncated: boolean) => void
  /** Shows a model's figures; `keepToggles` carries wireframe and guides over from the last model. */
  showModel: (summary: ModelSummary, actions: ViewerActions, notices: string[], keepToggles: boolean) => void
}

function toolButton(iconNode: IconNode, title: string): HTMLButtonElement {
  return element('button', { type: 'button', className: 'tool', title, ariaLabel: title }, [icon(iconNode)])
}

const VIEW_OPTIONS: readonly CameraView[] = ['perspective', 'front', 'top', 'side']
const VIEW_LABELS: Record<CameraView, MessageKey> = {
  perspective: 'cameraViewPerspective',
  front: 'cameraViewFront',
  top: 'cameraViewTop',
  side: 'cameraViewSide'
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
  const isolateButton = toolButton(EyeOff, t('isolateMode'))
  const outlineButton = toolButton(ListTree, t('outlineTitle'))
  const clippingButton = toolButton(Scissors, t('clippingTitle'))
  const lightingButton = toolButton(Sun, t('lighting'))
  const theme = toolButton(Moon, t('darkTheme'))
  const screenshotButton = toolButton(Camera, t('screenshot'))
  const detailsButton = toolButton(Info, t('details'))
  const viewSelect = element(
    'select',
    { className: 'select', ariaLabel: t('cameraView') },
    VIEW_OPTIONS.map((view) => element('option', { value: view, textContent: t(VIEW_LABELS[view]) }))
  )
  const play = element('button', { type: 'button', className: 'tool' })
  const animationSelect = element('select', { className: 'select', ariaLabel: t('animation') })
  const animationName = element('span', { className: 'clip-name' })
  const animationGroup = element('div', { className: 'group', hidden: true }, [play, animationSelect, animationName])
  const stats = element('span', { className: 'figure' })
  const dimensions = element('span', { className: 'figure', title: t('dimensionsTitle') })
  const gridCell = element('span', { className: 'figure' })
  const pending = element('span', { className: 'pending', role: 'status', hidden: true })
  const toolbar = element('footer', { className: 'toolbar' }, [
    element('div', { className: 'group' }, [reset, wireframe, guides, annotate, isolateButton, outlineButton, clippingButton, lightingButton, theme, screenshotButton, detailsButton]),
    viewSelect,
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

  let lighting = loadPreferences().lighting
  const lightingUi = createLightingUi(
    t,
    lighting,
    (next) => {
      lighting = next
      actions?.setLighting(next)
      save()
    },
    () => setPressed(lightingButton, false)
  )
  let clipping = loadPreferences().clipping
  const clippingUi = createClippingUi(
    t,
    clipping,
    (next) => {
      clipping = next
      actions?.setClipping(next)
      save()
    },
    () => setPressed(clippingButton, false)
  )
  const annotations = createAnnotationUi(
    t,
    locale,
    { showMarkers: (notes, pending) => actions?.setAnnotationMarkers(notes, pending) },
    () => viewport.querySelector('canvas')?.focus()
  )
  const isolation = createIsolationUi(
    t,
    locale,
    (pieceId) => actions?.showPiece(pieceId),
    () => actions?.showAllHidden()
  )
  const outliner = createOutlinerUi(
    t,
    (pieceId) => actions?.focusPiece(pieceId),
    (pieceId) => actions?.toggleHidden(pieceId),
    () => setPressed(outlineButton, false)
  )
  root.replaceChildren(
    element('div', { className: 'stage' }, [viewport, overlay, details, annotations.popover, annotations.panel, isolation.panel, outliner.panel, clippingUi.panel, lightingUi.panel]),
    notice,
    toolbar
  )

  const openDetails = (): void => {
    annotations.close(false)
    lightingUi.close()
    outliner.close()
    clippingUi.close()
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
  const save = (): void => savePreferences({ dark, wireframe: wireframeOn, guides: guidesOn, lighting, clipping })
  // Why not saved with the other toggles: it should not turn itself on in the next file someone opens.
  let annotating = false
  let isolating = false
  let paused = false
  // Why not saved either: resetView and a new model both put the camera back to perspective (model-scene.ts
  // does the same), so this would only ever show stale next time.
  let cameraView: CameraView = 'perspective'
  const pickMode = (): PickMode => (annotating ? 'annotate' : isolating ? 'isolate' : 'off')

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
    for (const button of [reset, wireframe, guides, annotate, isolateButton, outlineButton, clippingButton, lightingButton, screenshotButton]) button.disabled = !enabled
    viewSelect.disabled = !enabled
  }

  reset.addEventListener('click', () => {
    actions?.resetView()
    cameraView = 'perspective'
    viewSelect.value = cameraView
  })
  viewSelect.addEventListener('change', () => {
    cameraView = VIEW_OPTIONS.find((view) => view === viewSelect.value) ?? cameraView
    actions?.setCameraView(cameraView)
  })
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
    if (annotating && isolating) {
      isolating = false
      setPressed(isolateButton, false)
    }
    setPressed(annotate, annotating)
    actions?.setPickMode(pickMode())
    if (!annotating) annotations.close(false)
  })
  isolateButton.addEventListener('click', () => {
    isolating = !isolating
    if (isolating && annotating) {
      annotating = false
      setPressed(annotate, false)
      annotations.close(false)
    }
    setPressed(isolateButton, isolating)
    actions?.setPickMode(pickMode())
  })
  outlineButton.addEventListener('click', () => {
    if (outliner.isOpen()) return outliner.toggle()
    details.hidden = true
    annotations.close(false)
    lightingUi.close()
    clippingUi.close()
    outliner.toggle()
    setPressed(outlineButton, true)
  })
  clippingButton.addEventListener('click', () => {
    if (clippingUi.isOpen()) return clippingUi.toggle()
    details.hidden = true
    annotations.close(false)
    lightingUi.close()
    outliner.close()
    clippingUi.toggle()
    setPressed(clippingButton, true)
  })
  lightingButton.addEventListener('click', () => {
    if (lightingUi.isOpen()) return lightingUi.toggle()
    details.hidden = true
    annotations.close(false)
    outliner.close()
    clippingUi.close()
    lightingUi.toggle()
    setPressed(lightingButton, true)
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
  screenshotButton.addEventListener('click', () => {
    const image = actions?.captureScreenshot()
    if (!image) return
    // Why built here, not kept around: Orca's frames refuse navigator.clipboard, but a fresh link's
    // default action still runs on click, with no need to add it to the page or ask the host for anything.
    element('a', { href: image, download: screenshotFilename(new Date()) }).click()
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
    lightingUi.close()
    outliner.close()
    clippingUi.close()
    annotations.setVisible(false)
    isolation.setVisible(false)
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
    setDocument: annotations.setDocument,
    setHiddenPieces: (pieces) => {
      isolation.setHidden(pieces)
      outliner.setHidden(new Set(pieces.map((piece) => piece.pieceId)))
    },
    setOutline: outliner.setTree,
    showModel: (summary, modelActions, notices, keepToggles) => {
      clearFigures()
      actions = modelActions
      if (!keepToggles) {
        const last = loadPreferences()
        wireframeOn = last.wireframe
        guidesOn = last.guides
        lighting = last.lighting
        lightingUi.set(lighting)
        clipping = last.clipping
        clippingUi.set(clipping)
      }
      paused = false
      setPressed(wireframe, wireframeOn)
      setPressed(guides, guidesOn)
      setPressed(annotate, annotating)
      setPressed(isolateButton, isolating)
      // Why always, unlike the toggles above: model-scene.ts puts every new model’s camera back to
      // perspective itself, so the select must follow even when the other toggles carry over.
      cameraView = 'perspective'
      viewSelect.value = cameraView
      modelActions.setPickMode(pickMode())
      modelActions.setLighting(lighting)
      modelActions.setClipping(clipping)
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
      isolation.setVisible(true)
      gridCell.hidden = !guidesOn
      gridCell.textContent = t('gridCell', { size: `${lengths.format(summary.gridCellSize)} ${lengths.unit}` })
      viewport.ariaLabel = t('viewportLabel', { summary: `${stats.textContent}, ${dimensions.textContent}` })
    }
  }
}
