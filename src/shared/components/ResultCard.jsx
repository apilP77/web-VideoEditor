import { useState } from 'react'
import Button from './Button.jsx'
import './resultCard.css'

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(seconds) {
  const tenths = Math.max(0, Math.round(seconds * 10))
  const minutes = Math.floor(tenths / 600)
  const remaining = (tenths % 600) / 10
  return `${String(minutes).padStart(2, '0')}:${remaining.toFixed(1).padStart(4, '0')}`
}

/**
 * Displays a completed export beside its preview and download action.
 *
 * @param {{variant?: 'video' | 'content', heading?: string, children?: import('react').ReactNode, result?: {url: string, filename: string, blob: Blob, aspectRatio: number | string}, duration?: string, resolution?: string, processedWith?: string, cardRef?: import('react').RefObject<HTMLElement | null>, onDownload?: () => void, downloadVariant?: 'primary' | 'outline', saved?: boolean, settingsChanged?: boolean, highlighted?: boolean, previewSize?: 'compact' | 'large'}} props Result metadata, content, and actions.
 * @returns {import('react').JSX.Element} Compact video result card.
 */
function ResultCard({
  variant = 'video',
  heading = 'Your video is ready',
  children,
  result,
  duration,
  resolution,
  processedWith,
  cardRef,
  onDownload,
  downloadVariant = 'primary',
  saved,
  settingsChanged,
  highlighted,
  previewSize = 'compact',
}) {
  const [mediaInfo, setMediaInfo] = useState(null)

  if (variant === 'content') {
    return (
      <article
        ref={cardRef}
        className={`result-card result-card-content${highlighted ? ' result-card-highlighted' : ''}`}
        aria-labelledby="result-heading"
      >
        <div className="result-card-details">
          <header className="result-success-header" role="status" aria-live="polite">
            <svg
              aria-hidden="true"
              className="result-success-icon"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="m5 12.5 4.5 4.5L19 7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <h2 id="result-heading">{heading}</h2>
          </header>
          {children}
        </div>
      </article>
    )
  }

  const currentMediaInfo = mediaInfo?.url === result.url ? mediaInfo : null
  const aspectRatio = currentMediaInfo?.aspectRatio ?? `${result.aspectRatio} / 1`

  return (
    <article
      ref={cardRef}
      className={`result-card${highlighted ? ' result-card-highlighted' : ''}`}
      aria-labelledby="result-heading"
    >
      <video
        className={`result-card-video${previewSize === 'large' ? ' result-card-video-large' : ''}`}
        src={result.url}
        controls
        playsInline
        style={{ aspectRatio }}
        onLoadedMetadata={(event) => {
          setMediaInfo({
            url: result.url,
            duration: Number.isFinite(event.currentTarget.duration)
              ? formatDuration(event.currentTarget.duration)
              : duration,
            resolution: `${event.currentTarget.videoWidth} × ${event.currentTarget.videoHeight}`,
            aspectRatio: `${event.currentTarget.videoWidth} / ${event.currentTarget.videoHeight}`,
          })
        }}
      />

      <div className="result-card-details">
        <header className="result-success-header" role="status" aria-live="polite">
          <svg
            aria-hidden="true"
            className="result-success-icon"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="m5 12.5 4.5 4.5L19 7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h2 id="result-heading">
            {heading}
          </h2>
        </header>

        <dl className="result-info">
          <div>
            <dt>File</dt>
            <dd title={result.filename}>{result.filename}</dd>
          </div>
          <div>
            <dt>File size</dt>
            <dd>{formatFileSize(result.blob.size)}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{currentMediaInfo?.duration ?? duration}</dd>
          </div>
          <div>
            <dt>Resolution</dt>
            <dd>{currentMediaInfo?.resolution ?? resolution}</dd>
          </div>
          <div>
            <dt>Processed with</dt>
            <dd>{processedWith}</dd>
          </div>
        </dl>

        {settingsChanged && (
          <p className="result-settings-note" role="status" aria-live="polite">
            Settings changed. Export again to update this video.
          </p>
        )}

        <div className="result-actions">
          <Button
            variant={downloadVariant}
            className="result-download-button"
            onClick={onDownload}
            icon={
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
          >
            Download video
          </Button>
          <p className="result-saved-message" role="status" aria-live="polite">
            {saved ? 'Saved to your downloads' : ''}
          </p>
        </div>
        {children}
      </div>
    </article>
  )
}

export default ResultCard
