import './mediaControls.css'

/**
 * Displays processing progress with an accessible label.
 *
 * @param {{percent: number | null, label?: string}} props Progress values. A null percent renders indeterminate progress.
 * @returns {import('react').JSX.Element} Progress indicator.
 */
function ProgressBar({ percent, label = 'Processing' }) {
  const hasPercent = Number.isFinite(percent)
  const safePercent = hasPercent
    ? Math.max(0, Math.min(100, percent))
    : undefined

  return (
    <div className="progress-container">
      <div className="progress-label">
        <span>{label}</span>
        <span>{hasPercent ? `${Math.round(safePercent)}%` : 'Working…'}</span>
      </div>
      <progress
        className="progress-bar"
        value={safePercent}
        max="100"
        aria-label={label}
      />
    </div>
  )
}

export default ProgressBar
