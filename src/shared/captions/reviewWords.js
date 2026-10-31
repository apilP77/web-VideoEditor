const ENGLISH_REVIEW_WORDS = new Map([
  ['damn', 'Potentially profane'],
  ['hell', 'Potentially profane'],
  ['shit', 'Potentially profane'],
  ['fuck', 'Potentially profane'],
  ['fucking', 'Potentially profane'],
  ['bitch', 'Potentially profane'],
  ['asshole', 'Potentially profane'],
  ['their', 'Often-misheard spelling; check their/there/they’re'],
  ['there', 'Often-misheard spelling; check their/there/they’re'],
  ["they're", 'Often-misheard spelling; check their/there/they’re'],
  ['your', 'Often-misheard spelling; check your/you’re'],
  ["you're", 'Often-misheard spelling; check your/you’re'],
  ['its', 'Often-misheard spelling; check its/it’s'],
  ["it's", 'Often-misheard spelling; check its/it’s'],
  ['then', 'Often-misheard spelling; check then/than'],
  ['than', 'Often-misheard spelling; check then/than'],
  ['affect', 'Often-misheard spelling; check affect/effect'],
  ['effect', 'Often-misheard spelling; check affect/effect'],
])

/**
 * Marks English words that may deserve a spelling, context, or profanity review.
 *
 * @param {Array<{word: string, start: number, end: number}>} words Timed transcript words.
 * @param {string | null} language Detected or selected language.
 * @returns {Array<{word: string, start: number, end: number, reason: string}>} Review candidates.
 */
export function findWordsForReview(words, language) {
  if (!['en', 'english'].includes(String(language ?? '').toLowerCase())) return []

  return words.flatMap((word) => {
    const normalized = word.word
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[’‘]/gu, "'")
      .replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')
    const reason = ENGLISH_REVIEW_WORDS.get(normalized)
    return reason ? [{ ...word, reason }] : []
  })
}
