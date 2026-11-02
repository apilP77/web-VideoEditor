import { useEffect, useRef, useState } from 'react'
import Button from '../../shared/components/Button.jsx'
import CaptionStyleCard from '../../shared/components/CaptionStyleCard.jsx'
import UploadBox from '../../shared/components/UploadBox.jsx'
import ToolLayout from '../../shared/components/ToolLayout.jsx'
import { useBatchRunner } from '../../shared/batch/useBatchRunner.js'
import { createCaptionsForFile } from '../../shared/batch/captionJob.js'
import { renderCaptionedVideo } from '../../shared/batch/renderJob.js'
import { CAPTION_PACES } from '../../shared/captions/engine.js'
import { CAPTION_PRESETS, waitForCaptionFonts } from '../../shared/captions/styles.js'
import { createBatchCaptionStyle } from '../../shared/batch/batchStyle.js'
import { LANGUAGE_OPTIONS, MODEL_OPTIONS } from '../../shared/captions/options.js'
import { getMediaInfo } from '../../shared/media/mediaInfo.js'
import { isVideoFile } from '../../shared/utils/mediaFiles.js'
import { buildAllSubtitleFiles, buildSubtitleFile, SUBTITLE_FORMATS } from '../../shared/batch/subtitleFiles.js'
import { createZip } from '../../shared/utils/zip.js'
import { clearBatch, loadBatch, saveBatch, serializeBatch } from '../../shared/storage/batchStorage.js'
import ReviewPanel from './ReviewPanel.jsx'
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
  const [presetId, setPresetId] = useState(CAPTION_PRESETS[0].id)
  const [editingId, setEditingId] = useState(null)
  const style = createBatchCaptionStyle(presetId)
  const [fontsReady, setFontsReady] = useState(false)
  const [savedBatch, setSavedBatch] = useState(null)
  const hadItemsRef = useRef(false)

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

  const { runner, items, running } = useBatchRunner((item, context) =>
    createCaptionsForFile(item.file, {
      model,
      language,
      pace,
      signal: context.signal,
      onProgress: context.onProgress,
    }).then(({ captions, language: detected }) => ({
      captionCount: captions.length,
      language: detected,
      captions,
    })),
  )

  // Offer the last saved batch once, when the page opens.
  useEffect(() => {
    let active = true
    loadBatch()
      .then((batch) => {
        if (active && batch?.items?.length > 0) setSavedBatch(batch)
      })
      .catch((storageError) => {
        console.error('Could not read the saved batch.', storageError)
      })
    return () => {
      active = false
    }
  }, [])

  // Keep the batch saved as it changes. An empty list only clears storage
  // after the user has had items, so opening the page never wipes a saved batch.
  useEffect(() => {
    if (items.length === 0 && !hadItemsRef.current) return undefined
    const timer = window.setTimeout(() => {
      const save = items.length === 0
        ? clearBatch()
        : saveBatch(serializeBatch(items, { presetId, model, language, pace }))
      save.catch((storageError) => {
        console.error('Could not save the batch.', storageError)
      })
    }, 500)
    if (items.length > 0) hadItemsRef.current = true
    return () => window.clearTimeout(timer)
  }, [items, presetId, model, language, pace])

  // Videos are rendered one at a time and saved straight away, so only one
  // finished video is ever held in memory.
  const { runner: renderRunner, items: renderItems, running: rendering } = useBatchRunner(
    async (renderItem, context) => {
      const source = runner.getState().items.find((item) => item.file === renderItem.file)
      const output = await renderCaptionedVideo(
        renderItem.file,
        source?.result?.captions,
        style,
        { signal: context.signal, onProgress: context.onProgress },
      )
      saveBlob(output.blob, output.filename)
      return { filename: output.filename, processedWith: output.processedWith }
    },
  )

  const queued = items.filter((item) => item.status === 'queued').length
  const failed = items.filter(
    (item) => (item.status === 'failed' || item.status === 'cancelled') && item.file,
  ).length
  const missing = items.filter((item) => !item.file).length
  const done = items.filter((item) => item.status === 'done').length

  function downloadSubtitle(item, extension) {
    const file = buildSubtitleFile(item.name, item.result.captions, extension)
    saveBlob(new Blob([file.data], { type: file.mimeType }), file.name)
  }

  function renderOf(item) {
    return renderItems.find((entry) => entry.file === item.file)
  }

  function exportVideo(item) {
    const existing = renderOf(item)
    if (existing) renderRunner.remove(existing.id)
    renderRunner.add([item.file])
    renderRunner.start()
  }

  function exportAllVideos() {
    for (const item of items) {
      if (item.status !== 'done') continue
      const existing = renderOf(item)
      if (existing?.status === 'done' || existing?.status === 'queued' || existing?.status === 'running') continue
      if (existing) renderRunner.remove(existing.id)
      renderRunner.add([item.file])
    }
    renderRunner.start()
  }

  function changeCaption(item, index, caption) {
    const captions = item.result.captions.map((entry, position) => (position === index ? caption : entry))
    runner.updateResult(item.id, { ...item.result, captions })
  }

  function downloadAll() {
    saveBlob(createZip(buildAllSubtitleFiles(items)), 'batch-captions.zip')
  }

  function restoreBatch() {
    if (!savedBatch) return
    const saved = savedBatch.settings ?? {}
    if (CAPTION_PRESETS.some((preset) => preset.id === saved.presetId)) setPresetId(saved.presetId)
    if (saved.model) setModel(saved.model)
    if (saved.language) setLanguage(saved.language)
    if (saved.pace !== undefined) setPace(saved.pace)
    runner.restore(savedBatch.items)
    setSavedBatch(null)
    setNotice('')
  }

  function startNewBatch() {
    runner.clear()
    renderRunner.clear()
    setEditingId(null)
    setSavedBatch(null)
    setNotice('')
  }

  async function addFiles(selected) {
    const allVideos = selected.filter(isVideoFile)
    const skipped = selected.length - allVideos.length
    if (allVideos.length === 0) {
      setNotice('Choose video files to continue.')
      return
    }
    // Videos that match a restored item (same name and size) go back to it.
    const { attached, unmatched: videos } = runner.attachFiles(allVideos)
    if (videos.length === 0) {
      setNotice(`${attached} video${attached === 1 ? '' : 's'} matched your saved batch.`)
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
        ? attached > 0
          ? `${attached} video${attached === 1 ? '' : 's'} matched your saved batch; ${videos.length} added.`
          : skipped > 0
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

        <section className="batch-style tool-panel" aria-label="Caption style for every video">
          <h2>Caption style</h2>
          <p className="batch-style-help">
            Pick one style for every video. You can still correct words in each video's preview.
          </p>
          <div className="batch-style-grid" role="group" aria-label="Caption styles">
            {CAPTION_PRESETS.map((preset) => (
              <CaptionStyleCard
                key={preset.id}
                style={createBatchCaptionStyle(preset.id)}
                selected={preset.id === presetId}
                disabled={rendering}
                fontsReady={fontsReady}
                onSelect={() => setPresetId(preset.id)}
              />
            ))}
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

        {savedBatch && items.length === 0 && (
          <section className="batch-restore tool-panel" aria-label="Saved batch">
            <p>
              Last batch: {savedBatch.items.length}{' '}
              {savedBatch.items.length === 1 ? 'video' : 'videos'},{' '}
              {savedBatch.items.filter((item) => item.status === 'done').length} with captions.
              Videos are not kept after a refresh; drop them again to preview or export.
            </p>
            <div className="batch-queue-actions">
              <Button variant="primary" onClick={restoreBatch}>Restore last batch</Button>
              <Button variant="outline" onClick={startNewBatch}>Discard it</Button>
            </div>
          </section>
        )}

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
                    <Button variant="outline" disabled={rendering} onClick={startNewBatch}>
                      New batch
                    </Button>
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
                      <Button variant="outline" onClick={downloadAll}>
                        Subtitles ZIP ({done})
                      </Button>
                    )}
                    {done > 0 && (
                      <Button
                        variant={queued > 0 ? 'outline' : 'primary'}
                        disabled={rendering}
                        onClick={exportAllVideos}
                      >
                        Export all {done} videos
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            {missing > 0 && !running && (
              <p className="tool-notice" role="status">
                {missing} {missing === 1 ? 'video needs' : 'videos need'} to be added again
                (drop them above) before they can be previewed, exported or captioned.
                Subtitle downloads already work.
              </p>
            )}

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
                    {item.status === 'done' && item.result?.captions && item.file && (
                      <>
                        <button
                          type="button"
                          aria-expanded={editingId === item.id}
                          onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                        >
                          {editingId === item.id ? 'Close preview' : 'Preview and edit'}
                        </button>
                        <button
                          type="button"
                          disabled={running || renderOf(item)?.status === 'running'}
                          onClick={() => exportVideo(item)}
                        >
                          Export video
                        </button>
                      </>
                    )}
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
                  {(() => {
                    const render = item.status === 'done' ? renderOf(item) : null
                    if (!render) return null
                    if (render.status === 'failed') {
                      return (
                        <div className="batch-item-error" role="alert">
                          <p>Could not export this video: {render.error}</p>
                          {render.technicalDetails && (
                            <details>
                              <summary>Details</summary>
                              <pre>{render.technicalDetails}</pre>
                            </details>
                          )}
                        </div>
                      )
                    }
                    return (
                      <p className="batch-render-status" role="status">
                        {render.status === 'done'
                          ? `Video saved as ${render.result?.filename ?? 'a file'}`
                          : render.status === 'running'
                            ? `${render.stage || 'Adding captions'}${render.percent !== null ? ` · ${render.percent}%` : ''}`
                            : render.status === 'queued'
                              ? 'Waiting to export'
                              : 'Export stopped'}
                      </p>
                    )
                  })()}
                  {editingId === item.id && item.result?.captions && item.file && (
                    <ReviewPanel
                      file={item.file}
                      captions={item.result.captions}
                      style={style}
                      onCaptionChange={(index, caption) => changeCaption(item, index, caption)}
                      onClose={() => setEditingId(null)}
                    />
                  )}
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
