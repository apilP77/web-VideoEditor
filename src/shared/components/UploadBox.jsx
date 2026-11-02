import { Upload } from 'lucide-react'
import './mediaControls.css'

/**
 * Provides a keyboard-accessible file chooser and drag-and-drop target.
 *
 * @param {{onFileSelect: (file: File) => void, onFilesSelect?: (files: File[]) => void, multiple?: boolean, accept?: string, disabled?: boolean, title?: string, helpText?: string, formats?: string}} props Upload options.
 * @returns {import('react').JSX.Element} File selection control.
 */
function UploadBox({
  onFileSelect,
  onFilesSelect,
  multiple = false,
  accept = 'video/*',
  disabled = false,
  title = 'Choose or drop a video',
  helpText = 'Your video stays on this device.',
  formats = 'MP4, MOV, WebM, MKV, AVI and more',
}) {
  function handleDrop(event) {
    event.preventDefault()
    if (disabled || !event.dataTransfer.files[0]) return
    if (multiple && onFilesSelect) onFilesSelect([...event.dataTransfer.files])
    else onFileSelect(event.dataTransfer.files[0])
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
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          if (files.length > 0) {
            if (multiple && onFilesSelect) onFilesSelect(files)
            else onFileSelect(files[0])
          }
          event.target.value = ''
        }}
      />
      <span className="upload-box-icon" aria-hidden="true">
        <Upload size={23} strokeWidth={1.8} />
      </span>
      <span className="upload-box-title">{title}</span>
      <span className="upload-box-help">{helpText}</span>
      <span className="upload-box-formats">{formats}</span>
    </label>
  )
}

export default UploadBox
