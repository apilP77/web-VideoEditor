import { useEffect, useRef, useState } from 'react'
import { createPreviewProxy } from './createPreviewProxy.js'
import { getMediaInfo } from './mediaInfo.js'
import { inspectVideoFrame } from './previewFrame.js'
import { shouldCreatePreviewProxy } from './previewProxy.js'
import { useObjectUrl } from './useObjectUrl.js'
import { getMonotonicTime } from '../utils/timing.js'
import { debugLog } from '../utils/debugLog.js'

const FRAME_TIMEOUT_MS = 4000
const IDLE_CONVERSION = Object.freeze({
  source: null,
  status: 'idle',
  progress: null,
  startedAt: 0,
  updatedAt: 0,
  error: '',
  details: '',
})

export const PREVIEW_UNAVAILABLE_MESSAGE =
  "This browser can't show this video's picture. This is common with HEVC (H.265) videos from phones."

/**
 * Keeps a video preview honest: checks that the browser really draws the
 * picture, and builds a small 960px H.264 preview copy when it does not, or
 * when the source is larger than about 2K.
 *
 * Attach `videoHandlers` to the <video> element and play `previewUrl`. The
 * original file is always kept for processing; the copy is only for preview.
 *
 * @param {{file: File | null, videoRef: import('react').RefObject<HTMLVideoElement | null>, waitBeforeFFmpeg?: () => Promise<unknown>, proxyLargeSources?: boolean}} options
 *   Source file, the preview video element, optional higher-priority FFmpeg
 *   work to let finish before an FFmpeg preview encode starts, and whether a
 *   decodable but large (over about 2K) source also gets a lighter copy.
 * @returns {{
 *   sourceUrl: string,
 *   previewUrl: string,
 *   previewFile: File | null,
 *   usingProxy: boolean,
 *   sourceInfo: {width: number, height: number, duration: number, codec: string | null} | null,
 *   frameAvailable: boolean | null,
 *   status: 'checking' | 'ready' | 'converting' | 'proxy' | 'unavailable' | 'failed',
 *   showPoster: boolean,
 *   progress: number | null,
 *   conversionStartedAt: number,
 *   progressUpdatedAt: number,
 *   message: string,
 *   technicalDetails: string,
 *   cancelConversion: () => void,
 *   videoHandlers: Record<string, (event: Event) => void>,
 * }} Preview state and handlers.
 */
