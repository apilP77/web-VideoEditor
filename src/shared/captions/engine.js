import { findWordsForReview } from './reviewWords.js'

export const CAPTION_PACES = [
  { value: 1, label: '1 word per caption' },
  { value: 2, label: 'Up to 2 words per caption' },
  { value: 3, label: 'Up to 3 words per caption' },
  { value: 5, label: 'Up to 5 words per caption' },
  { value: 'sentence', label: 'Sentence · up to two lines' },
]

const SENTENCE_END = /[.!?…]["'”’)\]]*$/u
const MAX_SENTENCE_CHARACTERS = 84

function getWordText(word) {
  return String(word.word ?? '').trim()
}

function getCaption(words) {
  return {
    start: words[0].start,
    end: words[words.length - 1].end,
    words: words.map((word) => ({ ...word })),
    text: words.map(getWordText).join(' '),
  }
}

/**
 * Groups timed transcript words into captions for the selected reading pace.
 *
 * @param {Array<{word: string, start: number, end: number}>} words Timed words in source order.
 * @param {number | 'sentence'} pace Maximum words per caption or sentence mode.
 * @returns {Array<{start: number, end: number, words: Array<{word: string, start: number, end: number}>, text: string}>} Captions with preserved word timing.
 */
export function layoutCaptions(words, pace = 5) {
  const maximumWords = pace === 'sentence' ? Infinity : Number(pace)
  if (!Number.isFinite(maximumWords) && maximumWords !== Infinity) {
    throw new TypeError('Caption pace must be 1, 2, 3, 5, or sentence.')
  }
  if (![1, 2, 3, 5, Infinity].includes(maximumWords)) {
    throw new TypeError('Caption pace must be 1, 2, 3, 5, or sentence.')
  }

  const captions = []
  let current = []
  let currentCharacters = 0

  function flush() {
    if (current.length === 0) return
    captions.push(getCaption(current))
    current = []
    currentCharacters = 0
  }

  for (const word of words) {
    const text = getWordText(word)
    if (!text || !Number.isFinite(word.start) || !Number.isFinite(word.end)) continue
    const previous = current[current.length - 1]
    const wouldPause = previous && word.start - previous.end > 0.4
    const wouldOverflow =
      pace === 'sentence' &&
      current.length > 0 &&
      currentCharacters + text.length + 1 > MAX_SENTENCE_CHARACTERS

    if (
      current.length > 0 &&
      (wouldPause ||
        wouldOverflow ||
        (pace !== 'sentence' && current.length >= maximumWords) ||
        SENTENCE_END.test(getWordText(previous)))
    ) {
      flush()
    }

    current.push(word)
    currentCharacters += text.length + (current.length > 1 ? 1 : 0)
  }

  flush()
  return captions
}

/**
 * Returns the caption visible at a playback time.
 *
 * @param {Array<{start: number, end: number}>} captions Ordered captions.
 * @param {number} time Current playback time in seconds.
 * @returns {number} Active caption index, or -1 when none is active.
 */
export function getActiveCaption(captions, time) {
  if (!Number.isFinite(time)) return -1
  let low = 0
  let high = captions.length - 1

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const caption = captions[middle]
    if (time < caption.start) high = middle - 1
    else if (time > caption.end) low = middle + 1
    else return middle
  }
  return -1
}

/**
 * Returns the word visible within a caption at a playback time.
 *
 * @param {{words: Array<{start: number, end: number}>}} caption Timed caption.
 * @param {number} time Current playback time in seconds.
 * @returns {number} Active word index, or -1 when none is active.
 */
export function getActiveWordIndex(caption, time) {
  if (!Number.isFinite(time)) return -1
  return caption.words.findIndex(
    (word) => time >= word.start && time <= word.end,
  )
}

/**
 * Replaces caption text and evenly maps edited words onto its existing time range.
 *
 * @param {{start: number, end: number, words: Array<{word: string, start: number, end: number}>}} caption Caption being edited.
 * @param {string} newText New caption text.
 * @returns {{start: number, end: number, words: Array<{word: string, start: number, end: number}>, text: string}} Updated caption with proportional word timing.
 */
