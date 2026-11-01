import { describe, expect, it } from 'vitest'
import {
  deleteCaption,
  editCaptionText,
  findCaptionReviewWords,
  getActiveCaption,
  getActiveWordIndex,
  layoutCaptions,
  mergeCaptions,
  nudgeCaptionEnd,
  nudgeCaptionStart,
  splitCaption,
} from './engine.js'

const words = [
  { word: 'We', start: 0, end: 0.2 },
  { word: 'make', start: 0.2, end: 0.4 },
  { word: 'small', start: 0.4, end: 0.7 },
  { word: 'clips.', start: 0.7, end: 1 },
  { word: 'Then', start: 1.6, end: 1.8 },
  { word: 'we', start: 1.8, end: 2 },
  { word: 'share.', start: 2, end: 2.3 },
]

describe('layoutCaptions', () => {
  it('respects fixed paces and sentence/pause boundaries', () => {
    expect(layoutCaptions(words, 2).map((caption) => caption.text)).toEqual([
      'We make',
      'small clips.',
      'Then we',
      'share.',
    ])
    expect(layoutCaptions(words, 5).map((caption) => caption.text)).toEqual([
      'We make small clips.',
      'Then we share.',
    ])
    expect(layoutCaptions(words, 'sentence').map((caption) => caption.text)).toEqual([
      'We make small clips.',
      'Then we share.',
    ])
    expect(layoutCaptions(words, 5)[0].words[2]).toEqual(words[2])
  })

  it('rejects unsupported pace settings', () => {
    expect(() => layoutCaptions(words, 4)).toThrow(/pace/u)
  })
})

describe('caption timing helpers', () => {
  const captions = layoutCaptions(words, 5)

  it('finds active captions and words', () => {
    expect(getActiveCaption(captions, 0.5)).toBe(0)
    expect(getActiveCaption(captions, 1.3)).toBe(-1)
    expect(getActiveWordIndex(captions[0], 0.5)).toBe(2)
  })

  it('maps edited words proportionally across the caption range', () => {
    const edited = editCaptionText(captions[0], 'A fresh little scene.')
    expect(edited.text).toBe('A fresh little scene.')
    expect(edited.words[0].start).toBe(0)
    expect(edited.words.at(-1).end).toBe(1)
    expect(edited.words).toHaveLength(4)
  })

  it('splits, merges, deletes, and nudges timing boundaries', () => {
    const split = splitCaption(captions[0], 2)
    expect(split.map((caption) => caption.text)).toEqual(['We make', 'small clips.'])
    expect(mergeCaptions(split, 0)).toHaveLength(1)
    expect(deleteCaption(captions, 0)).toHaveLength(1)
    expect(nudgeCaptionStart(captions[0], 0.05).start).toBe(0.05)
    expect(nudgeCaptionEnd(captions[0], 0.1).end).toBeCloseTo(1.1)
  })

  it('flags words for a muted review marker without changing caption text', () => {
    const flagged = findCaptionReviewWords(
      [{ start: 0, end: 0.3, words: [{ word: 'damn', start: 0, end: 0.3 }] }],
      'english',
    )
    expect(flagged.get('0:0.3:damn')).toBe('Potentially profane')
  })
})
