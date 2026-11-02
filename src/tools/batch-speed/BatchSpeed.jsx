import { useState } from 'react'
import BatchModeToggle from '../../shared/components/BatchModeToggle.jsx'
import BatchQueue from '../../shared/components/BatchQueue.jsx'
import Button from '../../shared/components/Button.jsx'
import ToolLayout from '../../shared/components/ToolLayout.jsx'
import UploadBox from '../../shared/components/UploadBox.jsx'
import { useBatchRunner } from '../../shared/batch/useBatchRunner.js'
import { BATCH_MODES } from '../../shared/batch/batchMode.js'
import { changeSpeedForFile } from '../../shared/batch/speedJob.js'
import {
  MAX_SPEED,
  MIN_SPEED,
  SPEED_PRESETS,
  clampSpeed,
  estimateLength,
  getBlockingReason,
  getItemSpeed,
} from '../../shared/batch/speedBatch.js'
import { getMediaInfo } from '../../shared/media/mediaInfo.js'
import { isVideoFile } from '../../shared/utils/mediaFiles.js'
import { saveBlob } from '../../shared/utils/saveBlob.js'
import { createZipFromBlobs } from '../../shared/utils/zip.js'
import './batchSpeed.css'

function formatSpeed(speed) {
  return `${Number(speed.toFixed(2))}x`
}

function formatBytes(bytes) {
  return bytes >= 1073741824
    ? `${(bytes / 1073741824).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1048576))} MB`
}

