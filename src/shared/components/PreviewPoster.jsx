import { useEffect, useState } from 'react'
import { Film, VideoOff } from 'lucide-react'
import { describeCodec } from '../media/previewFrame.js'
import { getMonotonicTime } from '../utils/timing.js'
import './previewPoster.css'

function formatElapsed(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function useElapsed(startedAt, running) {
  const [now, setNow] = useState(() => getMonotonicTime())
  useEffect(() => {
    if (!running) return undefined
    const timer = window.setInterval(() => setNow(getMonotonicTime()), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  return running && startedAt ? now - startedAt : 0
}

/**
 * Shown over the preview when the browser cannot draw the video's picture,
 * instead of a bare black frame. Explains why, shows preview-copy progress,
 * and reassures that the original file is still used.
 *
 * @param {{fileName: string, codec?: string | null, status: string, progress?: number | null, startedAt?: number, message?: string, technicalDetails?: string, note?: string, onCancel?: () => void}} props
 *   Preview fallback state from usePreviewFallback, plus a tool-specific note.
 * @returns {import('react').JSX.Element} Poster card overlay.
 */
function PreviewPoster({
  fileName,
  codec,
  status,
  progress = null,
  startedAt = 0,
  message,
  technicalDetails,
  note,
  onCancel,
}) {
  const converting = status === 'converting'
  const unavailable = status === 'failed' || status === 'unavailable'
  const elapsed = useElapsed(startedAt, converting)
  const codecLabel = describeCodec(codec)
  const title = converting
    ? 'Making a preview copy'
    : unavailable
      ? 'Preview not available'
      : 'Checking the picture…'

  return (
    <div className={`preview-poster is-${unavailable ? 'failed' : status}`} role="status" aria-live="polite">
      <div className="preview-poster-card">
        <span className="preview-poster-icon" aria-hidden="true">
          {unavailable ? <VideoOff size={22} /> : <Film size={22} />}
        </span>
        <strong className="preview-poster-title">{title}</strong>
        <span className="preview-poster-file">
          {fileName}
          {codecLabel ? ` · ${codecLabel}` : ''}
        </span>
        {message && <p className="preview-poster-message">{message}</p>}
        {converting && (
          <>
            <p className="preview-poster-message">
              Converting a small 960px copy on your device so you can watch it here.
            </p>
            <span
              className={`preview-poster-bar${Number.isFinite(progress) ? '' : ' is-indeterminate'}`}
              aria-hidden="true"
            >
              <span style={Number.isFinite(progress) ? { width: `${progress}%` } : undefined} />
            </span>
            <span className="preview-poster-meta">
              {Number.isFinite(progress) ? `${Math.round(progress)}% · ` : ''}
              {formatElapsed(elapsed)} elapsed
            </span>
            {onCancel && (
              <button type="button" className="preview-poster-cancel" onClick={onCancel}>
                Skip preview
              </button>
            )}
          </>
        )}
        {note && <p className="preview-poster-note">{note}</p>}
        {technicalDetails && status === 'failed' && (
          <details className="preview-poster-details">
            <summary>Details</summary>
            <pre>{technicalDetails}</pre>
          </details>
        )}
      </div>
    </div>
  )
}

/**
 * Small badge over a playing preview while a lighter preview copy of a
 * large (for example 4K) video is prepared in the background.
 *
 * @param {{progress?: number | null, onCancel?: () => void}} props Copy progress and cancel action.
 * @returns {import('react').JSX.Element} Badge overlay.
 */
export function PreviewCopyBadge({ progress = null, onCancel }) {
  return (
    <div className="preview-copy-badge" role="status">
      <span>
        Making a lighter preview copy for this large video
        {Number.isFinite(progress) ? ` · ${Math.round(progress)}%` : ''}
      </span>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          Skip
        </button>
      )}
    </div>
  )
}

export default PreviewPoster
