import './mediaControls.css'

/**
 * Provides a keyboard-accessible file chooser and drag-and-drop target.
 *
 * @param {{onFileSelect: (file: File) => void, accept?: string, disabled?: boolean}} props Upload options.
 * @returns {import('react').JSX.Element} File selection control.
 */
function UploadBox({ onFileSelect, accept = 'video/*', disabled = false }) {
  function handleDrop(event) {
    event.preventDefault()
    if (!disabled && event.dataTransfer.files[0]) {
      onFileSelect(event.dataTransfer.files[0])
    }
  }

  return (
    <label
      className={`upload-box${disabled ? ' upload-box-disabled' : ''}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFileSelect(file)
          event.target.value = ''
        }}
      />
      <span className="upload-box-title">Choose or drop a video</span>
      <span className="upload-box-help">Your video stays on this device.</span>
    </label>
  )
}

export default UploadBox
