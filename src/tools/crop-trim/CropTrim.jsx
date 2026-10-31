import { useEffect, useRef, useState } from 'react'
import {
  cropVideo,
  trimAndCrop,
  trimVideo,
} from '../../shared/ffmpeg/ffmpegClient'
import DeviceWarning from '../../shared/components/DeviceWarning'
import DownloadButton from '../../shared/components/DownloadButton'
import ProgressBar from '../../shared/components/ProgressBar'
import UploadBox from '../../shared/components/UploadBox'
import {
  displayedCropToVideoPixels,
  getCenteredAspectCrop,
  moveCropPixels,
  resizeCropPixels,
} from '../../shared/utils/cropGeometry'
import './cropTrim.css'

const ASPECT_PRESETS = [
  { name: 'Free', ratio: null },
  { name: '9:16', ratio: 9 / 16 },
  { name: '4:5', ratio: 4 / 5 },
  { name: '1:1', ratio: 1 },
  { name: '16:9', ratio: 16 / 9 },
]

const MIN_TRIM_SECONDS = 0.1

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
 * Provides local video preview, trim and crop controls, and FFmpeg export.
 *
 * @returns {import('react').JSX.Element} Crop and trim tool.
 */
function CropTrim() {
  const videoRef = useRef(null)
  const previewRef = useRef(null)
  const dragRef = useRef(null)
  const abortControllerRef = useRef(null)
  const [file, setFile] = useState(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [result, setResult] = useState(null)
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 })
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState(0)
  const [crop, setCrop] = useState(null)
  const [activePreset, setActivePreset] = useState('Free')
  const [progress, setProgress] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState('')
  const [metadataError, setMetadataError] = useState('')

  useEffect(() => {
    if (!sourceUrl) return undefined
    return () => URL.revokeObjectURL(sourceUrl)
  }, [sourceUrl])

  useEffect(() => {
    if (!result?.url) return undefined
    return () => URL.revokeObjectURL(result.url)
  }, [result])

  useEffect(
    () => () => abortControllerRef.current?.abort(),
    [],
  )

  const hasMetadata = videoSize.width > 0 && duration > 0
  const fullCrop = hasMetadata
    ? { x: 0, y: 0, w: videoSize.width, h: videoSize.height }
    : null
  const trimChanged =
    startTime > 0.05 || (duration > 0 && endTime < duration - 0.05)
  const cropChanged = Boolean(crop && fullCrop && !sameCrop(crop, fullCrop))
  const hasChanges = trimChanged || cropChanged

  function selectFile(selectedFile) {
    const hasVideoType = selectedFile.type.startsWith('video/')
    const hasVideoExtension = /\.(mp4|m4v|mov|webm|mkv|avi|ogv)$/i.test(selectedFile.name)
    if (!hasVideoType && !hasVideoExtension) {
      setError('Choose a video file to continue.')
      return
    }

    abortControllerRef.current?.abort()
    setFile(selectedFile)
    setSourceUrl(URL.createObjectURL(selectedFile))
    setResult(null)
    setVideoSize({ width: 0, height: 0 })
    setDuration(0)
    setCurrentTime(0)
    setIsPlaying(false)
    setStartTime(0)
    setEndTime(0)
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

  function setTrimStart(value) {
    setStartTime(Math.min(value, Math.max(0, endTime - MIN_TRIM_SECONDS)))
    setResult(null)
  }

  function setTrimEnd(value) {
    setEndTime(Math.max(value, Math.min(duration, startTime + MIN_TRIM_SECONDS)))
    setResult(null)
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
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      try {
        await video.play()
      } catch {
        setError('Could not play this video in the browser.')
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
    setResult(null)
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
    if (!drag || drag.pointerId !== event.pointerId) return

    const delta = getSourceDelta(event, drag)
    const nextCrop =
      drag.type === 'move'
        ? moveCropPixels(drag.crop, delta.x, delta.y, videoSize)
        : resizeCropPixels(drag.crop, drag.handle, delta.x, delta.y, videoSize)
    setCrop(nextCrop)
    setActivePreset('Free')
    setResult(null)
  }

  function endCropPointer(event) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
  }

  function resizeCropWithKeyboard(event, handle) {
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
    setResult(null)
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

    setIsExporting(true)
    setProgress(0)
    setError('')
    setResult(null)

    const controller = new AbortController()
    abortControllerRef.current = controller
    try {
      const options = {
        signal: controller.signal,
        onProgress: setProgress,
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
        output = await trimVideo(file, startTime, endTime, options)
      } else {
        const exportCrop = getExportCrop()
        output = await cropVideo(file, exportCrop, videoSize, options)
      }
      setResult({ ...output, url: URL.createObjectURL(output.blob) })
    } catch (caughtError) {
      if (caughtError?.name !== 'AbortError') {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Could not export this video. Check the file and try again.',
        )
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
      setIsExporting(false)
    }
  }

  function cancelExport() {
    abortControllerRef.current?.abort()
  }

  function startOver() {
    abortControllerRef.current?.abort()
    setFile(null)
    setSourceUrl('')
    setResult(null)
    setVideoSize({ width: 0, height: 0 })
    setDuration(0)
    setCurrentTime(0)
    setIsPlaying(false)
    setStartTime(0)
    setEndTime(0)
    setCrop(null)
    setError('')
    setMetadataError('')
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
    <main className="crop-trim-app">
      <header className="tool-header">
        <p className="tool-eyebrow">Web Video Toolkit</p>
        <h1>Crop and trim</h1>
        <p>Set the exact section and frame you want. Your video stays on this device.</p>
      </header>

      <DeviceWarning />

      {!file ? (
        <section className="crop-trim-upload" aria-label="Upload a video">
          <UploadBox onFileSelect={selectFile} accept="video/*" />
          {error && <p className="tool-error" role="alert">{error}</p>}
        </section>
      ) : (
        <>
          {!hasMetadata && !metadataError && (
            <video
              ref={videoRef}
              className="metadata-loader"
              src={sourceUrl}
              preload="metadata"
              playsInline
              onLoadedMetadata={handleMetadata}
              onError={() =>
                setMetadataError('Could not read this video. Try a supported video file.')
              }
            />
          )}
          {metadataError ? (
            <section className="tool-panel" aria-live="polite">
              <p className="tool-error" role="alert">{metadataError}</p>
              <button className="text-button" type="button" onClick={startOver}>
                Choose another video
              </button>
            </section>
          ) : (
            <>
              {hasMetadata && (
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

                    <div
                      ref={previewRef}
                      className="preview-frame"
                      style={{ aspectRatio: `${videoSize.width} / ${videoSize.height}` }}
                      onPointerMove={handleCropPointerMove}
                      onPointerUp={endCropPointer}
                      onPointerCancel={endCropPointer}
                    >
                      <video
                        ref={videoRef}
                        className="source-video"
                        src={sourceUrl}
                        playsInline
                        onLoadedMetadata={handleMetadata}
                        onError={() =>
                          setMetadataError('Could not read this video. Try a supported video file.')
                        }
                        onTimeUpdate={handleTimeUpdate}
                        onPlay={handlePlay}
                        onPause={() => setIsPlaying(false)}
                      />
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
                    </div>

                    <div className="preview-controls">
                      <button
                        className="secondary-button"
                        type="button"
                        aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                        onClick={togglePlayback}
                      >
                        {isPlaying ? 'Pause' : 'Play'}
                      </button>
                      <div className="time-label-row" aria-live="off">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                      </div>
                    </div>
                    <label className="seek-control">
                      <span className="visually-hidden">Seek video</span>
                      <input
                        type="range"
                        min="0"
                        max={duration}
                        step="0.05"
                        value={Math.min(currentTime, duration)}
                        aria-label="Seek video"
                        onChange={(event) => {
                          const time = Number(event.target.value)
                          if (videoRef.current) videoRef.current.currentTime = time
                          setCurrentTime(time)
                        }}
                      />
                    </label>
                  </section>

                  <div className="editor-controls">
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
              )}

              {!hasMetadata && !metadataError && (
                <p className="loading-message" role="status">Reading video dimensions and duration…</p>
              )}

              {error && <p className="tool-error" role="alert">{error}</p>}
              {isExporting && (
                <div className="export-progress">
                  <ProgressBar percent={progress} label="Exporting video" />
                  <button className="secondary-button cancel-button" type="button" onClick={cancelExport}>
                    Cancel
                  </button>
                </div>
              )}

              {result?.url && (
                <section className="tool-panel result-panel" aria-labelledby="result-heading">
                  <div className="panel-heading">
                    <div>
                      <h2 id="result-heading">Export ready</h2>
                      <p>{result.filename}</p>
                    </div>
                    <DownloadButton result={result} />
                  </div>
                  <video className="result-video" src={result.url} controls playsInline />
                </section>
              )}

              <div className="editor-footer">
                {!hasChanges && hasMetadata && (
                  <span className="no-changes-message">Adjust the trim or crop to enable export.</span>
                )}
                <button
                  className="media-button export-button"
                  type="button"
                  disabled={!hasMetadata || !hasChanges || isExporting}
                  onClick={exportVideo}
                >
                  {isExporting ? 'Exporting…' : 'Export'}
                </button>
                <button
                  className="text-button"
                  type="button"
                  disabled={isExporting}
                  onClick={startOver}
                >
                  Start over
                </button>
              </div>
            </>
          )}
        </>
      )}
    </main>
  )
}

export default CropTrim
