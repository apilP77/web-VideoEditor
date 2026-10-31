import { useEffect, useState } from 'react'
import Button from './Button.jsx'
import ProgressBar from './ProgressBar.jsx'
import './processingBar.css'

function formatElapsed(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * Shows honest progress, elapsed time, and a cancel action for video exports.
 *
 * @param {{percent: number | null, startedAt: number, progressUpdatedAt: number, onCancel: () => void, label?: string, detail?: string}} props Processing state and cancel handler.
 * @returns {import('react').JSX.Element} Shared export progress panel.
 */
function ProcessingBar({
  percent,
  startedAt,
  progressUpdatedAt,
  onCancel,
  label,
  detail,
}) {
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const waitingSince = progressUpdatedAt || startedAt
  const isStalled = now - waitingSince >= 15_000
  const progressLabel =
    label ??
    (percent === null
      ? 'Preparing video'
      : percent >= 98
        ? 'Finishing export'
        : 'Processing video')

  return (
    <section className="processing-bar" aria-label="Processing progress">
      <div className="processing-bar-main">
        <ProgressBar percent={percent} label={progressLabel} />
        <p className="processing-elapsed" aria-live="off">
          Elapsed: {formatElapsed(Math.max(0, now - startedAt))}
        </p>
        <Button
          variant="secondary"
          className="processing-cancel"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
      {detail && (
        <p className="processing-detail" role="status" aria-live="polite">
          {detail}
        </p>
      )}
      {isStalled && (
        <p className="processing-stalled" role="status" aria-live="polite">
          Still working. Long or high-resolution videos take longer.
        </p>
      )}
    </section>
  )
}

export default ProcessingBar
