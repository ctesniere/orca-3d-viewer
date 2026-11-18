import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { Group, Mesh, Object3D } from 'three'
import type { ModelPick, Note } from '../src/annotation.ts'
import { documentId } from '../src/document-id.ts'
import { loadNotes, MAX_STORED_DOCUMENTS, MAX_STORED_NOTES, notesFrom, saveNotes } from '../src/notes-storage.ts'
import { findPiece, MAX_STORED_NAME, namePath, pieceIdOf } from '../src/piece-id.ts'

describe('document id', () => {
  const bytes = (length: number, seed = 1): ArrayBuffer => {
    const data = new Uint8Array(length)
    for (let index = 0; index < length; index++) data[index] = (index * 31 + seed) & 255
    return data.buffer
  }

  it('is the same for the same content and different for another length or another start, middle or end', () => {
    const base = bytes(1_000_000)
    assert.equal(documentId(base), documentId(base.slice(0)))
    assert.notEqual(documentId(base), documentId(bytes(1_000_001)))
    // The middle is sampled, not read whole, so a change there has to be wider than the gap between samples.
    for (const [from, to] of [[0, 1], [500_000, 500_100], [999_999, 1_000_000]] as const) {
      const changed = new Uint8Array(base.slice(0))
      for (let index = from; index < to; index++) changed[index] = changed[index]! ^ 0xff
      assert.notEqual(documentId(changed.buffer), documentId(base), `a change at ${from}`)
    }
  })

  it('names text too, and an empty document', () => {
    assert.equal(documentId('{"asset":{}}'), documentId('{"asset":{}}'))
    assert.notEqual(documentId('{"asset":{}}'), documentId('{"asset":[]}'))
    assert.match(documentId(new ArrayBuffer(0)), /^0-/)
  })

  it('reads a 64 MiB document without taking a noticeable time', () => {
    const big = new ArrayBuffer(64 * 1024 * 1024)
    const started = performance.now()
    documentId(big)
    assert.ok(performance.now() - started < 500)
  })
})

describe('piece id', () => {
  const tree = (): { root: Group; wheel: Mesh } => {
    const root = new Group()
    root.name = 'Scene'
    const body = new Group()
    body.name = 'Body'
    const wheel = new Mesh()
    wheel.name = 'Wheel'
    body.add(new Object3D(), wheel)
    root.add(body)
    return { root, wheel }
  }

  it('finds the same piece again in a model of the same shape, as after the file was loaded anew', () => {
    const first = tree()
    const second = tree()
    const id = pieceIdOf(first.wheel, first.root)
    assert.equal(findPiece(id, second.root), second.wheel)
    assert.deepEqual(namePath(second.wheel, second.root), ['Scene', 'Body', 'Wheel'])
  })

  it('finds nothing when the model is shaped differently or the names no longer match', () => {
    const { root, wheel } = tree()
    const id = pieceIdOf(wheel, root)
    wheel.name = 'Tyre'
    assert.equal(findPiece(id, root), null)
    wheel.name = 'Wheel'
    root.children[0]!.children[1]!.removeFromParent()
    assert.equal(findPiece(id, root), null)
  })

  it('refuses ids that are not what it writes', () => {
    const { root } = tree()
    for (const id of ['', 'x', '{}', '[]', '[[0],["Scene"]]', '[[-1],["Scene","a"]]', '[[1.5],["Scene","a"]]', '[[0],["Scene","Body"],1]', `[${JSON.stringify(Array(80).fill(0))},${JSON.stringify(Array(81).fill('x'))}]`]) {
      assert.equal(findPiece(id, root), null, id)
    }
    assert.equal(findPiece('[[0],["Scene","Body"]]', root)?.name, 'Body')
  })

  it('cuts long names the same way when writing and when comparing', () => {
    const root = new Group()
    const long = new Mesh()
    long.name = 'x'.repeat(MAX_STORED_NAME * 3)
    root.add(long)
    assert.equal(findPiece(pieceIdOf(long, root), root), long)
  })
})

describe('stored notes', () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    store.clear()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) }
    })
  })

  const pick = (): ModelPick => ({
    point: [1, 2, 3],
    localPoint: [0, 0, 0],
    normal: null,
    pieceId: '[[0],["Scene","Body"]]',
    path: ['Scene', 'Body'],
    material: null,
    camera: { position: [1, 1, 1], target: [0, 0, 0] }
  })
  const note = (comment: string): Note => ({ kind: 'change', comment, zone: true, radius: 0.5, pick: pick() })

  it('keeps a document’s notes and file for the next time, and forgets them when there are none', () => {
    saveNotes('doc-a', 'assets/a.glb', [note('one'), note('two')])
    assert.deepEqual(loadNotes('doc-a'), { filePath: 'assets/a.glb', notes: [note('one'), note('two')] })
    assert.equal(loadNotes('doc-b'), null)
    saveNotes('doc-a', '', [])
    assert.equal(loadNotes('doc-a'), null)
  })

  it('keeps only the last few documents', () => {
    for (let index = 0; index < MAX_STORED_DOCUMENTS + 3; index++) saveNotes(`doc-${index}`, '', [note(String(index))])
    assert.equal(loadNotes('doc-0'), null)
    assert.ok(loadNotes(`doc-${MAX_STORED_DOCUMENTS + 2}`))
    assert.equal(JSON.parse(store.get('viewer-notes')!).documents.length, MAX_STORED_DOCUMENTS)
  })

  it('drops every note that is not valid, and what is past the limit, without throwing', () => {
    const good = note('good')
    const hostile = [
      null,
      5,
      'x',
      [],
      { ...good, kind: 'shout' },
      { ...good, comment: 5 },
      { ...good, comment: 'x'.repeat(100_000) },
      { ...good, zone: 'yes' },
      { ...good, radius: -1 },
      { ...good, radius: Infinity },
      { ...good, pick: { ...good.pick, point: [1, 2] } },
      { ...good, pick: { ...good.pick, point: [1, 2, 'a'] } },
      { ...good, pick: { ...good.pick, path: [1] } },
      { ...good, pick: { ...good.pick, pieceId: 'x'.repeat(10_000) } },
      { ...good, pick: null },
      JSON.parse('{"kind":"change","comment":"x","zone":true,"radius":1,"__proto__":{"pick":1}}'),
      good
    ]
    assert.deepEqual(notesFrom(hostile), [good])
    assert.equal(notesFrom(Array.from({ length: MAX_STORED_NOTES + 50 }, () => good)).length, MAX_STORED_NOTES)
    assert.deepEqual(notesFrom('not a list'), [])
  })

  it('treats broken storage as empty, and does not throw when storage refuses', () => {
    for (const stored of ['', 'not json', 'null', '5', '{"documents":5}', '{"documents":[null,{"id":5},{"id":"x"}]}']) {
      store.set('viewer-notes', stored)
      assert.doesNotThrow(() => loadNotes('x'))
    }
    store.set('viewer-notes', '{"documents":[{"id":"x","filePath":5,"notes":"no"}]}')
    assert.deepEqual(loadNotes('x'), { filePath: '', notes: [] })
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('full') } } })
    assert.doesNotThrow(() => saveNotes('x', '', [note('a')]))
    assert.equal(loadNotes('x'), null)
  })
})