export function usePreviewFallback({ file, videoRef, waitBeforeFFmpeg, proxyLargeSources = true }) {
  const sourceUrl = useObjectUrl(file)
  // State is tagged with the file it belongs to, so changing files never
  // shows stale results and nothing needs resetting inside an effect.
  const [info, setInfo] = useState({ source: null, value: null })
  const [frame, setFrame] = useState({ source: null, available: null, details: '' })
  const [proxy, setProxy] = useState({ source: null, file: null })
  const [conversion, setConversion] = useState(IDLE_CONVERSION)

  const requestedRef = useRef(null)
  const abortRef = useRef(null)
  const timerRef = useRef(null)
  const availableForRef = useRef(null)
  const blackRetryForRef = useRef(null)
  // Where playback was when the preview copy replaced the original, so the
  // swap does not jump back to the start.
  const resumeRef = useRef(null)
  const waitRef = useRef(waitBeforeFFmpeg)
  const proxyLargeRef = useRef(proxyLargeSources)

  useEffect(() => {
    waitRef.current = waitBeforeFFmpeg
    proxyLargeRef.current = proxyLargeSources
  }, [waitBeforeFFmpeg, proxyLargeSources])

  const sourceInfo = info.source === file ? info.value : null
  const proxyFile = proxy.source === file ? proxy.file : null
  const proxyUrl = useObjectUrl(proxyFile)
  const frameAvailable = frame.source === file ? frame.available : null
  const activeConversion = conversion.source === file ? conversion : IDLE_CONVERSION

  async function requestProxy(sourceFile, { preferFFmpeg, reason, knownInfo }) {
    if (!sourceFile || requestedRef.current === sourceFile) return
    requestedRef.current = sourceFile
    const controller = new AbortController()
    abortRef.current = controller
    debugLog('preview', `making preview copy (${reason})`, { preferFFmpeg })
    setConversion({
      ...IDLE_CONVERSION,
      source: sourceFile,
      status: 'converting',
      startedAt: getMonotonicTime(),
    })

    try {
      let details = knownInfo ?? sourceInfo
      if (!(details?.width > 0 && details?.height > 0)) details = await getMediaInfo(sourceFile)
      if (!(details?.width > 0 && details?.height > 0)) {
        throw new Error('The video dimensions could not be read.')
      }
      const output = await createPreviewProxy(sourceFile, {
        width: details.width,
        height: details.height,
        signal: controller.signal,
        preferFFmpeg,
        waitBeforeFFmpeg: () => waitRef.current?.() ?? Promise.resolve(),
        onProgress: (percent) => {
          if (controller.signal.aborted) return
          setConversion((current) =>
            current.source === sourceFile
              ? {
                  ...current,
                  progress: Number.isFinite(percent) ? percent : null,
                  updatedAt: getMonotonicTime(),
                }
              : current,
          )
        },
      })
      if (controller.signal.aborted) return
      const video = videoRef.current
      resumeRef.current = video
        ? { time: video.currentTime || 0, playing: !video.paused && !video.ended }
        : null
      setProxy({
        source: sourceFile,
        file: new File([output.blob], output.filename, {
          type: 'video/mp4',
          lastModified: Date.now(),
        }),
      })
      setConversion((current) =>
        current.source === sourceFile ? { ...current, status: 'done', progress: 100 } : current,
      )
      debugLog('preview', 'preview copy ready', { MB: (output.blob.size / 1048576).toFixed(1) })
    } catch (error) {
      if (error?.name === 'AbortError' || controller.signal.aborted) {
        if (requestedRef.current === sourceFile) requestedRef.current = null
        setConversion((current) => (current.source === sourceFile ? IDLE_CONVERSION : current))
        return
      }
      console.error('Could not create a preview copy.', error)
      setConversion((current) =>
        current.source === sourceFile
          ? {
              ...current,
              status: 'failed',
              error:
                error instanceof Error && error.message
                  ? error.message
                  : PREVIEW_UNAVAILABLE_MESSAGE,
              details: error?.technicalDetails ?? (error instanceof Error ? error.stack ?? '' : ''),
            }
          : current,
      )
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  function markUnavailable(sourceFile, reason, details = {}) {
    if (!sourceFile || availableForRef.current === sourceFile) return
    window.clearTimeout(timerRef.current)
    debugLog('preview', `picture unavailable: ${reason}`, details)
    setFrame({
      source: sourceFile,
      available: false,
      details: `Reason: ${reason}\n${JSON.stringify(details, null, 2)}`,
    })
    void requestProxy(sourceFile, { preferFFmpeg: true, reason })
  }

  function checkFrame(video, sourceFile) {
    if (availableForRef.current === sourceFile) return
    const result = inspectVideoFrame(video)
    if (result === 'visible') {
      availableForRef.current = sourceFile
      window.clearTimeout(timerRef.current)
      setFrame({ source: sourceFile, available: true, details: '' })
      if (video.currentTime > 0.5 && video.paused) video.currentTime = 0.01
      return
    }
    if (result === 'black') {
      // Many videos open on a black frame; look once further in before
      // deciding the picture cannot be decoded.
      if (blackRetryForRef.current !== sourceFile && video.duration > 1) {
        blackRetryForRef.current = sourceFile
        video.currentTime = Math.min(2, video.duration * 0.25)
        return
      }
      markUnavailable(sourceFile, 'black frame', { readyState: video.readyState })
    }
  }

  const isSourceEvent = (video) =>
    Boolean(sourceUrl) && (video.currentSrc || video.getAttribute('src')) === sourceUrl

  // Read the file's own metadata (codec, size) for this file.
  useEffect(() => {
    if (!file) return undefined
    let active = true
    getMediaInfo(file).then((value) => {
      if (!active) return
      setInfo({ source: file, value })
      debugLog('preview', 'source info', value)
      if (
        proxyLargeRef.current &&
        shouldCreatePreviewProxy({ width: value.width, height: value.height })
      ) {
        void requestProxy(file, { preferFFmpeg: false, reason: 'large source', knownInfo: value })
      }
    })
    return () => {
      active = false
    }
    // requestProxy only uses refs, setters and the file it is given, so it is
    // safe to leave out of the dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  // If no picture shows up in time, treat it as undecodable.
  useEffect(() => {
    if (!file || !sourceUrl) return undefined
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      const video = videoRef.current
      markUnavailable(file, 'no frame within 4 seconds', {
        readyState: video?.readyState,
        videoWidth: video?.videoWidth,
        errorCode: video?.error?.code ?? null,
      })
    }, FRAME_TIMEOUT_MS)
    return () => window.clearTimeout(timerRef.current)
    // Restart the wait only for a new file; markUnavailable and the ref are
    // safe to read from the latest render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, sourceUrl])

  // Stop a running conversion when the file changes or the page closes.
  useEffect(() => () => abortRef.current?.abort(), [file])

  const videoHandlers = {
    onLoadedMetadata(event) {
      const video = event.currentTarget
      const src = video.currentSrc || video.getAttribute('src')
      if (proxyUrl && src === proxyUrl && resumeRef.current) {
        const { time, playing } = resumeRef.current
        resumeRef.current = null
        if (time > 0 && Number.isFinite(video.duration)) {
          video.currentTime = Math.min(time, Math.max(0, video.duration - 0.05))
        }
        if (playing) video.play().catch(() => {})
        return
      }
      if (!isSourceEvent(video)) return
      if (video.videoWidth < 2 || video.videoHeight < 2) {
        markUnavailable(file, 'no picture dimensions', { videoWidth: video.videoWidth })
        return
      }
      if (video.currentTime === 0 && video.duration > 0) {
        video.currentTime = Math.min(0.01, video.duration / 2)
      }
      if (typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(() => {
          if (isSourceEvent(video)) checkFrame(video, file)
        })
      }
    },
    onLoadedData(event) {
      if (isSourceEvent(event.currentTarget)) checkFrame(event.currentTarget, file)
    },
    onSeeked(event) {
      if (isSourceEvent(event.currentTarget)) checkFrame(event.currentTarget, file)
    },
    onError(event) {
      const video = event.currentTarget
      const src = video.currentSrc || video.getAttribute('src')
      if (src === sourceUrl) {
        markUnavailable(file, 'video error', {
          code: video.error?.code ?? null,
          message: video.error?.message ?? '',
        })
      } else if (proxyUrl && src === proxyUrl) {
        setConversion((current) =>
          current.source === file
            ? { ...current, status: 'failed', error: 'The preview copy could not be played.' }
            : current,
        )
      }
    },
  }

  const status = proxyFile && activeConversion.status !== 'failed'
    ? 'proxy'
    : activeConversion.status === 'converting'
      ? 'converting'
      : activeConversion.status === 'failed'
        ? 'failed'
        : frameAvailable === true
          ? 'ready'
          : frameAvailable === false
            ? 'unavailable'
            : 'checking'

  return {
    sourceUrl,
    previewUrl: proxyUrl || sourceUrl,
    previewFile: proxyFile,
    usingProxy: Boolean(proxyFile),
    sourceInfo,
    frameAvailable,
    status,
    // A large but decodable source keeps playing while its copy is made.
    showPoster: frameAvailable === false && !proxyFile,
    progress: activeConversion.progress,
    conversionStartedAt: activeConversion.startedAt,
    progressUpdatedAt: activeConversion.updatedAt,
    message:
      activeConversion.status === 'failed'
        ? activeConversion.error
        : frameAvailable === false
          ? PREVIEW_UNAVAILABLE_MESSAGE
          : '',
    technicalDetails: [frame.source === file ? frame.details : '', activeConversion.details]
      .filter(Boolean)
      .join('\n\n'),
    cancelConversion: () => abortRef.current?.abort(),
    videoHandlers,
  }
}
