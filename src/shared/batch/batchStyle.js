import { createCaptionStyle } from '../captions/styles.js'

/** Text size every batch caption uses (percent of the standard size). */
export const BATCH_TEXT_SIZE = 68

/** Highlight colour of the first preset, matching the reference look. */
const BATCH_BLUE = '#1f6bff'

/**
 * Builds the caption style used for every video in a batch: one font and size
 * for all presets, white text with a soft shadow and no box, and a rounded box
 * behind the word being spoken. The preset only chooses the highlight colour
 * and the animation.
 *
 * The same style feeds the style cards, the preview and the export.
 *
 * @param {string} presetId Chosen preset identifier.
 * @returns {object} Complete caption style model.
 */
export function createBatchCaptionStyle(presetId) {
  const chosen = createCaptionStyle(presetId)
  return {
    ...createCaptionStyle('pill'),
    preset: 'pill',
    fontFamily: 'Poppins',
    fontWeight: 700,
    size: BATCH_TEXT_SIZE,
    textColor: '#ffffff',
    shadow: true,
    highlightColor: presetId === 'classic' ? BATCH_BLUE : chosen.highlightColor,
    animation: chosen.animation,
    animationSpeed: chosen.animationSpeed,
  }
}
