import { describe, expect, it } from 'vitest'
import {
  buildCropArgs,
  buildExtractAudioArgs,
  buildSpeedArgs,
  buildTrimArgs,
  buildTrimCropArgs,
} from './commands.js'

describe('buildTrimArgs', () => {
  it('uses fast stream copy with input seeking by default', () => {
    expect(buildTrimArgs('input.mp4', 'output.mp4', 1.25, 4)).toEqual([
      '-ss', '1.25',
      '-i', 'input.mp4',
      '-t', '2.75',
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c', 'copy',
      '-movflags', '+faststart',
      'output.mp4',
    ])
  })

  it('re-encodes an exact trim using the fast H.264 preset', () => {
    const args = buildTrimArgs('input.mp4', 'output.mp4', 1.25, 4, {
      exact: true,
    })

    expect(args).toContain('-ss')
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'))
    expect(args).toContain('-preset')
    expect(args).toContain('ultrafast')
    expect(args).toContain('-crf')
    expect(args).toContain('28')
    expect(args).toContain('-pix_fmt')
    expect(args).toContain('yuv420p')
    expect(args).not.toContain('copy')
  })

  it('rejects invalid time ranges', () => {
    expect(() => buildTrimArgs('in.mp4', 'out.mp4', 5, 5)).toThrow(
      'End time must be greater than start time.',
    )
  })
})

describe('crop argument builders', () => {
  it('rounds crop coordinates and sizes to even numbers and clamps to the video', () => {
    const args = buildCropArgs(
      'input.mp4',
      'output.mp4',
      { w: 101, h: 99, x: 15, y: 17 },
      { width: 100, height: 80 },
    )

    expect(args).toContain('crop=86:64:14:16')
  })

  it('builds trim and crop in one command', () => {
    const args = buildTrimCropArgs(
      'input.mp4',
      'output.mp4',
      2,
      7,
      { w: 200, h: 100, x: 20, y: 10 },
      { width: 640, height: 480 },
    )

    expect(args).toContain('crop=200:100:20:10')
    expect(args).toContain('-ss')
    expect(args).toContain('-t')
    expect(args.filter((argument) => argument === '-i')).toHaveLength(1)
  })
})

describe('buildSpeedArgs', () => {
  it.each([
    [4, 'atempo=2.0,atempo=2.0'],
    [0.25, 'atempo=0.5,atempo=0.5'],
    [1.5, 'atempo=1.5'],
  ])('builds a pitch-preserving audio filter for %sx speed', (factor, filter) => {
    const args = buildSpeedArgs('input.mp4', 'output.mp4', factor)

    expect(args).toContain(`setpts=PTS/${factor}`)
    expect(args).toContain(filter)
  })

  it('rejects a non-positive speed factor', () => {
    expect(() => buildSpeedArgs('in.mp4', 'out.mp4', 0)).toThrow(
      'Speed factor must be a positive finite number.',
    )
  })
})

describe('buildExtractAudioArgs', () => {
  it('builds mono 16 kHz PCM WAV output', () => {
    expect(buildExtractAudioArgs('input.mp4', 'output.wav')).toEqual([
      '-i', 'input.mp4',
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      '-c:a', 'pcm_s16le',
      'output.wav',
    ])
  })
})
