import { describe, expect, it } from 'vitest'
import { findWordsForReview } from './reviewWords.js'

describe('findWordsForReview', () => {
  it('flags potential profanity and commonly confused English spellings', () => {
    expect(
      findWordsForReview(
        [
          { word: 'damn,', start: 0, end: 0.3 },
          { word: 'you’re', start: 0.4, end: 0.7 },
          { word: 'ordinary', start: 0.8, end: 1.2 },
        ],
        'english',
      ),
    ).toEqual([
      { word: 'damn,', start: 0, end: 0.3, reason: 'Potentially profane' },
      {
        word: 'you’re',
        start: 0.4,
        end: 0.7,
        reason: 'Often-misheard spelling; check your/you’re',
      },
    ])
  })

  it('does not apply the English word list to other languages', () => {
    expect(
      findWordsForReview(
        [{ word: 'damn', start: 0, end: 1 }],
        'spanish',
      ),
    ).toEqual([])
  })
})