function formatLength(seconds) {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Changes the speed of several videos in one queue, either with one speed for
 * all of them or a speed for each video.
 *
 * @param {{tool: object}} props Registry entry for this tool.
 * @returns {import('react').JSX.Element} Batch speed tool.
 */
function BatchSpeed({ tool }) {
  const [mode, setMode] = useState(BATCH_MODES.all)
  const [sharedSpeed, setSharedSpeed] = useState(1.5)
  const [itemSpeeds, setItemSpeeds] = useState({})
  const [keepAudioPitchNatural, setKeepAudioPitchNatural] = useState(true)
  const [removeAudio, setRemoveAudio] = useState(false)
  const [notice, setNotice] = useState('')
  const [zipping, setZipping] = useState(false)

  // Finished videos wait in this tab until the user saves them, one by one or
  // together in a ZIP. Removing a video frees its result.
  const { runner, items, running } = useBatchRunner(async (item, context) => {
    const speed = getItemSpeed({ mode, sharedSpeed, itemSpeeds, itemId: item.id })
    const output = await changeSpeedForFile(item.file, {
      speed,
      keepAudioPitchNatural,
      removeAudio,
      signal: context.signal,
      onProgress: context.onProgress,
    })
    return { filename: output.filename, speed, blob: output.blob }
  })

  const queued = items.filter((item) => item.status === 'queued').length
  const failed = items.filter((item) => item.status === 'failed' || item.status === 'cancelled').length
  const finished = items.filter((item) => item.status === 'done' && item.result?.blob)
  const done = finished.length
  const finishedBytes = finished.reduce((sum, item) => sum + item.result.blob.size, 0)
  const blocking = getBlockingReason({ items, mode, sharedSpeed, itemSpeeds })

  async function downloadZip() {
    setZipping(true)
    try {
      const zip = await createZipFromBlobs(
        finished.map((item) => ({ name: item.result.filename, blob: item.result.blob })),
      )
      saveBlob(zip, 'batch-speed.zip')
    } catch (zipError) {
      setNotice(zipError instanceof Error ? zipError.message : 'Could not make the ZIP.')
    } finally {
      setZipping(false)
    }
  }

  function speedOf(item) {
    return getItemSpeed({ mode, sharedSpeed, itemSpeeds, itemId: item.id })
  }

  function startNewBatch() {
    runner.clear()
    setItemSpeeds({})
    setNotice('')
  }

  async function addFiles(selected) {
    const videos = selected.filter(isVideoFile)
    const skipped = selected.length - videos.length
    if (videos.length === 0) {
      setNotice('Choose video files to continue.')
      return
    }
    const durations = {}
    await Promise.all(
      videos.map(async (file) => {
        try {
          const info = await getMediaInfo(file)
          if (info.duration > 0) durations[file.name] = info.duration
        } catch {
          // Length is optional; the limit just cannot count this file.
        }
      }),
    )
    const result = runner.add(videos, durations)
    setNotice(
      result.ok
        ? skipped > 0
          ? `${skipped} file${skipped === 1 ? ' was' : 's were'} skipped because ${skipped === 1 ? 'it is' : 'they are'} not video.`
          : ''
        : result.message,
    )
  }

  return (
    <ToolLayout tool={tool}>
      <div className="media-tool-app batch-speed">
        <section className="tool-panel" aria-label="Speed settings">
          <h2>Speed</h2>
          <BatchModeToggle mode={mode} disabled={running} onChange={setMode} />

          <p className="batch-speed-heading" aria-live="polite">
            {mode === BATCH_MODES.all
              ? <>Every video: <strong>{formatSpeed(sharedSpeed)}</strong></>
              : <>Starting speed for each video: <strong>{formatSpeed(sharedSpeed)}</strong> (change any video in the list)</>}
          </p>
          <div className="speed-presets" role="group" aria-label="Speed presets">
            {SPEED_PRESETS.map((preset) => (
              <button
                key={preset}
                className={`preset-button${sharedSpeed === preset ? ' preset-active' : ''}`}
                type="button"
                aria-pressed={sharedSpeed === preset}
                disabled={running}
                onClick={() => setSharedSpeed(preset)}
              >
                {formatSpeed(preset)}
              </button>
            ))}
          </div>
          <label className="speed-slider-label" htmlFor="batch-speed-slider">
            <span>Custom speed</span>
            <input
              id="batch-speed-slider"
              type="range"
              min={MIN_SPEED}
              max={MAX_SPEED}
              step="0.05"
              value={sharedSpeed}
              disabled={running}
              onChange={(event) => setSharedSpeed(clampSpeed(event.target.value, sharedSpeed))}
            />
            <span className="speed-slider-ends" aria-hidden="true">
              <span>0.25x</span>
              <span>4x</span>
            </span>
          </label>

          <label className="speed-checkbox">
            <input
              type="checkbox"
              checked={keepAudioPitchNatural}
              disabled={running || removeAudio}
              onChange={(event) => setKeepAudioPitchNatural(event.target.checked)}
            />
            <span>Keep audio pitch natural</span>
          </label>
          <label className="speed-checkbox">
            <input
              type="checkbox"
              checked={removeAudio}
              disabled={running}
              onChange={(event) => setRemoveAudio(event.target.checked)}
            />
            <span>Remove the audio</span>
          </label>
        </section>

        <section className="batch-upload" aria-label="Add videos">
          <UploadBox
            multiple
            onFileSelect={(file) => addFiles([file])}
            onFilesSelect={addFiles}
            title="Choose or drop several videos"
            helpText="Up to 10 videos, 30 minutes in total. They stay on this device."
            formats="MP4, MOV, WebM, MKV and more"
          />
          {notice && <p className="tool-error" role="alert">{notice}</p>}
        </section>

        {items.length > 0 && (
          <BatchQueue
            heading={`${items.length} ${items.length === 1 ? 'video' : 'videos'}${done > 0 ? ` · ${done} done` : ''}`}
            items={items}
            toolbar={
              running ? (
                <Button variant="outline" onClick={() => runner.stop()}>Stop</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={startNewBatch}>New batch</Button>
                  {failed > 0 && (
                    <Button variant="outline" onClick={() => runner.retryFailed()}>
                      Retry {failed} failed
                    </Button>
                  )}
                  {queued > 0 && (
                    <Button variant="primary" disabled={Boolean(blocking)} onClick={() => runner.start()}>
                      {done > 0 ? `Continue with ${queued} more` : 'Start changing speed'}
                    </Button>
                  )}
                  {done > 0 && (
                    <Button
                      variant={queued > 0 ? 'outline' : 'primary'}
                      disabled={zipping}
                      onClick={downloadZip}
                    >
                      {zipping ? 'Making ZIP…' : `Download all as ZIP (${done})`}
                    </Button>
                  )}
                </>
              )
            }
            notice={
              <>
                {blocking && !running && (
                  <p className="tool-notice" role="status">{blocking}</p>
                )}
                {done > 0 && (
                  <p className="batch-speed-memory">
                    Finished videos stay in this tab ({formatBytes(finishedBytes)}) until you save
                    them. Removing a video frees its space. Closing or refreshing the page loses them.
                  </p>
                )}
              </>
            }
            renderMeta={(item) => {
              const speed = speedOf(item)
              if (item.status === 'done') return ` · ${formatSpeed(item.result?.speed ?? speed)}`
              const length = estimateLength(item.duration, speed)
              return ` · ${formatSpeed(speed)}${length === null ? '' : ` → ${formatLength(length)}`}`
            }}
            renderActions={(item) => (
              <>
                {item.status === 'done' && item.result?.blob && (
                  <button
                    type="button"
                    aria-label={`Save ${item.result.filename}`}
                    onClick={() => saveBlob(item.result.blob, item.result.filename)}
                  >
                    Save video
                  </button>
                )}
                {(item.status === 'failed' || item.status === 'cancelled') && (
                  <button type="button" onClick={() => runner.retry(item.id)}>Retry</button>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  disabled={item.status === 'running'}
                  onClick={() => runner.remove(item.id)}
                >
                  Remove
                </button>
              </>
            )}
            renderExtra={(item) => {
              if (item.status === 'done') {
                return (
                  <p className="batch-speed-saved" role="status">
                    Ready: {item.result?.filename ?? 'a file'}
                    {item.result?.blob ? ` (${formatBytes(item.result.blob.size)})` : ''}
                  </p>
                )
              }
              if (mode !== BATCH_MODES.each || item.status === 'running') return null
              return (
                <label className="batch-speed-row" htmlFor={`speed-${item.id}`}>
                  <span>Speed for this video</span>
                  <input
                    id={`speed-${item.id}`}
                    type="range"
                    min={MIN_SPEED}
                    max={MAX_SPEED}
                    step="0.05"
                    value={speedOf(item)}
                    disabled={running}
                    aria-valuetext={formatSpeed(speedOf(item))}
                    onChange={(event) =>
                      setItemSpeeds((current) => ({
                        ...current,
                        [item.id]: clampSpeed(event.target.value, sharedSpeed),
                      }))
                    }
                  />
                  <strong>{formatSpeed(speedOf(item))}</strong>
                </label>
              )
            }}
          />
        )}
      </div>
    </ToolLayout>
  )
}

export default BatchSpeed
