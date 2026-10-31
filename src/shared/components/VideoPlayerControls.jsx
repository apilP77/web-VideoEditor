/**
 * Renders shared playback and seeking controls for a video preview.
 *
 * @param {{currentTime: number, duration: number, isPlaying: boolean, disabled?: boolean, rightLabel?: string, onPlayPause: () => void, onSeek: (time: number) => void}} props Player state and handlers.
 * @returns {import('react').JSX.Element} Video playback controls.
 */
function VideoPlayerControls({
  currentTime,
  duration,
  isPlaying,
  disabled = false,
  rightLabel,
  onPlayPause,
  onSeek,
}) {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 1
  const safeCurrentTime = Number.isFinite(currentTime)
    ? Math.max(0, Math.min(currentTime, safeDuration))
    : 0

  return (
    <>
      <div className="preview-controls">
        <button
          className="secondary-button"
          type="button"
          aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
          disabled={disabled}
          onClick={onPlayPause}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <div className="time-label-row" aria-live="off">
          <span>{formatTime(safeCurrentTime)}</span>
          <span>{formatTime(safeDuration === 1 && duration <= 0 ? 0 : duration)}</span>
        </div>
        {rightLabel && <span className="player-extra-label">{rightLabel}</span>}
      </div>
      <label className="seek-control">
        <span className="visually-hidden">Seek video</span>
        <input
          type="range"
          min="0"
          max={safeDuration}
          step="0.05"
          value={safeCurrentTime}
          aria-label="Seek video"
          disabled={disabled}
          onChange={(event) => onSeek(Number(event.target.value))}
        />
      </label>
    </>
  )
}

function formatTime(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const tenths = Math.round(safeSeconds * 10)
  const minutes = Math.floor(tenths / 600)
  const remaining = (tenths % 600) / 10
  return `${String(minutes).padStart(2, '0')}:${remaining.toFixed(1).padStart(4, '0')}`
}

export default VideoPlayerControls
