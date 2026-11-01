import { useEffect, useRef, useState } from 'react'
import {
  cropVideo,
  trimAndCrop,
  trimVideo,
} from '../../shared/media/engine'
import Button from '../../shared/components/Button'
import ProcessingRing from '../../shared/components/ProcessingRing'
import ResultCard from '../../shared/components/ResultCard'
import ToolLayout from '../../shared/components/ToolLayout'
import VideoPlayerControls from '../../shared/components/VideoPlayerControls'
import VideoPreview from '../../shared/components/VideoPreview'
import UploadBox from '../../shared/components/UploadBox'
import { useResultCardAttention } from '../../shared/hooks/useResultCardAttention'
import {
  displayedCropToVideoPixels,
  getCenteredAspectCrop,
  moveCropPixels,
  resizeCropPixels,
} from '../../shared/utils/cropGeometry'
import { isVideoFile } from '../../shared/utils/mediaFiles'
import { getMonotonicTime } from '../../shared/utils/timing'
import { getMediaInfo } from '../../shared/media/mediaInfo'
import { useObjectUrl } from '../../shared/media/useObjectUrl'
import './cropTrim.css'

const ASPECT_PRESETS = [
  { name: 'Free', ratio: null },
  { name: '9:16', ratio: 9 / 16 },
  { name: '4:5', ratio: 4 / 5 },
  { name: '1:1', ratio: 1 },
  { name: '16:9', ratio: 16 / 9 },
]

const MIN_TRIM_SECONDS = 0.1
const UNKNOWN_MEDIA_INFO = { hasAudio: 'unknown' }
const EXPORT_STAGES = [{ id: 'export', label: 'Exporting video', weight: 100 }]

function formatTime(seconds) {
  const deciseconds = Math.max(0, Math.round(seconds * 10))
  const minutes = Math.floor(deciseconds / 600)
  const remaining = (deciseconds % 600) / 10
  return `${String(minutes).padStart(2, '0')}:${remaining.toFixed(1).padStart(4, '0')}`
}

