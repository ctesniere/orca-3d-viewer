// The panel listing the pieces an isolate-mode click hid, at the top left so it never covers the notes or
// lighting panels, which both sit at the bottom. It stays up across a tool change, since a piece hidden to
// get it out of the way is not something the person should have to reopen Isolate just to bring back.
import { Eye } from 'lucide'
import { formatCount } from './display-format.ts'
import { element, icon } from './dom.ts'
import type { Translate } from './messages.ts'
import type { HiddenPiece } from './model-scene.ts'

export type IsolationUi = {
  panel: HTMLElement
  setHidden: (pieces: HiddenPiece[]) => void
  setVisible: (visible: boolean) => void
}

/** The deepest named node along the path; the fallback when every node on it is unnamed. */
const pieceLabel = (path: string[], fallback: string): string => {
  const named = path.filter((name) => name !== '')
  return named.length > 0 ? named.at(-1)! : fallback
}

export function createIsolationUi(t: Translate, locale: string, onShow: (pieceId: string) => void, onShowAll: () => void): IsolationUi {
  let pieces: HiddenPiece[] = []
  let visible = true

  const title = element('strong', { className: 'hidden-title' })
  const showAllButton = element('button', { type: 'button', className: 'text-button', textContent: t('showAllPieces') })
  const list = element('ol', { className: 'hidden-list' })
  const panel = element('div', { className: 'hidden-panel', role: 'region', ariaLabel: t('hiddenPieces'), hidden: true }, [
    element('div', { className: 'hidden-head' }, [title, showAllButton]),
    list
  ])
  showAllButton.addEventListener('click', onShowAll)

  const render = (): void => {
    panel.hidden = !visible || pieces.length === 0
    title.textContent = `${t('hiddenPieces')} (${formatCount(pieces.length, locale)})`
    list.replaceChildren(
      ...pieces.map((piece) => {
        const show = element('button', { type: 'button', className: 'tool', title: t('showPiece'), ariaLabel: t('showPiece') }, [icon(Eye)])
        show.addEventListener('click', () => onShow(piece.pieceId))
        return element('li', { className: 'hidden-item' }, [element('span', { textContent: pieceLabel(piece.path, t('noteUnnamed')) }), show])
      })
    )
  }

  return {
    panel,
    setHidden: (next) => {
      pieces = next
      render()
    },
    setVisible: (next) => {
      visible = next
      render()
    }
  }
}
