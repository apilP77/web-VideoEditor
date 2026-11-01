/**
 * Combines what the browser's <video> element reports with what was read
 * from the file itself.
 *
 * Browsers often cannot decode a video's picture (for example iPhone
 * HEVC/H.265 on many Windows PCs) and then report a width of 0, and WebM
 * recordings often report an infinite duration. The file's own metadata is
 * used to fill those gaps so the tool can still be used and exported.
 *
 * @param {{videoWidth: number, videoHeight: number, duration: number} | null} video
 *   Loaded video element, or null if it has not loaded or failed.
 * @param {{width?: number, height?: number, duration?: number} | null} fileInfo
 *   Metadata read from the file, if available.
 * @returns {{valid: boolean, width: number, height: number, duration: number, pictureVisible: boolean | null}}
 *   Usable size and duration, and whether the browser can show the picture
 *   (null when the video element has not reported yet).
 */
export function resolveVideoMetadata(video, fileInfo) {
  const videoHasPicture = Boolean(video && video.videoWidth >= 2 && video.videoHeight >= 2)
  const videoHasDuration = Boolean(
    video && Number.isFinite(video.duration) && video.duration > 0,
  )

  const width = videoHasPicture ? video.videoWidth : (fileInfo?.width ?? 0)
  const height = videoHasPicture ? video.videoHeight : (fileInfo?.height ?? 0)
  const duration = videoHasDuration ? video.duration : (fileInfo?.duration ?? 0)

  return {
    valid: width >= 2 && height >= 2 && Number.isFinite(duration) && duration > 0,
    width,
    height,
    duration,
    pictureVisible: video ? videoHasPicture : null,
  }
}
