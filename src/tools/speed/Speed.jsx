import { useEffect, useRef, useState } from 'react'
import { changeSpeed } from '../../shared/ffmpeg/ffmpegClient.js'
import Button from '../../shared/components/Button.jsx'
import ProcessingRing from '../../shared/components/ProcessingRing.jsx'
import ResultCard from '../../shared/components/ResultCard.jsx'
import ToolLayout from '../../shared/components/ToolLayout.jsx'
import UploadBox from '../../shared/components/UploadBox.jsx'
import VideoPlayerControls from '../../shared/components/VideoPlayerControls.jsx'
import { useResultCardAttention } from '../../shared/hooks/useResultCardAttention.js'
import { isVideoFile } from '../../shared/utils/mediaFiles.js'
import { getMonotonicTime } from '../../shared/utils/timing.js'
import { calculateNewDuration } from '../../shared/media/speed.js'
import { getMediaInfo } from '../../shared/media/mediaInfo.js'
import { useObjectUrl } from '../../shared/media/useObjectUrl.js'
import './speed.css'

const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
const MAX_FILE_SIZE = 500 * 1024 * 1024
const LONG_VIDEO_SECONDS = 3 * 60
const UNKNOWN_MEDIA_INFO = { hasAudio: 'unknown' }
const EXPORT_STAGES = [{ id: 'export', label: 'Exporting video', weight: 100 }]

