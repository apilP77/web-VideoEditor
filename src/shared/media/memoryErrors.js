const OUT_OF_MEMORY_PATTERN =
  /out of memory|\bOOM\b|memory access out of bounds|allocation failed|cannot enlarge memory|could not allocate|cannot allocate|ENOMEM|Array buffer allocation/i

/**
 * Whether an error looks like the browser or FFmpeg ran out of memory.
 *
 * @param {unknown} error Error, message or log text.
 * @returns {boolean} True for known out-of-memory messages.
 */
export function isOutOfMemoryError(error) {
  const text = [
    error instanceof Error ? error.message : String(error ?? ''),
    error?.technicalDetails ?? '',
    error?.cause instanceof Error ? error.cause.message : '',
  ].join('\n')
  return OUT_OF_MEMORY_PATTERN.test(text)
}

export const PREVIEW_COPY_MEMORY_MESSAGE =
  'Your device ran out of memory making a preview copy of this large video. The original file is still used for everything else. To preview it, close other tabs and try again, or convert it to a 1080p H.264 MP4 first.'

export const EXPORT_MEMORY_MESSAGE =
  'Your device ran out of memory processing this large video. Close other tabs and try again, export a shorter section, or convert it to a 1080p H.264 MP4 first.'
