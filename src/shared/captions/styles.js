/** Sample caption drawn on style cards. */
export const PREVIEW_CAPTION = {
  start: 0,
  end: 3,
  words: [
    { word: 'Make', start: 0, end: 0.6 },
    { word: 'every', start: 0.6, end: 1.2 },
    { word: 'moment', start: 1.2, end: 2 },
    { word: 'count.', start: 2, end: 2.8 },
  ],
}

export const CAPTION_PRESETS = [
  {
    id: 'classic',
    name: 'Classic',
    style: {
      fontFamily: 'Inter',
      fontWeight: 700,
      size: 100,
      position: 12,
      allCaps: false,
      textColor: '#ffffff',
      highlightColor: '#ffe066',
      backgroundColor: '#08080b',
      backgroundOpacity: 78,
      strokeWidth: 0,
      strokeColor: '#000000',
      shadow: true,
      glow: false,
      animation: 'none',
      animationSpeed: 1,
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    style: {
      fontFamily: 'Poppins',
      fontWeight: 600,
      size: 100,
      position: 12,
      allCaps: false,
      textColor: '#ffffff',
      highlightColor: '#b6f09c',
      backgroundColor: '#08080b',
      backgroundOpacity: 0,
      strokeWidth: 0,
      strokeColor: '#000000',
      shadow: true,
      glow: false,
      animation: 'fade',
      animationSpeed: 1,
    },
  },
  {
    id: 'bold',
    name: 'Bold',
    style: {
      fontFamily: 'Anton',
      fontWeight: 800,
      size: 115,
      position: 12,
      allCaps: true,
      textColor: '#ffffff',
      highlightColor: '#ffcb45',
      backgroundColor: '#08080b',
      backgroundOpacity: 0,
      strokeWidth: 4,
      strokeColor: '#08080b',
      shadow: true,
      glow: false,
      animation: 'pop',
      animationSpeed: 1,
    },
  },
  {
    id: 'highlight',
    name: 'Highlight',
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 800,
      size: 105,
      position: 12,
      allCaps: false,
      textColor: '#ffffff',
      highlightColor: '#a4ff79',
      backgroundColor: '#08080b',
      backgroundOpacity: 72,
      strokeWidth: 0,
      strokeColor: '#000000',
      shadow: true,
      glow: false,
      animation: 'reveal',
      animationSpeed: 1,
    },
  },
  {
    id: 'pill',
    name: 'Pill',
    style: {
      fontFamily: 'Inter',
      fontWeight: 800,
      size: 100,
      position: 12,
      allCaps: false,
      textColor: '#ffffff',
      highlightColor: '#a78bfa',
      backgroundColor: '#08080b',
      backgroundOpacity: 0,
      strokeWidth: 0,
      strokeColor: '#000000',
      shadow: false,
      glow: false,
      animation: 'bounce',
      animationSpeed: 1,
    },
  },
  {
    id: 'outline',
    name: 'Outline',
    style: {
      fontFamily: 'Bebas Neue',
      fontWeight: 700,
      size: 120,
      position: 12,
      allCaps: true,
      textColor: '#ffffff',
      highlightColor: '#ffffff',
      backgroundColor: '#08080b',
      backgroundOpacity: 0,
      strokeWidth: 3,
      strokeColor: '#111111',
      shadow: false,
      glow: false,
      animation: 'slide-up',
      animationSpeed: 1,
    },
  },
  {
    id: 'neon',
    name: 'Neon',
    style: {
      fontFamily: 'Montserrat',
      fontWeight: 800,
      size: 95,
      position: 12,
      allCaps: true,
      textColor: '#f5f0ff',
      highlightColor: '#ff77e9',
      backgroundColor: '#08080b',
      backgroundOpacity: 0,
      strokeWidth: 1,
      strokeColor: '#3e1647',
      shadow: false,
      glow: true,
      animation: 'shake-on-emphasis',
      animationSpeed: 1,
    },
  },
  {
    id: 'block',
    name: 'Block',
    style: {
      fontFamily: 'Anton',
      fontWeight: 800,
      size: 100,
      position: 12,
      allCaps: true,
      textColor: '#ffffff',
      highlightColor: '#151515',
      backgroundColor: '#34215f',
      backgroundOpacity: 100,
      strokeWidth: 0,
      strokeColor: '#000000',
      shadow: false,
      glow: false,
      animation: 'typewriter',
      animationSpeed: 1,
    },
  },
]

