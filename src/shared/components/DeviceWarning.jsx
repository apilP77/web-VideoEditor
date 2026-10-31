import './mediaControls.css'

/**
 * Warns that local video encoding is resource-intensive on mobile devices.
 *
 * @param {{compact?: boolean}} props Whether to use the slim homepage style.
 * @returns {import('react').JSX.Element} Device suitability notice.
 */
function DeviceWarning({ compact = false }) {
  return (
    <aside
      className={`device-warning${compact ? ' device-warning-compact' : ''}`}
      role="note"
    >
      <strong>For best results, use desktop Chrome.</strong>
      <span>Video editing can use significant memory, especially on mobile devices.</span>
    </aside>
  )
}

export default DeviceWarning