function formatTime(seconds) {
  const totalSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(totalSeconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`
}

function formatSpeed(speed) {
  return `${Number(speed.toFixed(2))}x`
}

/**
 * Provides local video preview and speed-adjusted video export.
 *
 * @returns {import('react').JSX.Element} Speed changer tool.
 */
function Speed({ tool }) {
  const videoRef = useRef(null)
  const abortControllerRef = useRef(null)
  const [file, setFile] = useState(null)
  const sourceUrl = useObjectUrl(file)
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 })
  const [mediaInfo, setMediaInfo] = useState(UNKNOWN_MEDIA_INFO)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [keepAudioPitchNatural, setKeepAudioPitchNatural] = useState(true)
  const [removeAudio, setRemoveAudio] = useState(false)
  const [result, setResult] = useState(null)
  const [progress, setProgress] = useState(null)
  const [progressUpdatedAt, setProgressUpdatedAt] = useState(0)
  const [exportStartedAt, setExportStartedAt] = useState(0)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [metadataError, setMetadataError] = useState('')
  const [saved, setSaved] = useState(false)
  const isExporting = status === 'processing'
  const hasMetadata = videoSize.width > 0 && duration > 0
  const { cardRef, highlighted } = useResultCardAttention(result)

  useEffect(() => {
    if (!result?.url) return undefined
    return () => URL.revokeObjectURL(result.url)
  }, [result])

  useEffect(() => () => abortControllerRef.current?.abort(), [])

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

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.playbackRate = speed
    video.preservesPitch = keepAudioPitchNatural
  }, [keepAudioPitchNatural, speed, sourceUrl])

  const resultSettingsChanged = Boolean(
    result?.settings &&
      (result.settings.speed !== speed ||
        result.settings.keepAudioPitchNatural !== keepAudioPitchNatural ||
        result.settings.removeAudio !== removeAudio),
  )

  function chooseFile(selectedFile) {
    if (!isVideoFile(selectedFile)) {
      setError('Choose a video file to continue.')
      return
    }

    abortControllerRef.current?.abort()
    setFile(selectedFile)
    setVideoSize({ width: 0, height: 0 })
    setMediaInfo(UNKNOWN_MEDIA_INFO)
    setDuration(0)
    setCurrentTime(0)
    setIsPlaying(false)
    setSpeed(1)
    setKeepAudioPitchNatural(true)
    setRemoveAudio(false)
    setResult(null)
    setProgress(null)
    setStatus('idle')
    setError('')
    setMetadataError('')
    setSaved(false)
  }

  function handleMetadata() {
    const video = videoRef.current
    if (!video) return
    if (
      !Number.isFinite(video.duration) ||
      video.duration <= 0 ||
      video.videoWidth < 2 ||
      video.videoHeight < 2
    ) {
      setMetadataError('This video has invalid dimensions or duration.')
      return
    }

    setVideoSize({ width: video.videoWidth, height: video.videoHeight })
    setDuration(video.duration)
    setMetadataError('')
  }

  function handlePreviewError() {
    setMetadataError('Could not read this video. Try a supported video file.')
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
      }
    } else {
      video.pause()
    }
  }

  function startOver() {
    abortControllerRef.current?.abort()
    setFile(null)
    setVideoSize({ width: 0, height: 0 })
    setMediaInfo(UNKNOWN_MEDIA_INFO)
    setDuration(0)
    setCurrentTime(0)
    setIsPlaying(false)
    setSpeed(1)
    setKeepAudioPitchNatural(true)
    setRemoveAudio(false)
    setResult(null)
    setProgress(null)
    setStatus('idle')
    setError('')
    setMetadataError('')
    setSaved(false)
  }

  async function exportVideo() {
    if (!file || !hasMetadata || speed === 1) return

    const controller = new AbortController()
    abortControllerRef.current = controller
    const startedAt = getMonotonicTime()
    setStatus('processing')
    setProgress(null)
    setProgressUpdatedAt(startedAt)
    setExportStartedAt(startedAt)
    setError('')
    setSaved(false)
    videoRef.current?.pause()

    try {
      const output = await changeSpeed(file, speed, {
        signal: controller.signal,
        hasAudio: mediaInfo.hasAudio,
        removeAudio,
        keepAudioPitchNatural,
        onProgress: (percent) => {
          setProgress(percent)
          setProgressUpdatedAt(getMonotonicTime())
        },
      })

      const outputDuration = calculateNewDuration(duration, speed)
      setResult({
        ...output,
        url: URL.createObjectURL(output.blob),
        durationLabel: formatTime(outputDuration),
        resolution: `${videoSize.width} × ${videoSize.height}`,
        aspectRatio: videoSize.width / videoSize.height,
        processedWith: 'Compatible mode',
        settings: { speed, keepAudioPitchNatural, removeAudio },
      })
      setSaved(false)
      setStatus('done')
    } catch (caughtError) {
      if (caughtError?.name === 'AbortError') {
        setStatus(result ? 'done' : 'idle')
      } else {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Could not export this video. Check the file and try again.',
        )
        setStatus('error')
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
    }
  }

  function downloadResult() {
    if (!result) return
    const link = document.createElement('a')
    link.href = result.url
    link.download = result.filename
    link.click()
    setSaved(true)
  }

  const outputDuration = hasMetadata ? calculateNewDuration(duration, speed) : 0
  const shouldWarnAboutFile =
    duration > LONG_VIDEO_SECONDS || (file?.size ?? 0) > MAX_FILE_SIZE

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
      <div className="media-tool-app speed-tool">
      {!file ? (
        <section className="media-tool-upload" aria-label="Upload a video">
          <UploadBox onFileSelect={chooseFile} accept="video/*" />
          {error && <p className="tool-error" role="alert">{error}</p>}
        </section>
      ) : (
        <>
          {metadataError ? (
            <section className="tool-panel" aria-live="polite">
              <p className="tool-error" role="alert">{metadataError}</p>
              <Button variant="secondary" onClick={startOver} disabled={isExporting}>
                Choose another video
              </Button>
            </section>
          ) : (
            <>
              <div className="editor-layout speed-editor-layout">
                <section className="tool-panel preview-panel" aria-label="Video preview">
                  <div className="panel-heading">
                    <div>
                      <h2>Preview</h2>
                      <p>
                        {hasMetadata
                          ? `${videoSize.width} × ${videoSize.height} · ${formatTime(duration)}`
                          : 'Reading video dimensions and duration…'}
                      </p>
                    </div>
                  </div>

                  <div className="speed-preview-frame">
                    <video
                      ref={videoRef}
                      className="speed-source-video"
                      src={sourceUrl || undefined}
                      playsInline
                      preload="metadata"
                      onLoadedMetadata={handleMetadata}
                      onError={handlePreviewError}
                      onTimeUpdate={() => {
                        if (videoRef.current) {
                          setCurrentTime(videoRef.current.currentTime)
                        }
                      }}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      style={{
                        aspectRatio: hasMetadata
                          ? `${videoSize.width} / ${videoSize.height}`
                          : '16 / 9',
                      }}
                    />
                  </div>

                  <VideoPlayerControls
                    currentTime={currentTime}
                    duration={duration}
                    isPlaying={isPlaying}
                    disabled={!hasMetadata || isExporting}
                    rightLabel={formatSpeed(speed)}
                    onPlayPause={togglePlayback}
                    onSeek={(time) => {
                      if (videoRef.current) videoRef.current.currentTime = time
                      setCurrentTime(time)
                    }}
                  />
                </section>

                <div className="editor-controls">
                  <section className="tool-panel speed-settings" aria-labelledby="speed-heading">
                    <div className="panel-heading">
                      <div>
                        <h2 id="speed-heading">Playback speed</h2>
                        <p>Choose a preset or fine-tune the speed.</p>
                      </div>
                      <strong className="speed-readout" aria-live="polite">
                        {formatSpeed(speed)}
                      </strong>
                    </div>

                    <div className="speed-presets" role="group" aria-label="Speed presets">
                      {SPEED_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          className={`preset-button${speed === preset ? ' preset-active' : ''}`}
                          type="button"
                          aria-pressed={speed === preset}
                          disabled={isExporting}
                          onClick={() => setSpeed(preset)}
                        >
                          {formatSpeed(preset)}
                        </button>
                      ))}
                    </div>

                    <label className="speed-slider-label" htmlFor="custom-speed">
                      <span>Custom speed</span>
                      <input
                        id="custom-speed"
                        type="range"
                        min="0.25"
                        max="4"
                        step="0.05"
                        value={speed}
                        aria-label="Custom playback speed"
                        disabled={isExporting}
                        onChange={(event) => setSpeed(Number(event.target.value))}
                      />
                      <span className="speed-slider-ends" aria-hidden="true">
                        <span>0.25x</span>
                        <span>4x</span>
                      </span>
                    </label>

                    <div className="speed-lengths" aria-live="polite">
                      <p><span>Original</span><strong>{formatTime(duration)}</strong></p>
                      <p><span>New length</span><strong>{formatTime(outputDuration)}</strong></p>
                    </div>

                    {mediaInfo.hasAudio !== false ? (
                      <>
                        <label className="speed-checkbox">
                          <input
                            type="checkbox"
                            checked={keepAudioPitchNatural}
                            disabled={isExporting}
                            onChange={(event) => setKeepAudioPitchNatural(event.target.checked)}
                          />
                          <span>Keep audio pitch natural</span>
                        </label>
                        <label className="speed-checkbox">
                          <input
                            type="checkbox"
                            checked={removeAudio}
                            disabled={isExporting}
                            onChange={(event) => setRemoveAudio(event.target.checked)}
                          />
                          <span>Remove audio</span>
                        </label>
                      </>
                    ) : (
                      <p className="media-info-note" role="status">
                        This video has no audio track.
                      </p>
                    )}
                    {mediaInfo.hasAudio === 'unknown' && (
                      <p className="media-info-note" role="status">
                        Audio could not be confirmed; audio options remain available.
                      </p>
                    )}
                  </section>

                  {shouldWarnAboutFile && (
                    <p className="speed-size-warning" role="status">
                      Long videos can be slow and use a lot of memory. Close other tabs.
                    </p>
                  )}

                  {error && <p className="tool-error" role="alert">{error}</p>}
                  <div className="editor-footer">
                    {speed === 1 && hasMetadata && (
                      <span className="no-changes-message">Choose a speed other than 1x</span>
                    )}
                    <Button
                      variant={result ? 'outline' : 'primary'}
                      className="export-button"
                      disabled={!hasMetadata || speed === 1 || isExporting}
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
                      onCancel={() => abortControllerRef.current?.abort()}
                    />
                  )}

                  {result && (
                    <ResultCard
                      cardRef={cardRef}
                      result={result}
                      duration={result.durationLabel}
                      resolution={result.resolution}
                      processedWith={result.processedWith}
                      onDownload={downloadResult}
                      saved={saved}
                      settingsChanged={resultSettingsChanged}
                      highlighted={highlighted}
                    />
                  )}
                </div>
              </div>

              {!hasMetadata && (
                <p className="loading-message" role="status">
                  Reading video dimensions and duration…
                </p>
              )}
            </>
          )}

        </>
      )}
      </div>
    </ToolLayout>
  )
}

export default Speed
