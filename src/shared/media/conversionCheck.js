/**
 * Explains why a Mediabunny conversion would lose the video picture.
 *
 * Mediabunny treats a conversion as valid when any track survives, so a video
 * the browser cannot decode (for example HEVC in some browsers) silently
 * becomes an audio-only file. Callers that need the picture must check this.
 *
 * @param {{isValid: boolean, utilizedTracks: Array<{isVideoTrack: () => boolean}>, discardedTracks: Array<{track: {isVideoTrack: () => boolean}, reason: string}>}} conversion
 *   An initialised Mediabunny conversion.
 * @returns {string} Empty when the video track is kept; otherwise the reason.
 */
export function getLostVideoReason(conversion) {
  if (conversion.isValid && conversion.utilizedTracks.some((track) => track.isVideoTrack())) {
    return ''
  }
  const videoReasons = conversion.discardedTracks
    .filter(({ track }) => track.isVideoTrack())
    .map(({ reason }) => reason)
  const reasons = videoReasons.length > 0
    ? videoReasons
    : conversion.discardedTracks.map(({ reason }) => reason)
  return reasons.filter(Boolean).join('; ') || 'no video track could be converted'
}
