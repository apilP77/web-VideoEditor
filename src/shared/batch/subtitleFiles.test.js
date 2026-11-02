import { describe, expect, it } from 'vitest'
import { buildAllSubtitleFiles, buildSubtitleFile } from './subtitleFiles.js'

const captions = [
  { words: [{ word: 'Hello', start: 0, end: 0.5 }, { word: 'there', start: 0.5, end: 1 }] },
  { words: [{ word: 'friend.', start: 1.2, end: 1.8 }] },
]

describe('buildSubtitleFile', () => {
  it('builds named SRT, VTT and TXT text', () => {
    const srt = buildSubtitleFile('My clip.mp4', captions, 'srt')
    expect(srt.name).toBe('My clip-captions.srt')
    expect(srt.data).toContain('-->')
    expect(srt.data).toContain('Hello')
    expect(buildSubtitleFile('a.mp4', captions, 'vtt').data.startsWith('WEBVTT')).toBe(true)
    expect(buildSubtitleFile('a.mp4', captions, 'txt').data).toContain('friend.')
  })

  it('rejects unknown formats', () => {
    expect(() => buildSubtitleFile('a.mp4', captions, 'doc')).toThrow(TypeError)
  })
})

describe('buildAllSubtitleFiles', () => {
  it('makes three files per finished video and skips the rest', () => {
    const files = buildAllSubtitleFiles([
      { name: 'a.mp4', result: { captions } },
      { name: 'b.mp4', result: null },
      { name: 'c.mp4', result: { captions } },
    ])
    expect(files.map((file) => file.name)).toEqual([
      'a-captions.srt', 'a-captions.vtt', 'a-captions.txt',
      'c-captions.srt', 'c-captions.vtt', 'c-captions.txt',
    ])
  })
})
