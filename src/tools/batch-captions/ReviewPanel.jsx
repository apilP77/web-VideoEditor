import { useEffect, useRef, useState } from 'react'
import PreviewPoster, { PreviewCopyBadge } from '../../shared/components/PreviewPoster.jsx'
import VideoPlayerControls from '../../shared/components/VideoPlayerControls.jsx'
import VideoPreview from '../../shared/components/VideoPreview.jsx'
import { editCaptionText, getActiveCaption } from '../../shared/captions/engine.js'
import { drawCaption } from '../../shared/captions/renderer.js'
import { waitForCaptionFonts } from '../../shared/captions/styles.js'
import { getMediaDuration } from '../../shared/media/duration.js'
import { getPreviewSize } from '../../shared/media/previewProxy.js'
import { usePreviewFallback } from '../../shared/media/usePreviewFallback.js'

function formatClock(seconds) {
  const total = Math.max(0, Math.round(seconds || 0))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Watch one finished video with its captions drawn on top, and correct the
 * words. A caption's text is saved when its field loses focus or Enter is
 * pressed; clicking a line jumps the video to it.
 *
 * @param {{file: File, captions: object[], style: object, onCaptionChange: (index: number, caption: object) => void, onClose: () => void}} props
 *   Video, its captions, the shared style, and handlers.
 * @returns {import('react').JSX.Element} Preview and editor.
 */
function ReviewPanel({ file, captions, style, onCaptionChange, onClose }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const frameRef = useRef(null)
  const preview = usePreviewFallback({ file, videoRef })
  const [fontsReady, setFontsReady] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [frameVersion, setFrameVersion] = useState(0)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [maxWidth, setMaxWidth] = useState(560)

  // The video box must match the video's shape exactly, or the caption layer
  // drawn over it is stretched. Same approach as the Captions tool.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return undefined
    const update = () => setMaxWidth(frame.clientWidth)
    update()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const observer = new ResizeObserver(update)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  const sourceWidth = dimensions.width || preview.sourceInfo?.width || 0
  const sourceHeight = dimensions.height || preview.sourceInfo?.height || 0
  const size = getPreviewSize(
    sourceWidth,
    sourceHeight,
    maxWidth,
    Math.min(440, window.innerHeight * 0.5),
  )

  useEffect(() => {
    let active = true
    waitForCaptionFonts()
      .catch(() => {})
      .then(() => {
        if (active) setFontsReady(true)
      })
    return () => {
      active = false
    }
  }, [])

  // Redraw the caption over the video: every frame while playing, and after
  // a seek, an edit or a style change while paused.
  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!video || !canvas || !context || !fontsReady) return undefined

    let animationFrame = 0
    let videoFrame = 0
    let cancelled = false

    function paint() {
      if (cancelled) return
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
        }
        const time = video.currentTime || 0
        const index = getActiveCaption(captions, time)
        drawCaption(context, index >= 0 ? captions[index] : null, time, style, canvas.width, canvas.height)
        setCurrentTime((previous) => (Math.abs(previous - time) > 0.08 ? time : previous))
      }
      if (!video.paused && !video.ended) {
        if (typeof video.requestVideoFrameCallback === 'function') {
          videoFrame = video.requestVideoFrameCallback(paint)
        } else {
          animationFrame = requestAnimationFrame(paint)
        }
      }
    }

    paint()
    return () => {
      cancelled = true
      if (animationFrame) cancelAnimationFrame(animationFrame)
      if (videoFrame && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(videoFrame)
      }
    }
  }, [captions, fontsReady, isPlaying, frameVersion, preview.previewUrl, style])

  function seek(time) {
    const video = videoRef.current
    if (!video) return
    video.currentTime = time
    setCurrentTime(time)
  }

  function togglePlayback() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }

  const activeIndex = getActiveCaption(captions, currentTime)

  return (
    <div className="batch-review">
      <div className="batch-review-video">
        <div ref={frameRef} className="captions-video-frame">
        <VideoPreview
          videoRef={videoRef}
          src={preview.previewUrl}
          frameClassName="captions-video-stage"
          frameStyle={{
            width: size.width || '100%',
            height: size.height || undefined,
            aspectRatio: sourceWidth && sourceHeight ? `${sourceWidth} / ${sourceHeight}` : undefined,
          }}
          videoClassName="captions-video"
          videoProps={{
            playsInline: true,
            preload: 'metadata',
            onLoadedMetadata: (event) => {
              preview.videoHandlers.onLoadedMetadata(event)
              const { videoWidth, videoHeight } = event.currentTarget
              if (videoWidth > 0 && videoHeight > 0) {
                setDimensions({ width: videoWidth, height: videoHeight })
              }
              setDuration(getMediaDuration(event.currentTarget.duration, preview.sourceInfo?.duration))
              setFrameVersion((version) => version + 1)
            },
            onLoadedData: (event) => {
              preview.videoHandlers.onLoadedData(event)
              setFrameVersion((version) => version + 1)
            },
            onSeeked: (event) => {
              preview.videoHandlers.onSeeked(event)
              setCurrentTime(event.currentTarget.currentTime)
              setFrameVersion((version) => version + 1)
            },
            onError: preview.videoHandlers.onError,
            onPlay: () => setIsPlaying(true),
            onPause: () => setIsPlaying(false),
          }}
        >
          <canvas ref={canvasRef} className="captions-overlay" aria-hidden="true" />
          {preview.showPoster && (
            <PreviewPoster
              fileName={file.name}
              codec={preview.sourceInfo?.codec}
              status={preview.status}
              progress={preview.progress}
              startedAt={preview.conversionStartedAt}
              progressUpdatedAt={preview.progressUpdatedAt}
              message={preview.message}
              technicalDetails={preview.technicalDetails}
              note="You can still edit the words below. Subtitle files work without a picture."
              onCancel={preview.cancelConversion}
            />
          )}
          {!preview.showPoster && preview.status === 'converting' && (
            <PreviewCopyBadge progress={preview.progress} onCancel={preview.cancelConversion} />
          )}
        </VideoPreview>
        </div>
        <VideoPlayerControls
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          disabled={duration <= 0}
          onPlayPause={togglePlayback}
          onSeek={seek}
        />
      </div>

      <div className="batch-review-words">
        <div className="batch-review-heading">
          <strong>Words</strong>
          <button type="button" onClick={onClose}>Close preview</button>
        </div>
        <ol className="batch-caption-editor">
          {captions.map((caption, index) => {
            const text = caption.text ?? caption.words.map((word) => word.word).join(' ')
            return (
              <li
                key={`${index}-${caption.start}-${text}`}
                className={index === activeIndex ? 'is-active' : ''}
              >
                <button
                  type="button"
                  className="batch-caption-time"
                  aria-label={`Jump to ${formatClock(caption.start)}`}
                  onClick={() => seek(caption.start)}
                >
                  {formatClock(caption.start)}
                </button>
                <input
                  type="text"
                  defaultValue={text}
                  aria-label={`Caption ${index + 1}`}
                  onFocus={() => seek(caption.start)}
                  onBlur={(event) => {
                    const value = event.target.value.trim()
                    if (!value) {
                      event.target.value = text
                    } else if (value !== text) {
                      onCaptionChange(index, editCaptionText(caption, value))
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                  }}
                />
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

export default ReviewPanel
