import { useState } from 'react'
import Button from '../../shared/components/Button.jsx'
import UploadBox from '../../shared/components/UploadBox.jsx'
import ToolLayout from '../../shared/components/ToolLayout.jsx'
import { useBatchRunner } from '../../shared/batch/useBatchRunner.js'
import { createCaptionsForFile } from '../../shared/batch/captionJob.js'
import { CAPTION_PACES } from '../../shared/captions/engine.js'
import { LANGUAGE_OPTIONS, MODEL_OPTIONS } from '../../shared/captions/options.js'
import { getMediaInfo } from '../../shared/media/mediaInfo.js'
import { isVideoFile } from '../../shared/utils/mediaFiles.js'
import { buildAllSubtitleFiles, buildSubtitleFile, SUBTITLE_FORMATS } from '../../shared/batch/subtitleFiles.js'
import { createZip } from '../../shared/utils/zip.js'
import './batchCaptions.css'

const STATUS_LABELS = {
  queued: 'Waiting',
  running: 'Working',
  done: 'Captions ready',
  failed: 'Failed',
  cancelled: 'Stopped',
}

function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function formatSize(bytes) {
  return bytes >= 1073741824
    ? `${(bytes / 1073741824).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1048576))} MB`
}

function formatLength(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Captions several videos in one queue with shared speech settings.
 *
 * Each video is transcribed in turn; a failure never stops the rest.
 *
 * @param {{tool: object}} props Registry entry for this tool.
 * @returns {import('react').JSX.Element} Batch captions tool.
 */
function BatchCaptions({ tool }) {
  const [model, setModel] = useState('balanced')
  const [language, setLanguage] = useState('auto')
  const [pace, setPace] = useState(5)
  const [notice, setNotice] = useState('')

  const { runner, items, running } = useBatchRunner((item, context) =>
    createCaptionsForFile(item.file, {
      model,
      language,
      pace,
      signal: context.signal,
      onProgress: context.onProgress,
    }).then(({ words, captions, language: detected }) => ({
      wordCount: words.length,
      captionCount: captions.length,
      language: detected,
      words,
      captions,
    })),
  )

  const queued = items.filter((item) => item.status === 'queued').length
  const failed = items.filter((item) => item.status === 'failed' || item.status === 'cancelled').length
  const done = items.filter((item) => item.status === 'done').length

  function downloadSubtitle(item, extension) {
    const file = buildSubtitleFile(item.name, item.result.captions, extension)
    saveBlob(new Blob([file.data], { type: file.mimeType }), file.name)
  }

  function downloadAll() {
    saveBlob(createZip(buildAllSubtitleFiles(items)), 'batch-captions.zip')
  }

  async function addFiles(selected) {
    const videos = selected.filter(isVideoFile)
    const skipped = selected.length - videos.length
    if (videos.length === 0) {
      setNotice('Choose video files to continue.')
      return
    }
    // Lengths are read first so the total-length limit can be checked.
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
      <div className="media-tool-app batch-captions">
        <section className="batch-settings tool-panel" aria-label="Caption settings for every video">
          <h2>Settings for every video</h2>
          <div className="batch-settings-grid">
            <label className="captions-field" htmlFor="batch-model">
              Model
              <select
                id="batch-model"
                value={model}
                disabled={running}
                onChange={(event) => setModel(event.target.value)}
              >
                {MODEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="captions-field" htmlFor="batch-language">
              Language
              <select
                id="batch-language"
                value={language}
                disabled={running}
                onChange={(event) => setLanguage(event.target.value)}
              >
                {LANGUAGE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="captions-field" htmlFor="batch-pace">
              Pace
              <select
                id="batch-pace"
                value={String(pace)}
                disabled={running}
                onChange={(event) => {
                  const value = event.target.value
                  setPace(value === 'sentence' ? value : Number(value))
                }}
              >
                {CAPTION_PACES.map((option) => (
                  <option key={option.value} value={String(option.value)}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
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
          <section className="batch-queue tool-panel" aria-label="Queue">
            <div className="batch-queue-heading">
              <h2>
                {items.length} {items.length === 1 ? 'video' : 'videos'}
                {done > 0 ? ` · ${done} done` : ''}
              </h2>
              <div className="batch-queue-actions">
                {running ? (
                  <Button variant="outline" onClick={() => runner.stop()}>Stop</Button>
                ) : (
                  <>
                    {failed > 0 && (
                      <Button variant="outline" onClick={() => runner.retryFailed()}>
                        Retry {failed} failed
                      </Button>
                    )}
                    {queued > 0 && (
                      <Button variant="primary" onClick={() => runner.start()}>
                        {done > 0 ? `Continue with ${queued} more` : 'Start captions'}
                      </Button>
                    )}
                    {done > 0 && (
                      <Button variant={queued > 0 ? 'outline' : 'primary'} onClick={downloadAll}>
                        Download all ({done}) as ZIP
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            <ol className="batch-list">
              {items.map((item) => (
                <li key={item.id} className={`batch-item is-${item.status}`}>
                  <div className="batch-item-main">
                    <strong className="batch-item-name">{item.name}</strong>
                    <span className="batch-item-meta">
                      {formatSize(item.size)}
                      {formatLength(item.duration) && ` · ${formatLength(item.duration)}`}
                      {item.status === 'done' && item.result
                        ? ` · ${item.result.captionCount} captions`
                        : ''}
                    </span>
                  </div>
                  <div className="batch-item-status">
                    <span className="batch-item-label">
                      {item.status === 'running' && item.stage
                        ? item.stage
                        : STATUS_LABELS[item.status]}
                    </span>
                    {item.status === 'running' && (
                      <span className="batch-item-bar" aria-hidden="true">
                        <span style={{ width: `${item.percent ?? 0}%` }} />
                      </span>
                    )}
                  </div>
                  <div className="batch-item-actions">
                    {item.status === 'done' && item.result?.captions &&
                      SUBTITLE_FORMATS.map((format) => (
                        <button
                          key={format.extension}
                          type="button"
                          aria-label={`Download ${format.label} for ${item.name}`}
                          onClick={() => downloadSubtitle(item, format.extension)}
                        >
                          {format.label}
                        </button>
                      ))}
                    {(item.status === 'failed' || item.status === 'cancelled') && item.file && (
                      <button type="button" onClick={() => runner.retry(item.id)}>Retry</button>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => runner.remove(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                  {item.error && (
                    <div className="batch-item-error" role="alert">
                      <p>{item.error}</p>
                      {item.technicalDetails && (
                        <details>
                          <summary>Details</summary>
                          <pre>{item.technicalDetails}</pre>
                        </details>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </ToolLayout>
  )
}

export default BatchCaptions
