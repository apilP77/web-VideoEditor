import { useEffect, useRef } from 'react'
import { drawCaption, getCenteredPosition } from '../captions/renderer.js'
import { CAPTION_PRESETS, PREVIEW_CAPTION } from '../captions/styles.js'
import './captionStyleCard.css'

/**
 * A clickable card showing a sample caption drawn in one caption style.
 *
 * @param {{style: object, label?: string, selected: boolean, onSelect: () => void, disabled?: boolean, fontsReady: boolean}} props
 *   Full caption style to draw, selection state, and handlers. Drawing waits
 *   for `fontsReady` so the sample uses the real fonts.
 * @returns {import('react').JSX.Element} Style card button.
 */
function CaptionStyleCard({ style, label, selected, onSelect, disabled = false, fontsReady }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !fontsReady) return
    const context = canvas.getContext('2d')
    if (!context) return
    // Centre the sample in the card; real captions keep the style's position.
    const centred = { ...style, position: getCenteredPosition(style, canvas.height) }
    drawCaption(context, PREVIEW_CAPTION, 1.5, centred, canvas.width, canvas.height)
  }, [fontsReady, style])

  return (
    <button
      className={`caption-style-card${selected ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
    >
      <canvas ref={canvasRef} width="240" height="135" aria-hidden="true" />
      <span>{label ?? CAPTION_PRESETS.find((preset) => preset.id === style.preset)?.name}</span>
    </button>
  )
}

export default CaptionStyleCard