function sameCrop(a, b) {
  return a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

/**
 * Provides local video preview, trim and crop controls, and video export.
 *
 * @returns {import('react').JSX.Element} Crop and trim tool.
 */
function CropTrim({ tool }) {
  const videoRef = useRef(null)
  const previewRef = useRef(null)
  const dragRef = useRef(null)
  const abortControllerRef = useRef(null)
  const [file, setFile] = useState(null)
  const sourceUrl = useObjectUrl(file)
  const [result, setResult] = useState(null)
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 })
  const [mediaInfo, setMediaInfo] = useState(UNKNOWN_MEDIA_INFO)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState(0)
  const [exactTrim, setExactTrim] = useState(false)
  const [crop, setCrop] = useState(null)
  const [activePreset, setActivePreset] = useState('Free')
  const [progress, setProgress] = useState(null)
  const [status, setStatus] = useState('idle')
  const [exportStartedAt, setExportStartedAt] = useState(0)
  const [progressUpdatedAt, setProgressUpdatedAt] = useState(0)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [metadataError, setMetadataError] = useState('')
  const isExporting = status === 'processing'

  useEffect(() => {
    if (!result?.url) return undefined
    return () => URL.revokeObjectURL(result.url)
  }, [result])

  useEffect(
    () => () => abortControllerRef.current?.abort(),
    [],
  )

  useEffect(() => {
    let active = true
    setMediaInfo(UNKNOWN_MEDIA_INFO)
    if (file) {
      getMediaInfo(file).then((info) => {
        if (active) setMediaInfo(info)
      })
    }

    return () => {
      active = false
    }
  }, [file])

  const { cardRef: resultBoxRef, highlighted: resultHighlighted } =
    useResultCardAttention(result)

  const hasMetadata = videoSize.width > 0 && duration > 0
  const fullCrop = hasMetadata
    ? { x: 0, y: 0, w: videoSize.width, h: videoSize.height }
    : null
  const trimChanged =
    startTime > 0.05 || (duration > 0 && endTime < duration - 0.05)
  const cropChanged = Boolean(crop && fullCrop && !sameCrop(crop, fullCrop))
  const hasChanges = trimChanged || cropChanged
  const resultSettingsChanged = Boolean(
    result &&
      result.settings &&
      (result.settings.startTime !== startTime ||
        result.settings.endTime !== endTime ||
        result.settings.exactTrim !== exactTrim ||
        !sameCrop(result.settings.crop, crop)),
  )

  function selectFile(selectedFile) {
    if (!isVideoFile(selectedFile)) {
      setError('Choose a video file to continue.')
      setStatus('error')
      return
    }

    abortControllerRef.current?.abort()
    setFile(selectedFile)
    setResult(null)
    setSaved(false)
    setStatus('idle')
    setVideoSize({ width: 0, height: 0 })
    setMediaInfo(UNKNOWN_MEDIA_INFO)
    setDuration(0)
    setCurrentTime(0)
    setIsPlaying(false)
    setStartTime(0)
    setEndTime(0)
    setExactTrim(false)
    setCrop(null)
    setActivePreset('Free')
    setError('')
    setMetadataError('')
  }

  function handleMetadata() {
    const video = videoRef.current
    if (!video) return

    if (
      !Number.isFinite(video.duration) ||
      video.duration <= MIN_TRIM_SECONDS ||
      video.videoWidth < 2 ||
      video.videoHeight < 2
    ) {
      setMetadataError('This video has invalid dimensions or is too short to edit.')
      setStatus('error')
      return
    }

    const size = { width: video.videoWidth, height: video.videoHeight }
    if (
      videoSize.width === size.width &&
      videoSize.height === size.height &&
      duration === video.duration
    ) {
      return
    }

    setVideoSize(size)
    setDuration(video.duration)
    setEndTime(video.duration)
    setCrop({ x: 0, y: 0, w: size.width, h: size.height })
    setCurrentTime(0)
    setMetadataError('')
    setError('')
  }

  function handleMetadataError(message) {
    setMetadataError(message)
    setStatus('error')
  }

  function setTrimStart(value) {
    setStartTime(Math.min(value, Math.max(0, endTime - MIN_TRIM_SECONDS)))
  }

  function setTrimEnd(value) {
    setEndTime(Math.max(value, Math.min(duration, startTime + MIN_TRIM_SECONDS)))
  }

  function setStartToNow() {
    const time = videoRef.current?.currentTime ?? currentTime
    setTrimStart(Math.max(0, Math.min(time, endTime - MIN_TRIM_SECONDS)))
  }

  function setEndToNow() {
    const time = videoRef.current?.currentTime ?? currentTime
    setTrimEnd(Math.max(startTime + MIN_TRIM_SECONDS, Math.min(time, duration)))
  }

  function handleTimeUpdate() {
    const video = videoRef.current
    if (!video) return

    if (
      !video.paused &&
      (video.currentTime < startTime - 0.02 || video.currentTime >= endTime - 0.02)
    ) {
      video.currentTime = startTime
    }
    setCurrentTime(video.currentTime)
  }

  function handlePlay() {
    const video = videoRef.current
    if (!video) return
    setIsPlaying(true)
    if (video.currentTime < startTime || video.currentTime >= endTime) {
      video.currentTime = startTime
    }
  }

  async function togglePlayback() {
    if (isExporting) return
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      try {
        await video.play()
      } catch {
        setError('Could not play this video in the browser.')
        setStatus('error')
      }
    } else {
      video.pause()
    }
  }

  function choosePreset(preset) {
    setActivePreset(preset.name)
    if (preset.ratio && hasMetadata) {
      setCrop(getCenteredAspectCrop(videoSize, preset.ratio))
    }
  }

  function getSourceDelta(event, initial) {
    const preview = previewRef.current
    if (
      !preview ||
      !videoSize.width ||
      !videoSize.height
    ) {
      return { x: 0, y: 0 }
    }

    const bounds = preview.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0 }
    return {
      x: ((event.clientX - initial.clientX) * videoSize.width) / bounds.width,
      y: ((event.clientY - initial.clientY) * videoSize.height) / bounds.height,
    }
  }

  function beginCropPointer(event, type, handle = '') {
    if (isExporting || !crop) return
    event.preventDefault()
    event.stopPropagation()
    previewRef.current?.setPointerCapture(event.pointerId)
    dragRef.current = {
      type,
      handle,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      crop: { ...crop },
    }
  }

  function handleCropPointerMove(event) {
    const drag = dragRef.current
    if (isExporting || !drag || drag.pointerId !== event.pointerId) return

    const delta = getSourceDelta(event, drag)
    const nextCrop =
      drag.type === 'move'
        ? moveCropPixels(drag.crop, delta.x, delta.y, videoSize)
        : resizeCropPixels(drag.crop, drag.handle, delta.x, delta.y, videoSize)
    setCrop(nextCrop)
    setActivePreset('Free')
  }

  function endCropPointer(event) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
  }

  function resizeCropWithKeyboard(event, handle) {
    if (isExporting) return
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return
    }
    event.preventDefault()
    const step = event.shiftKey ? 20 : 2
    const deltaX = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
    const deltaY = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
    setCrop((previousCrop) =>
      resizeCropPixels(previousCrop, handle, deltaX, deltaY, videoSize),
    )
    setActivePreset('Free')
  }

  function getExportCrop() {
    const video = videoRef.current
    const preview = previewRef.current
    if (!video || !preview || !crop) {
      throw new Error('Wait for the video preview to finish loading.')
    }

    const bounds = preview.getBoundingClientRect()
    const displayCrop = {
      x: (crop.x / videoSize.width) * bounds.width,
      y: (crop.y / videoSize.height) * bounds.height,
      w: (crop.w / videoSize.width) * bounds.width,
      h: (crop.h / videoSize.height) * bounds.height,
    }
    return displayedCropToVideoPixels(
      displayCrop,
      { width: bounds.width, height: bounds.height },
      { width: video.videoWidth, height: video.videoHeight },
    )
  }

  async function exportVideo() {
    if (!file || !hasMetadata || !hasChanges) return

    setStatus('processing')
    setProgress(null)
    const startedAt = getMonotonicTime()
    setExportStartedAt(startedAt)
    setProgressUpdatedAt(startedAt)
    setError('')
    videoRef.current?.pause()

    const controller = new AbortController()
    abortControllerRef.current = controller
    try {
      const options = {
        signal: controller.signal,
        onProgress: (percent) => {
          setProgress(percent)
          setProgressUpdatedAt(getMonotonicTime())
        },
      }
      let output
      if (trimChanged && cropChanged) {
        const exportCrop = getExportCrop()
        output = await trimAndCrop(
          file,
          startTime,
          endTime,
          exportCrop,
          videoSize,
          options,
        )
      } else if (trimChanged) {
        output = await trimVideo(file, startTime, endTime, {
          ...options,
          exact: exactTrim,
        })
      } else {
        const exportCrop = getExportCrop()
        output = await cropVideo(file, exportCrop, videoSize, options)
      }
      const outputDuration = trimChanged ? endTime - startTime : duration
      const outputResolution = cropChanged
        ? `${crop.w} × ${crop.h}`
        : `${videoSize.width} × ${videoSize.height}`
      setResult({
        ...output,
        url: URL.createObjectURL(output.blob),
        durationLabel: formatTime(outputDuration),
        resolution: outputResolution,
        aspectRatio: cropChanged
          ? crop.w / crop.h
          : videoSize.width / videoSize.height,
        settings: {
          startTime,
          endTime,
          exactTrim,
          crop: crop ? { ...crop } : null,
        },
      })
      setSaved(false)
      setStatus('done')
    } catch (caughtError) {
      if (caughtError?.name !== 'AbortError') {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Could not export this video. Check the file and try again.',
        )
        setStatus('error')
      } else {
        setStatus(result ? 'done' : 'idle')
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
    }
  }

  function cancelExport() {
    abortControllerRef.current?.abort()
  }

  function startOver() {
    abortControllerRef.current?.abort()
    setStatus('idle')
    setFile(null)
    setResult(null)
    setVideoSize({ width: 0, height: 0 })
    setDuration(0)
    setCurrentTime(0)
    setIsPlaying(false)
    setStartTime(0)
    setEndTime(0)
    setExactTrim(false)
    setCrop(null)
    setError('')
    setMetadataError('')
    setSaved(false)
  }

  function downloadResult() {
    if (!result) return

    const link = document.createElement('a')
    link.href = result.url
    link.download = result.filename
    link.click()
    setSaved(true)
  }

  const displayedCrop =
    crop && videoSize.width && videoSize.height
      ? {
          left: `${(crop.x / videoSize.width) * 100}%`,
          top: `${(crop.y / videoSize.height) * 100}%`,
          width: `${(crop.w / videoSize.width) * 100}%`,
          height: `${(crop.h / videoSize.height) * 100}%`,
        }
      : null

  return (
    <ToolLayout
      tool={tool}
      headerAction={file && (
        <Button
          variant="secondary"
          className="tool-change-button"
          onClick={startOver}
          disabled={isExporting}
        >
          Choose a different video
        </Button>
      )}
    >
      <div className="crop-trim-app">
      {!file ? (
        <section className="crop-trim-upload" aria-label="Upload a video">
          <UploadBox onFileSelect={selectFile} accept="video/*" />
          {error && <p className="tool-error" role="alert">{error}</p>}
        </section>
      ) : (
        <>
          {metadataError ? (
            <section className="tool-panel" aria-live="polite">
              <p className="tool-error" role="alert">{metadataError}</p>
              <button className="text-button" type="button" onClick={startOver}>
                Choose another video
              </button>
            </section>
          ) : (
            <>
                <div className="editor-layout">
                  <section className="tool-panel preview-panel" aria-label="Video preview">
                    <div className="panel-heading">
                      <div>
                        <h2>Preview</h2>
                        <p>
                          {videoSize.width} × {videoSize.height} · {formatTime(duration)}
                        </p>
                      </div>
                    </div>

                    <VideoPreview
                      videoRef={videoRef}
                      src={sourceUrl}
                      frameClassName="preview-frame"
                      videoClassName="video-preview-video-fill source-video"
                      frameRef={previewRef}
                      frameStyle={{
                        aspectRatio: hasMetadata
                          ? `${videoSize.width} / ${videoSize.height}`
                          : '16 / 9',
                      }}
                      frameProps={{
                        onPointerMove: handleCropPointerMove,
                        onPointerUp: endCropPointer,
                        onPointerCancel: endCropPointer,
                      }}
                      videoProps={{
                        playsInline: true,
                        onLoadedMetadata: handleMetadata,
                        onError: () => handleMetadataError(
                          'Could not read this video. Try a supported video file.',
                        ),
                        onTimeUpdate: handleTimeUpdate,
                        onPlay: handlePlay,
                        onPause: () => setIsPlaying(false),
                      }}
                    >
                      {displayedCrop && (
                        <>
                          <div
                            className="crop-dim crop-dim-top"
                            style={{ height: displayedCrop.top }}
                            aria-hidden="true"
                          />
                          <div
                            className="crop-dim crop-dim-left"
                            style={{
                              top: displayedCrop.top,
                              width: displayedCrop.left,
                              height: displayedCrop.height,
                            }}
                            aria-hidden="true"
                          />
                          <div
                            className="crop-dim crop-dim-right"
                            style={{
                              top: displayedCrop.top,
                              left: `calc(${displayedCrop.left} + ${displayedCrop.width})`,
                              height: displayedCrop.height,
                              width: `calc(100% - ${displayedCrop.left} - ${displayedCrop.width})`,
                            }}
                            aria-hidden="true"
                          />
                          <div
                            className="crop-dim crop-dim-bottom"
                            style={{
                              top: `calc(${displayedCrop.top} + ${displayedCrop.height})`,
                              height: `calc(100% - ${displayedCrop.top} - ${displayedCrop.height})`,
                            }}
                            aria-hidden="true"
                          />
                          <div
                            className="crop-selection"
                            style={displayedCrop}
                            onPointerDown={(event) => beginCropPointer(event, 'move')}
                          >
                            <span className="crop-selection-label">Drag to move</span>
                            {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => (
                              <button
                                key={handle}
                                type="button"
                                className={`crop-handle crop-handle-${handle}`}
                                aria-label={`Resize crop ${handle}`}
                                disabled={isExporting}
                                onPointerDown={(event) =>
                                  beginCropPointer(event, 'resize', handle)
                                }
                                onKeyDown={(event) => resizeCropWithKeyboard(event, handle)}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </VideoPreview>

                    <VideoPlayerControls
                      currentTime={currentTime}
                      duration={duration}
                      isPlaying={isPlaying}
                      disabled={isExporting}
                      onPlayPause={togglePlayback}
                      onSeek={(time) => {
                        if (videoRef.current) videoRef.current.currentTime = time
                        setCurrentTime(time)
                      }}
                    />
                  </section>

                  <div className="editor-controls">
                    {mediaInfo.hasAudio === false && (
                      <p className="media-info-note" role="status">
                        This video has no audio track.
                      </p>
                    )}
                    {mediaInfo.hasAudio === 'unknown' && (
                      <p className="media-info-note" role="status">
                        Audio could not be confirmed; export will preserve it if available.
                      </p>
                    )}
                    <section className="tool-panel" aria-labelledby="trim-heading">
                      <div className="panel-heading">
                        <div>
                          <h2 id="trim-heading">Trim</h2>
                          <p>Playback loops between the start and end points.</p>
                        </div>
                        <strong className="new-duration">
                          New duration: {formatTime(endTime - startTime)}
                        </strong>
                      </div>
                      <div className="trim-range-labels">
                        <span>Start: {formatTime(startTime)}</span>
                        <span>End: {formatTime(endTime)}</span>
                      </div>
                      <div
                        className="dual-range-slider"
                        style={{
                          '--start-position': `${(startTime / duration) * 100}%`,
                          '--end-position': `${(endTime / duration) * 100}%`,
                        }}
                      >
                        <div className="dual-range-track" aria-hidden="true">
                          <span className="dual-range-selected" />
                        </div>
                        <label className="visually-hidden" htmlFor="trim-start-range">
                          Trim start time: {formatTime(startTime)}
                        </label>
                        <input
                          id="trim-start-range"
                          className="dual-range-input dual-range-start"
                          type="range"
                          min="0"
                          max={duration}
                          step="0.1"
                          value={startTime}
                          aria-label="Trim start time"
                          disabled={isExporting}
                          onChange={(event) => setTrimStart(Number(event.target.value))}
                        />
                        <label className="visually-hidden" htmlFor="trim-end-range">
                          Trim end time: {formatTime(endTime)}
                        </label>
                        <input
                          id="trim-end-range"
                          className="dual-range-input dual-range-end"
                          type="range"
                          min="0"
                          max={duration}
                          step="0.1"
                          value={endTime}
                          aria-label="Trim end time"
                          disabled={isExporting}
                          onChange={(event) => setTrimEnd(Number(event.target.value))}
                        />
                      </div>
                      <div className="trim-buttons">
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={isExporting}
                          onClick={setStartToNow}
                        >
                          Set start to now
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={isExporting}
                          onClick={setEndToNow}
                        >
                          Set end to now
                        </button>
                      </div>
                      <label className="exact-trim-toggle">
                        <input
                          type="checkbox"
                          checked={exactTrim}
                          disabled={isExporting || cropChanged}
                          onChange={(event) => {
                            setExactTrim(event.target.checked)
                          }}
                        />
                        <span>Exact frame trim (re-encode)</span>
                      </label>
                      {cropChanged && (
                        <p className="trim-help">
                          Crop exports already re-encode for accurate boundaries.
                        </p>
                      )}
                    </section>

                    <section className="tool-panel" aria-labelledby="crop-heading">
                      <div className="panel-heading">
                        <div>
                          <h2 id="crop-heading">Crop</h2>
                          <p>Drag the frame or its handles to adjust the crop.</p>
                        </div>
                      </div>
                      <div className="aspect-presets" aria-label="Crop aspect ratio">
                        {ASPECT_PRESETS.map((preset) => (
                          <button
                            key={preset.name}
                            type="button"
                            className={`preset-button${activePreset === preset.name ? ' preset-active' : ''}`}
                            aria-pressed={activePreset === preset.name}
                            disabled={!hasMetadata || isExporting}
                            onClick={() => choosePreset(preset)}
                          >
                            {preset.name}
                          </button>
                        ))}
                      </div>
                      {crop && (
                        <p className="crop-dimensions" aria-live="polite">
                          Crop: {crop.w} × {crop.h} px at ({crop.x}, {crop.y})
                        </p>
                      )}
                    </section>
                  </div>
                </div>

              {!hasMetadata && !metadataError && (
                <p className="loading-message" role="status">Reading video dimensions and duration…</p>
              )}

              {error && <p className="tool-error" role="alert">{error}</p>}
              <div className="editor-footer">
                {!hasChanges && hasMetadata && (
                  <span className="no-changes-message">Adjust the trim or crop to enable export.</span>
                )}
                <Button
                  variant={result ? 'outline' : 'primary'}
                  className="export-button"
                  type="button"
                  disabled={!hasMetadata || !hasChanges || isExporting}
                  onClick={exportVideo}
                >
                  {result ? 'Export again' : 'Export video'}
                </Button>
              </div>
              {isExporting && (
                <ProcessingRing
                  stages={EXPORT_STAGES}
                  stageId="export"
                  percent={progress}
                  startedAt={exportStartedAt}
                  progressUpdatedAt={progressUpdatedAt}
                  onCancel={cancelExport}
                />
              )}
              {result && (
                <ResultCard
                  cardRef={resultBoxRef}
                  result={result}
                  duration={result.durationLabel}
                  resolution={result.resolution}
                  processedWith={result.processedWith}
                  onDownload={downloadResult}
                  saved={saved}
                  settingsChanged={resultSettingsChanged}
                  highlighted={resultHighlighted}
                />
              )}
            </>
          )}
        </>
      )}
      </div>
    </ToolLayout>
  )
}

export default CropTrim
