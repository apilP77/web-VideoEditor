import { describe, expect, it } from 'vitest'
import {
  applyEditedText,
  formatTimestamp,
  groupWordsIntoSegments,
  stitchChunks,
  toPlainText,
  toSRT,
  toVTT,
} from './transcript.js'

describe('stitchChunks', () => {
  it('offsets chunk timestamps and keeps overlap words closest to their chunk center', () => {
    const words = stitchChunks([
      {
        start: 0,
        end: 30,
        words: [
          { word: 'hello', start: 28.5, end: 29 },
          { word: 'world', start: 29, end: 29.5 },
        ],
      },
      {
        start: 29,
        end: 58,
        words: [
          { word: 'world', start: 0, end: 0.5 },
          { word: 'again', start: 1, end: 1.5 },
        ],
      },
    ])

    expect(words).toEqual([
      { word: 'hello', start: 28.5, end: 29 },
      { word: 'world', start: 29, end: 29.5 },
      { word: 'again', start: 30, end: 30.5 },
    ])
  })

  it('does not collapse repeated words within an overlapped phrase', () => {
    const words = stitchChunks([
      {
        start: 0,
        end: 30,
        words: [
          { word: 'very', start: 29, end: 29.1 },
          { word: 'very', start: 29.2, end: 29.3 },
        ],
      },
      {
        start: 29,
        end: 58,
        words: [
          { word: 'very', start: 0, end: 0.1 },
          { word: 'very', start: 0.2, end: 0.3 },
        ],
      },
    ])

    expect(words).toEqual([
      { word: 'very', start: 29, end: 29.1 },
      { word: 'very', start: 29.2, end: 29.3 },
    ])
  })
})

describe('transcript formats', () => {
  const words = [
    { word: 'Hello,', start: 1.25, end: 1.5 },
    { word: 'world.', start: 1.5, end: 2 },
    { word: 'Next', start: 3, end: 3.25 },
    { word: 'line.', start: 3.25, end: 3.75 },
  ]

  it('groups words on punctuation, pauses, and the character limit', () => {
    expect(groupWordsIntoSegments(words)).toEqual([
      { text: 'Hello, world.', start: 1.25, end: 2 },
      { text: 'Next line.', start: 3, end: 3.75 },
    ])
    expect(
      groupWordsIntoSegments(
        [
          { word: 'one', start: 0, end: 0.2 },
          { word: 'two', start: 0.2, end: 0.4 },
        ],
        { maxCharacters: 3 },
      ),
    ).toHaveLength(2)
  })

  it('formats timestamps and writes SRT and VTT', () => {
    expect(formatTimestamp(3661.234)).toBe('01:01:01,234')
    expect(formatTimestamp(3661.234, '.')).toBe('01:01:01.234')
    expect(toSRT(words)).toContain('00:00:01,250 --> 00:00:02,000')
    expect(toVTT(words)).toContain('00:00:01.250 --> 00:00:02.000')
  })

  it('writes plain text with or without timestamps', () => {
    expect(toPlainText(words)).toBe('Hello, world.\nNext line.')
    expect(toPlainText(words, { includeTimestamps: true })).toContain(
      '[00:00:01.250] Hello, world.',
    )
  })

  it('maps edited words across the original timing span', () => {
    const edited = applyEditedText(
      [
        { word: 'old', start: 2, end: 3 },
        { word: 'words', start: 3, end: 6 },
      ],
      'new text here',
    )

    expect(edited.map(({ word }) => word)).toEqual(['new', 'text', 'here'])
    expect(edited[0].start).toBe(2)
    expect(edited[0].end).toBeCloseTo(3.333333)
    expect(edited[1].start).toBeCloseTo(3.333333)
    expect(edited[1].end).toBeCloseTo(4.666667)
    expect(edited[2].start).toBeCloseTo(4.666667)
    expect(edited[2].end).toBe(6)
  })

  it('preserves exact word timings when edits keep the same word count', () => {
    const original = [
      { word: 'old', start: 2, end: 3 },
      { word: 'words', start: 3.2, end: 6 },
    ]

    expect(applyEditedText(original, 'new text')).toEqual([
      { word: 'new', start: 2, end: 3 },
      { word: 'text', start: 3.2, end: 6 },
    ])
  })
})
