import { describe, expect, it } from 'vitest'
import { chooseAudioDecodePath } from './audioPath.js'

describe('chooseAudioDecodePath', () => {
  it('uses FFmpeg for videos so the video track is never decoded', () => {
    expect(
      chooseAudioDecodePath(
        new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
      ),
    ).toBe('ffmpeg')
    expect(
      chooseAudioDecodePath(
        new File(['video'], 'misnamed.wav', { type: 'video/mp4' }),
      ),
    ).toBe('ffmpeg')
  })

  it('uses browser decoding for small audio-only files', () => {
    expect(
      chooseAudioDecodePath(
        new File(['audio'], 'voice.wav', { type: 'audio/wav' }),
      ),
    ).toBe('browser')
  })

  it('uses FFmpeg for audio-only files larger than the browser fast path', () => {
    const file = new File([], 'long-audio.wav', { type: 'audio/wav' })
    Object.defineProperty(file, 'size', { value: 100 * 1024 * 1024 + 1 })

    expect(chooseAudioDecodePath(file)).toBe('ffmpeg')
  })
})
