import { describe, expect, it } from 'vitest'
import { getLostVideoReason } from './conversionCheck.js'

const video = { isVideoTrack: () => true }
const audio = { isVideoTrack: () => false }

describe('getLostVideoReason', () => {
  it('is empty when the video track is converted', () => {
    expect(getLostVideoReason({ isValid: true, utilizedTracks: [video, audio], discardedTracks: [] })).toBe('')
  })

  it('reports a video the browser cannot decode even though the audio makes it valid', () => {
    const conversion = {
      isValid: true,
      utilizedTracks: [audio],
      discardedTracks: [{ track: video, reason: 'undecodable_source_codec' }],
    }
    expect(getLostVideoReason(conversion)).toBe('undecodable_source_codec')
  })

  it('reports every reason when nothing can be converted', () => {
    const conversion = {
      isValid: false,
      utilizedTracks: [],
      discardedTracks: [
        { track: video, reason: 'unknown_source_codec' },
        { track: audio, reason: 'no_encodable_target_codec' },
      ],
    }
    expect(getLostVideoReason(conversion)).toBe('unknown_source_codec')
  })

  it('gives a plain reason when no track was listed', () => {
    expect(getLostVideoReason({ isValid: false, utilizedTracks: [], discardedTracks: [] })).toBe(
      'no video track could be converted',
    )
  })
})
