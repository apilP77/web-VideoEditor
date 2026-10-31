import './mediaControls.css'

/**
 * Displays processing progress with an accessible label.
 *
 * @param {{percent: number, label?: string}} props Progress values.
 * @returns {import('react').JSX.Element} Progress indicator.
 */
function ProgressBar({ percent, label = 'Processing' }) {
  const safePercent = Number.isFinite(percent)
    ? Math.max(0, Math.min(100, percent))
    : 0

  return (
    <div className="progress-container">
      <div className="progress-label">
        <span>{label}</span>
        <span>{Math.round(safePercent)}%</span>
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
