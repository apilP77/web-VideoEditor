import { describe, expect, it } from 'vitest'
import {
  getCaptionExportFilename,
  getCaptionExportWords,
  shouldWarnAboutCaptionExport,
} from './exportHelpers.js'

describe('caption export helpers', () => {
  it('flattens edited words and keeps their times in order', () => {
    expect(
      getCaptionExportWords([
        { words: [{ word: 'second', start: 2, end: 3 }] },
        { words: [{ word: 'first', start: 0, end: 1 }] },
      ]),
    ).toEqual([
      { word: 'first', start: 0, end: 1 },
      { word: 'second', start: 2, end: 3 },
    ])
  })

  it('creates sanitized filenames for all supported export types', () => {
    expect(getCaptionExportFilename('my: clip.mp4', 'mp4')).toBe('my_ clip-captions.mp4')
    expect(getCaptionExportFilename('clip', '.srt')).toBe('clip-captions.srt')
    expect(() => getCaptionExportFilename('clip.mp4', '')).toThrow(TypeError)
  })

  it('warns for clips longer than ten minutes or 1080p at 60 fps', () => {
    expect(shouldWarnAboutCaptionExport({ duration: 601 })).toBe(true)
    expect(
      shouldWarnAboutCaptionExport({
        width: 1080,
        height: 1920,
        frameRate: 60,
      }),
    ).toBe(true)
    expect(
      shouldWarnAboutCaptionExport({
        width: 1080,
        height: 1920,
        frameRate: 30,
      }),
    ).toBe(false)
    expect(shouldWarnAboutCaptionExport({ duration: 600, width: 720, height: 1280 })).toBe(false)
  })
})