export function editCaptionText(caption, newText) {
  const tokens = String(newText).match(/\S+/gu) ?? []
  const duration = Math.max(0, caption.end - caption.start)
  const words = tokens.map((word, index) => ({
    word,
    start: caption.start + (duration * index) / Math.max(1, tokens.length),
    end: caption.start + (duration * (index + 1)) / Math.max(1, tokens.length),
  }))
  return { ...caption, words, text: tokens.join(' ') }
}

/**
 * Splits a caption at a word boundary.
 *
 * @param {{start: number, end: number, words: Array<{word: string, start: number, end: number}>}} caption Caption to split.
 * @param {number} splitAt Index of the first word in the second caption.
 * @returns {Array<object>} Two timed captions, or the original caption in an array when unsplittable.
 */
export function splitCaption(caption, splitAt = Math.ceil(caption.words.length / 2)) {
  if (!Number.isInteger(splitAt) || splitAt <= 0 || splitAt >= caption.words.length) {
    return [caption]
  }
  return [getCaption(caption.words.slice(0, splitAt)), getCaption(caption.words.slice(splitAt))]
}

/**
 * Merges a caption with the following caption.
 *
 * @param {Array<object>} captions Ordered captions.
 * @param {number} index Caption index to merge with its following neighbor.
 * @returns {Array<object>} New caption list.
 */
export function mergeCaptions(captions, index) {
  if (!Number.isInteger(index) || index < 0 || index >= captions.length - 1) {
    return captions
  }
  const words = [...captions[index].words, ...captions[index + 1].words]
  const merged = getCaption(words)
  merged.start = Math.min(captions[index].start, captions[index + 1].start)
  merged.end = Math.max(captions[index].end, captions[index + 1].end)
  return [
    ...captions.slice(0, index),
    merged,
    ...captions.slice(index + 2),
  ]
}

/**
 * Removes a caption at the requested index.
 *
 * @param {Array<object>} captions Ordered captions.
 * @param {number} index Caption index to remove.
 * @returns {Array<object>} New caption list.
 */
export function deleteCaption(captions, index) {
  if (!Number.isInteger(index) || index < 0 || index >= captions.length) return captions
  return captions.filter((_, captionIndex) => captionIndex !== index)
}

/**
 * Nudges a caption's start boundary without crossing its end.
 *
 * @param {object} caption Caption whose start is adjusted.
 * @param {number} delta Time adjustment in seconds.
 * @returns {object} Updated caption.
 */
export function nudgeCaptionStart(caption, delta) {
  const start = Math.max(0, Math.min(caption.end - 0.01, caption.start + delta))
  const words = caption.words.map((word, index) =>
    index === 0 ? { ...word, start: Math.min(word.end, start) } : word,
  )
  return { ...caption, start, words }
}

/**
 * Nudges a caption's end boundary without crossing its start.
 *
 * @param {object} caption Caption whose end is adjusted.
 * @param {number} delta Time adjustment in seconds.
 * @returns {object} Updated caption.
 */
export function nudgeCaptionEnd(caption, delta) {
  const end = Math.max(caption.start + 0.01, caption.end + delta)
  const words = caption.words.map((word, index) =>
    index === caption.words.length - 1
      ? { ...word, end: Math.max(word.start, end) }
      : word,
  )
  return { ...caption, end, words }
}

/**
 * Flags likely profanity and commonly misheard words without changing caption text.
 *
 * @param {Array<object>} captions Caption list to inspect.
 * @param {string | null} language Detected language.
 * @returns {Map<string, string>} Word-key to suggested review note.
 */
export function findCaptionReviewWords(captions, language) {
  const words = captions.flatMap((caption) => caption.words)
  return new Map(
    findWordsForReview(words, language).map((word) => [
      `${word.start}:${word.end}:${word.word}`,
      word.reason,
    ]),
  )
}
