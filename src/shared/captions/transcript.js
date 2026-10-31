function normalizeWord(word) {
  return String(word)
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/**
 * Merges timestamped transcription chunks, removing duplicated overlap words.
 *
 * @param {Array<{start: number, end: number, words: Array<{word: string, start: number, end: number}>}>} chunks Chunks with local word timestamps.
 * @returns {Array<{word: string, start: number, end: number}>} Ordered words with source-relative timestamps.
 */
export function stitchChunks(chunks) {
  const candidates = chunks.flatMap((chunk, chunkIndex) => {
    const center = (chunk.start + chunk.end) / 2
    const duration = Math.max(0.001, chunk.end - chunk.start)

    return chunk.words
      .filter(
        (word) =>
          typeof word.word === 'string' &&
          Number.isFinite(word.start) &&
          Number.isFinite(word.end),
      )
      .map((word) => ({
        word: word.word.trim(),
        start: Math.max(0, chunk.start + word.start),
        end: Math.max(0, chunk.start + word.end),
        chunkIndex,
        centerDistance:
          Math.abs(chunk.start + (word.start + word.end) / 2 - center) / duration,
        normalized: normalizeWord(word.word),
      }))
  })

  candidates.sort((left, right) => left.start - right.start || left.end - right.end)
  const stitched = []
  const recentByWord = new Map()
  for (const candidate of candidates) {
    if (!candidate.word) continue
    const recent = candidate.normalized
      ? recentByWord.get(candidate.normalized) ?? []
      : []
    let duplicate = null
    let closestDistance = Infinity

    for (const previous of recent) {
      const midpointDistance = Math.abs(
        (previous.start + previous.end - candidate.start - candidate.end) / 2,
      )
      if (
        previous.chunkIndex !== candidate.chunkIndex &&
        midpointDistance <= 0.75 &&
        midpointDistance < closestDistance
      ) {
        duplicate = previous
        closestDistance = midpointDistance
      }
    }

    if (!duplicate) {
      candidate.outputIndex = stitched.length
      stitched.push(candidate)
    } else {
      candidate.outputIndex = duplicate.outputIndex
      if (candidate.centerDistance < stitched[duplicate.outputIndex].centerDistance) {
        stitched[duplicate.outputIndex] = candidate
      }
    }

    if (candidate.normalized && !duplicate) {
      const nextRecent = recent.filter(
        (word) =>
          Math.abs(
            (word.start + word.end - candidate.start - candidate.end) / 2,
          ) <= 0.75,
      )
      nextRecent.push(candidate)
      recentByWord.set(candidate.normalized, nextRecent)
    }
  }

  return stitched
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .map(({ word, start, end }) => ({ word, start, end }))
}

/**
 * Groups timestamped words into readable subtitle segments.
 *
 * @param {Array<{word: string, start: number, end: number}>} words Timed words.
 * @param {{maxCharacters?: number, pauseSeconds?: number}} options Segment limits.
 * @returns {Array<{text: string, start: number, end: number}>} Subtitle segments.
 */
export function groupWordsIntoSegments(
  words,
  { maxCharacters = 42, pauseSeconds = 0.8 } = {},
) {
  const segments = []
  let currentWords = []
  let currentText = ''

  function flush() {
    if (currentWords.length === 0) return
    segments.push({
      text: currentText,
      start: currentWords[0].start,
      end: currentWords[currentWords.length - 1].end,
    })
    currentWords = []
    currentText = ''
  }

  for (const word of words) {
    const text = String(word.word ?? '').trim()
    if (!text || !Number.isFinite(word.start) || !Number.isFinite(word.end)) continue

    const previous = currentWords[currentWords.length - 1]
    const nextText = currentText ? `${currentText} ${text}` : text
    if (
      currentWords.length > 0 &&
      (word.start - previous.end > pauseSeconds ||
        nextText.length > maxCharacters ||
        /[.!?…]["'”’)\]]*$/u.test(previous.word.trim()))
    ) {
      flush()
    }

    currentWords.push(word)
    currentText = currentText ? `${currentText} ${text}` : text
  }

  flush()
  return segments
}

/**
 * Formats seconds as an SRT or WebVTT timestamp.
 *
 * @param {number} seconds Time in seconds.
 * @param {'.' | ','} decimalSeparator Timestamp decimal separator.
 * @returns {string} Formatted timestamp.
 */
export function formatTimestamp(seconds, decimalSeparator = ',') {
  const milliseconds = Number.isFinite(seconds)
    ? Math.max(0, Math.round(seconds * 1000))
    : 0
  const hours = Math.floor(milliseconds / 3_600_000)
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000)
  const wholeSeconds = Math.floor((milliseconds % 60_000) / 1000)
  const remainder = milliseconds % 1000

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}${decimalSeparator}${String(remainder).padStart(3, '0')}`
}

/**
 * Converts timed words to SubRip subtitle text.
 *
 * @param {Array<{word: string, start: number, end: number}>} words Timed words.
 * @returns {string} SRT document.
 */
export function toSRT(words) {
  return groupWordsIntoSegments(words)
    .map(
      (segment, index) =>
        `${index + 1}\n${formatTimestamp(segment.start)} --> ${formatTimestamp(segment.end)}\n${segment.text}`,
    )
    .join('\n\n')
}

/**
 * Converts timed words to WebVTT subtitle text.
 *
 * @param {Array<{word: string, start: number, end: number}>} words Timed words.
 * @returns {string} WebVTT document.
 */
export function toVTT(words) {
  const segments = groupWordsIntoSegments(words)
  if (segments.length === 0) return 'WEBVTT'

  return `WEBVTT\n\n${segments
    .map(
      (segment) =>
        `${formatTimestamp(segment.start, '.')} --> ${formatTimestamp(segment.end, '.')}\n${segment.text}`,
    )
    .join('\n\n')}`
}

/**
 * Converts timed words into readable plain text, optionally prefixing timestamps.
 *
 * @param {Array<{word: string, start: number, end: number}>} words Timed words.
 * @param {{includeTimestamps?: boolean}} options Include segment start times.
 * @returns {string} Plain-text transcript.
 */
export function toPlainText(words, { includeTimestamps = false } = {}) {
  return groupWordsIntoSegments(words)
    .map((segment) =>
      includeTimestamps
        ? `[${formatTimestamp(segment.start, '.')}] ${segment.text}`
        : segment.text,
    )
    .join('\n')
}

/**
 * Applies edited transcript text to the original word timing range.
 *
 * @param {Array<{word: string, start: number, end: number}>} words Original timed words.
 * @param {string} text Edited transcript text.
 * @returns {Array<{word: string, start: number, end: number}>} Edited tokens mapped to the original time span.
 */
export function applyEditedText(words, text) {
  const tokens = String(text).match(/\S+/gu) ?? []
  if (tokens.length === 0 || words.length === 0) return []
  if (tokens.length === words.length) {
    return tokens.map((word, index) => ({ ...words[index], word }))
  }

  const firstStart = words[0].start
  const lastEnd = words[words.length - 1].end
  const totalDuration = Math.max(0, lastEnd - firstStart)

  return tokens.map((word, index) => {
    const start = firstStart + (totalDuration * index) / tokens.length
    const end = firstStart + (totalDuration * (index + 1)) / tokens.length
    return { word, start, end }
  })
}
