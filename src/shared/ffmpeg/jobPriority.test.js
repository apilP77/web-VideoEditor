import { describe, expect, it } from 'vitest'
import { getJobsToPreempt, isPreemptibleJob } from './jobPriority.js'

describe('getJobsToPreempt', () => {
  const pending = new Map([
    [1, { type: 'previewProxy' }],
    [2, { type: 'changeSpeed' }],
    [3, { type: 'previewProxy', preempted: true }],
  ])

  it('pauses running preview copies for audio extraction and exports', () => {
    expect(getJobsToPreempt(pending, 'extractAudio')).toEqual([1])
    expect(getJobsToPreempt(pending, 'trimAndCrop')).toEqual([1])
    expect(getJobsToPreempt(pending, 'inspectMediaInfo')).toEqual([1])
  })

  it('never pauses anything for another preview copy', () => {
    expect(getJobsToPreempt(pending, 'previewProxy')).toEqual([])
  })

  it('never pauses exports', () => {
    expect(getJobsToPreempt(new Map([[4, { type: 'crop' }]]), 'extractAudio')).toEqual([])
    expect(isPreemptibleJob('changeSpeed')).toBe(false)
  })
})
