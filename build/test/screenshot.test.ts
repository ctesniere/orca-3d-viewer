import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { screenshotFilename } from '../src/screenshot.ts'

describe('screenshotFilename', () => {
  it('names the file with the date and time (UTC), sortable and free of characters a filesystem refuses', () => {
    assert.equal(screenshotFilename(new Date(Date.UTC(2026, 10, 19, 9, 5, 37))), '3d-viewer-2026-11-19-090537.png')
  })

  it('pads single digits in every field', () => {
    assert.equal(screenshotFilename(new Date(Date.UTC(2001, 0, 2, 3, 4, 5))), '3d-viewer-2001-01-02-030405.png')
  })

  it('never produces the same name twice within the same second', () => {
    const a = screenshotFilename(new Date(Date.UTC(2030, 5, 1, 0, 0, 0)))
    const b = screenshotFilename(new Date(Date.UTC(2030, 5, 1, 0, 0, 1)))
    assert.notEqual(a, b)
  })
})
