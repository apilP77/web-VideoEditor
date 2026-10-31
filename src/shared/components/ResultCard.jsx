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
 * Displays a completed video export as a separate success step.
 *
 * @param {{result: {url: string, filename: string, blob: Blob}, duration: string, resolution: string, processedWith: string, headingRef: import('react').RefObject<HTMLHeadingElement | null>, onDownload: () => void, onEditAgain: () => void, onStartOver: () => void, saved: boolean}} props Result metadata and actions.
 * @returns {import('react').JSX.Element} Video result screen.
 */
function ResultCard({
  result,
  duration,
  resolution,
  processedWith,
  headingRef,
  onDownload,
  onEditAgain,
  onStartOver,
  saved,
}) {
  const [mediaInfo, setMediaInfo] = useState(null)

  return (
    <main className="result-screen">
      <section className="result-card" aria-labelledby="result-heading" aria-live="polite">
        <header className="result-success-header">
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
          <h1 id="result-heading" ref={headingRef} tabIndex="-1">
            Your video is ready
          </h1>
        </header>

        <video
          className="result-card-video"
          src={result.url}
          controls
          playsInline
          onLoadedMetadata={(event) => {
            setMediaInfo({
              duration: Number.isFinite(event.currentTarget.duration)
                ? formatDuration(event.currentTarget.duration)
                : duration,
              resolution: `${event.currentTarget.videoWidth} × ${event.currentTarget.videoHeight}`,
            })
          }}
        />

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
            <dd>{mediaInfo?.duration ?? duration}</dd>
          </div>
          <div>
            <dt>Resolution</dt>
            <dd>{mediaInfo?.resolution ?? resolution}</dd>
          </div>
          <div>
            <dt>Processed with</dt>
            <dd>{processedWith}</dd>
          </div>
        </dl>

        <div className="result-actions">
          <Button
            variant="primary"
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
          <div className="result-secondary-actions">
            <Button variant="secondary" onClick={onEditAgain}>Edit again</Button>
            <Button variant="secondary" onClick={onStartOver}>Start over</Button>
          </div>
        </div>
      </section>
    </main>
  )
}

export default ResultCard
