import { BATCH_MODES } from '../batch/batchMode.js'
import './batchModeToggle.css'

const OPTIONS = [
  { value: BATCH_MODES.all, label: 'Same for all', help: 'One setting for every video.' },
  { value: BATCH_MODES.each, label: 'Each video separately', help: 'Set each video on its own.' },
]

/**
 * Chooses between one setting for every video and a setting per video.
 *
 * @param {{mode: string, onChange: (mode: string) => void, disabled?: boolean}} props Current mode and handler.
 * @returns {import('react').JSX.Element} Two-option radio group.
 */
function BatchModeToggle({ mode, onChange, disabled = false }) {
  return (
    <div className="batch-mode-toggle" role="radiogroup" aria-label="How to apply the settings">
      {OPTIONS.map((option) => (
        <label
          key={option.value}
          className={`batch-mode-option${mode === option.value ? ' is-selected' : ''}`}
        >
          <input
            type="radio"
            name="batch-mode"
            value={option.value}
            checked={mode === option.value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
          />
          <span className="batch-mode-label">{option.label}</span>
          <span className="batch-mode-help">{option.help}</span>
        </label>
      ))}
    </div>
  )
}

export default BatchModeToggle
