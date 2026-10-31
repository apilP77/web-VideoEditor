const VIDEO_EXTENSION = /\.(mp4|m4v|mov|webm|mkv|avi|ogv)$/i

/**
 * Checks whether a selected local file is identified as a video.
 *
 * @param {File} file Candidate local file.
 * @returns {boolean} Whether the MIME type or filename identifies a video.
 */
export function isVideoFile(file) {
  return Boolean(
    file &&
      (file.type.startsWith('video/') || VIDEO_EXTENSION.test(file.name)),
  )
}
