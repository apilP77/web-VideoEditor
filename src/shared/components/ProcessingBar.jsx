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
 * @param {{percent: number | null, startedAt: number, progressUpdatedAt: number, onCancel: () => void}} props Export state and cancel handler.
 * @returns {import('react').JSX.Element} Shared export progress panel.
 */
function ProcessingBar({ percent, startedAt, progressUpdatedAt, onCancel }) {
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const waitingSince = progressUpdatedAt || startedAt
  const isStalled = now - waitingSince >= 15_000
  const label =
    percent === null
      ? 'Preparing video'
      : percent >= 98
        ? 'Finishing export'
        : 'Processing video'

  return (
    <section className="processing-bar" aria-label="Video export progress">
      <div className="processing-bar-main">
        <ProgressBar percent={percent} label={label} />
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
      {isStalled && (
        <p className="processing-stalled" role="status" aria-live="polite">
          Still working. Long or high-resolution videos take longer.
        </p>
      )}
    </section>
  )
}

export default ProcessingBar
