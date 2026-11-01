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
const PAUSE_SECONDS = 0.4

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
 * Splits words into `count` consecutive chunks of near-equal size, measured
 * in words, or in characters when `byCharacters` is set.
 */
function splitEvenly(phrase, lengths, count, byCharacters) {
  if (!byCharacters) {
    const chunks = []
    let index = 0
    for (let chunk = 0; chunk < count; chunk += 1) {
      const size = Math.ceil((phrase.length - index) / (count - chunk))
      chunks.push(phrase.slice(index, index + size))
      index += size
    }
    return chunks
  }

  const total = lengths.reduce((sum, length) => sum + length + 1, -1)
  const chunks = Array.from({ length: count }, () => [])
  let offset = 0
  for (const [index, word] of phrase.entries()) {
    const center = offset + lengths[index] / 2
    chunks[Math.min(count - 1, Math.floor((center / total) * count))].push(word)
    offset += lengths[index] + 1
  }
  return chunks.filter((chunk) => chunk.length > 0)
}

/**
 * Splits a phrase into the fewest evenly sized chunks that respect the
 * limits, so a caption is never left holding one stranded word.
 *
 * @param {Array<{word: string}>} phrase Words between natural breaks.
 * @param {number} maximumWords Word limit per chunk, or Infinity.
 * @param {number} maximumCharacters Character limit per chunk, or Infinity.
 * @returns {Array<Array<{word: string}>>} Balanced chunks in order.
 */
function balancePhrase(phrase, maximumWords, maximumCharacters) {
  const lengths = phrase.map((word) => getWordText(word).length)
  const byCharacters = Number.isFinite(maximumCharacters)
  const fits = (chunk) =>
    chunk.length <= maximumWords &&
    (chunk.length === 1 ||
      chunk.reduce((sum, word) => sum + getWordText(word).length + 1, -1) <=
        maximumCharacters)

  for (
    let count = Math.max(1, Math.ceil(phrase.length / maximumWords));
    count < phrase.length;
    count += 1
  ) {
    const chunks = splitEvenly(phrase, lengths, count, byCharacters)
    if (chunks.every(fits)) return chunks
  }
  return phrase.map((word) => [word])
}

/**
 * Groups timed transcript words into captions for the selected reading pace.
 *
 * Words are first split into phrases at pauses and sentence ends, then each
 * phrase is divided into evenly sized captions within the pace limit.
 *
 * @param {Array<{word: string, start: number, end: number}>} words Timed words in source order.
 * @param {number | 'sentence'} pace Maximum words per caption or sentence mode.
 * @returns {Array<{start: number, end: number, words: Array<{word: string, start: number, end: number}>, text: string}>} Captions with preserved word timing.
 */
export function layoutCaptions(words, pace = 5) {
  const maximumWords = pace === 'sentence' ? Infinity : Number(pace)
  if (![1, 2, 3, 5, Infinity].includes(maximumWords)) {
    throw new TypeError('Caption pace must be 1, 2, 3, 5, or sentence.')
  }
  const maximumCharacters = pace === 'sentence' ? MAX_SENTENCE_CHARACTERS : Infinity

  const phrases = []
  let current = []
  for (const word of words) {
    const text = getWordText(word)
    if (!text || !Number.isFinite(word.start) || !Number.isFinite(word.end)) continue
    const previous = current[current.length - 1]
    if (
      previous &&
      (word.start - previous.end > PAUSE_SECONDS ||
        SENTENCE_END.test(getWordText(previous)))
    ) {
      phrases.push(current)
      current = []
    }
    current.push(word)
  }
  if (current.length > 0) phrases.push(current)

  return phrases.flatMap((phrase) =>
    balancePhrase(phrase, maximumWords, maximumCharacters).map(getCaption),
  )
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
