import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'
import { inspectMediaInfo } from '../ffmpeg/ffmpegClient.js'

const UNKNOWN_MEDIA_INFO = Object.freeze({
  width: 0,
  height: 0,
  duration: 0,
  hasVideo: false,
  hasAudio: 'unknown',
})

function mediaInfoFromFFmpegLog(log) {
  const durationMatch = log.match(
    /Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/,
  )
  const videoLine = log.match(/^.*Stream #\S+.*Video:.*$/m)?.[0]
  const audioLine = /^.*Stream #\S+.*Audio:.*$/m.test(log)
  const dimensions = videoLine?.match(/\b(\d{2,5})x(\d{2,5})\b/)

  if (!durationMatch && !videoLine && !audioLine) {
    throw new Error('FFmpeg did not report recognizable media streams.')
  }

  const duration = durationMatch
    ? Number(durationMatch[1]) * 3600 +
      Number(durationMatch[2]) * 60 +
      Number(durationMatch[3])
    : 0

  return {
    width: dimensions ? Number(dimensions[1]) : 0,
    height: dimensions ? Number(dimensions[2]) : 0,
    duration,
    hasVideo: Boolean(videoLine),
    hasAudio: audioLine,
  }
}

/**
 * Reads local media metadata, preferring Mediabunny and falling back to FFmpeg.
 *
 * @param {File} file Local media file to inspect.
 * @returns {Promise<{width: number, height: number, duration: number, hasVideo: boolean, hasAudio: boolean | 'unknown'}>} Media dimensions, duration, and track availability.
 */
export async function getMediaInfo(file) {
  let input
  try {
    input = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS,
    })

    const [videoTracks, audioTracks, duration] = await Promise.all([
      input.getVideoTracks(),
      input.getAudioTracks(),
      input.computeDuration(),
    ])
    const primaryVideoTrack = await input.getPrimaryVideoTrack()
    const width = primaryVideoTrack
      ? await primaryVideoTrack.getDisplayWidth()
      : 0
    const height = primaryVideoTrack
      ? await primaryVideoTrack.getDisplayHeight()
      : 0

    return {
      width,
      height,
      duration,
      hasVideo: videoTracks.length > 0,
      hasAudio: audioTracks.length > 0,
    }
  } catch (error) {
    console.error('Mediabunny media-info inspection failed.', error)
  } finally {
    input?.dispose()
  }

  try {
    return mediaInfoFromFFmpegLog(await inspectMediaInfo(file))
  } catch (error) {
    console.error('FFmpeg media-info fallback failed.', error)
    return { ...UNKNOWN_MEDIA_INFO }
  }
}
