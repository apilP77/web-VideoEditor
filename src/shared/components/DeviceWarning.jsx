import './mediaControls.css'

/**
 * Warns that local video encoding is resource-intensive on mobile devices.
 *
 * @returns {import('react').JSX.Element} Device suitability notice.
 */
function DeviceWarning() {
  return (
    <aside className="device-warning" role="note">
      <strong>For best results, use desktop Chrome.</strong>
      <span>Video editing can use significant memory, especially on mobile devices.</span>
    </aside>
  )
}

export default DeviceWarning
