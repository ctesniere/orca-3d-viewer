// Small helpers for building the viewer's controls without parsing markup: text goes in as text.
import { createElement, type IconNode } from 'lucide'

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

export function icon(node: IconNode, size = 14): SVGElement {
  return createElement(node, { width: size, height: size, 'aria-hidden': 'true' })
}
