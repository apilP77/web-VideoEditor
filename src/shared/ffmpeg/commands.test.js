import { describe, expect, it } from 'vitest'
import {
  buildAtempoChain,
  buildCropArgs,
  buildExtractAudioArgs,
  buildPreviewProxyArgs,
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

  it.each([
    [4, 'atempo=2.0,atempo=2.0'],
    [0.25, 'atempo=0.5,atempo=0.5'],
    [3, 'atempo=2.0,atempo=1.5'],
    [0.75, 'atempo=0.75'],
  ])('chains audio tempo stages for %sx speed', (factor, expected) => {
    expect(buildAtempoChain(factor)).toBe(expected)
  })

  it('includes audio settings when the input has audio', () => {
    const args = buildSpeedArgs('input.mp4', 'output.mp4', 2, { hasAudio: true })

    expect(args).toContain('-map')
    expect(args).toContain('0:a:0')
    expect(args).toContain('-filter:a')
    expect(args).toContain('-c:a')
    expect(args).toContain('-b:a')
  })

  it('omits audio settings when audio is removed', () => {
    const args = buildSpeedArgs('input.mp4', 'output.mp4', 2, {
      hasAudio: true,
      removeAudio: true,
    })

    expect(args.join(' ')).not.toMatch(/(?:-map 0:a|-filter:a|-c:a|-b:a)/)
  })

  it('omits audio settings when the input has no audio', () => {
    const args = buildSpeedArgs('input.mp4', 'output.mp4', 2, { hasAudio: false })

    expect(args.join(' ')).not.toMatch(/(?:-map 0:a|-filter:a|-c:a|-b:a)/)
  })

  it('keeps audio options optional when audio availability is unknown', () => {
    const args = buildSpeedArgs('input.mp4', 'output.mp4', 2, {
      hasAudio: 'unknown',
    })

    expect(args).toContain('0:a?')
    expect(args).toContain('-filter:a')
    expect(args).toContain('-c:a')
    expect(args).toContain('-b:a')
  })

  it('changes audio pitch when natural pitch is disabled', () => {
    const args = buildSpeedArgs('input.mp4', 'output.mp4', 2, {
      hasAudio: true,
      keepAudioPitchNatural: false,
    })

    expect(args).toContain('aresample=44100,asetrate=88200,aresample=44100')
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

describe('buildPreviewProxyArgs', () => {
  it('scales portrait and landscape inputs to a 960px long edge', () => {
    expect(buildPreviewProxyArgs('in.mp4', 'out.mp4', 2160, 3840)).toContain(
      'scale=-2:960',
    )
    expect(buildPreviewProxyArgs('in.mp4', 'out.mp4', 3840, 2160)).toContain(
      'scale=960:-2',
    )
    expect(buildPreviewProxyArgs('in.mp4', 'out.mp4', 2160, 3840)).toEqual([
      '-i', 'in.mp4',
      '-vf', 'scale=-2:960',
      '-r', '24',
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '32',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-movflags', '+faststart',
      'out.mp4',
    ])
  })
})
