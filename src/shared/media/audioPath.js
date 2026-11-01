const AUDIO_ONLY_EXTENSIONS = /\.(aac|aif|aiff|flac|m4a|mp3|ogg|opus|wav|wma)$/iu
const MAX_BROWSER_DECODE_BYTES = 100 * 1024 * 1024

/**
 * Selects a safe local decode path without inspecting or decoding video tracks.
 *
 * @param {File} file Local audio or video file.
 * @returns {'browser' | 'ffmpeg'} Browser decoding is reserved for small audio-only files.
 */
export function chooseAudioDecodePath(file) {
  const isVideoMime = file?.type?.startsWith('video/')
  const isAudioOnly = !isVideoMime && (
    file?.type?.startsWith('audio/') ||
    AUDIO_ONLY_EXTENSIONS.test(file?.name ?? '')
  )

  return isAudioOnly && file.size <= MAX_BROWSER_DECODE_BYTES
    ? 'browser'
    : 'ffmpeg'
}