export const CAPTION_ANIMATIONS = [
  { id: 'none', name: 'None' },
  { id: 'bounce', name: 'Bounce' },
  { id: 'pop', name: 'Pop' },
  { id: 'fade', name: 'Fade' },
  { id: 'reveal', name: 'Reveal' },
  { id: 'slide-up', name: 'Slide up' },
  { id: 'typewriter', name: 'Typewriter' },
  { id: 'shake-on-emphasis', name: 'Shake' },
]

export const CAPTION_FONTS = [
  { name: 'Inter', family: 'Inter, sans-serif' },
  { name: 'Poppins', family: 'Poppins, sans-serif' },
  { name: 'Montserrat', family: 'Montserrat, sans-serif' },
  { name: 'Bebas Neue', family: '"Bebas Neue", sans-serif' },
  { name: 'Anton', family: 'Anton, sans-serif' },
  { name: 'Caveat', family: 'Caveat, cursive' },
]

/**
 * Builds a complete caption style from a preset and optional overrides.
 *
 * @param {string} preset Preset identifier.
 * @param {object} overrides Style values to override.
 * @returns {object} Plain-data caption style model.
 */
export function createCaptionStyle(preset = 'classic', overrides = {}) {
  const selected = CAPTION_PRESETS.find((item) => item.id === preset) ?? CAPTION_PRESETS[0]
  return {
    ...selected.style,
    ...overrides,
    preset: overrides.preset ?? selected.id,
  }
}

/**
 * Returns black or white text for readable contrast on a color.
 *
 * @param {string} color Hex color.
 * @returns {string} High-contrast black or white.
 */
export function getContrastingTextColor(color) {
  const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu.exec(color)
  if (!match) return '#ffffff'
  const channels = match.slice(1).map((channel) => Number.parseInt(channel, 16) / 255)
  const luminance = channels
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
  return luminance > 0.42 ? '#101014' : '#ffffff'
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

function easeOutCubic(value) {
  return 1 - (1 - value) ** 3
}

function easeOutBack(value) {
  const overshoot = 1.70158
  return 1 + (1 + overshoot) * (value - 1) ** 3 + overshoot * (value - 1) ** 2
}

/**
 * Computes caption/word animation values from elapsed time without side effects.
 *
 * @param {string} animation Animation identifier.
 * @param {number} elapsedSeconds Time since caption or word start.
 * @param {{speed?: number, wordIndex?: number, characterIndex?: number}} options Animation tuning.
 * @returns {{opacity: number, scale: number, offsetY: number, rotation: number, visible: boolean}} Eased drawing state.
 */
export function getCaptionAnimationState(
  animation,
  elapsedSeconds,
  { speed = 1, wordIndex = 0, characterIndex = 0 } = {},
) {
  const time = Math.max(0, elapsedSeconds) * Math.max(0.1, speed)
  const progress = clamp(time / 0.42, 0, 1)
  const base = { opacity: 1, scale: 1, offsetY: 0, rotation: 0, visible: true }

  switch (animation) {
    case 'bounce':
      return { ...base, offsetY: -Math.sin(Math.PI * progress) * (1 - progress) * 18 }
    case 'pop':
      return { ...base, scale: clamp(0.72 + easeOutBack(progress) * 0.28, 0.65, 1.12) }
    case 'fade':
      return { ...base, opacity: easeOutCubic(progress) }
    case 'reveal':
      return { ...base, visible: time >= wordIndex * 0.12 }
    case 'slide-up':
      return { ...base, offsetY: (1 - easeOutCubic(progress)) * 24 }
    case 'typewriter':
      return { ...base, visible: time * 18 >= characterIndex }
    case 'shake-on-emphasis':
      return {
        ...base,
        rotation: time < 0.3 ? Math.sin(time * 48) * 0.045 * (1 - time / 0.3) : 0,
      }
    default:
      return base
  }
}

/**
 * Loads all locally bundled caption fonts before canvas rendering begins.
 *
 * @returns {Promise<void>} Resolves when the bundled font faces are ready.
 */
export async function waitForCaptionFonts() {
  if (typeof document === 'undefined' || !document.fonts) return
  await Promise.all(
    CAPTION_FONTS.map((font) => document.fonts.load(`700 32px "${font.name}"`)),
  )
  await document.fonts.ready
}
