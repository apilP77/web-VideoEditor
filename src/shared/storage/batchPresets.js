const STORAGE_KEY = 'web-video-toolkit-batch-presets'
const MAX_PRESETS = 12
const MAX_NAME_LENGTH = 40

/**
 * Keeps only the fields a batch preset can hold, with safe types.
 *
 * @param {unknown} value Any stored value.
 * @returns {{name: string, presetId: string, model: string, language: string, pace: number | string} | null}
 *   A clean preset, or null when the value is unusable.
 */
export function sanitizePreset(value) {
  if (!value || typeof value !== 'object') return null
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, MAX_NAME_LENGTH) : ''
  if (!name) return null
  if (typeof value.presetId !== 'string' || typeof value.model !== 'string' || typeof value.language !== 'string') {
    return null
  }
  const pace = value.pace === 'sentence' ? 'sentence' : Number(value.pace)
  if (pace !== 'sentence' && !Number.isFinite(pace)) return null
  return { name, presetId: value.presetId, model: value.model, language: value.language, pace }
}

/**
 * Adds a preset, or replaces the one with the same name (ignoring case).
 *
 * @param {object[]} presets Existing presets.
 * @param {object} preset New preset with a name and settings.
 * @returns {object[]} A new list, newest first, capped at the maximum count.
 */
export function upsertPreset(presets, preset) {
  const clean = sanitizePreset(preset)
  if (!clean) return presets
  const others = presets.filter((entry) => entry.name.toLowerCase() !== clean.name.toLowerCase())
  return [clean, ...others].slice(0, MAX_PRESETS)
}

/**
 * Removes the preset with the given name.
 *
 * @param {object[]} presets Existing presets.
 * @param {string} name Preset name.
 * @returns {object[]} A new list without that preset.
 */
export function removePreset(presets, name) {
  return presets.filter((entry) => entry.name !== name)
}

/**
 * Reads saved presets, dropping anything malformed.
 *
 * @returns {object[]} Saved presets, or an empty list.
 */
export function loadPresets() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.map(sanitizePreset).filter(Boolean).slice(0, MAX_PRESETS) : []
  } catch {
    return []
  }
}

/**
 * Stores the preset list locally.
 *
 * @param {object[]} presets Presets to keep.
 * @returns {void}
 */
export function savePresets(presets) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
  } catch (storageError) {
    console.error('Could not save batch presets.', storageError)
  }
}
