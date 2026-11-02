/** Whisper model choices shown to the user. */
export const MODEL_OPTIONS = [
  { value: 'fast', label: 'Fast · tiny · about 60–200 MB' },
  { value: 'balanced', label: 'Balanced · base · about 110–360 MB' },
  { value: 'accurate', label: 'Accurate · small · about 300 MB–1 GB' },
]
/** Spoken-language choices; "auto" lets Whisper detect it. */
export const LANGUAGE_OPTIONS = [
  ['auto', 'Auto-detect'],
  ['english', 'English'],
  ['spanish', 'Spanish'],
  ['french', 'French'],
  ['german', 'German'],
  ['italian', 'Italian'],
  ['portuguese', 'Portuguese'],
  ['dutch', 'Dutch'],
  ['russian', 'Russian'],
  ['japanese', 'Japanese'],
  ['korean', 'Korean'],
  ['chinese', 'Chinese'],
  ['arabic', 'Arabic'],
  ['hindi', 'Hindi'],
  ['turkish', 'Turkish'],
  ['ukrainian', 'Ukrainian'],
  ['vietnamese', 'Vietnamese'],
  ['thai', 'Thai'],
  ['swedish', 'Swedish'],
]
