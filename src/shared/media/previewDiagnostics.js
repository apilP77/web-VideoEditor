/**
 * Collects what the browser reports about a preview video, for a
 * "Preview details" panel the user can copy into a bug report.
 *
 * @param {{video: HTMLVideoElement | null, canvas: HTMLCanvasElement | null, frame: HTMLElement | null, file: File, preview: object, extra?: object}} input
 *   Live elements, the source file, the usePreviewFallback result, and extra facts.
 * @returns {Record<string, unknown>} Plain, JSON-safe facts.
 */
export function collectPreviewDiagnostics({ video, canvas, frame, file, preview, extra = {} }) {
  return {
    file: { name: file?.name, type: file?.type || 'unknown', sizeMB: Number(((file?.size ?? 0) / 1048576).toFixed(1)) },
    source: preview.sourceInfo
      ? {
          codec: preview.sourceInfo.codec,
          width: preview.sourceInfo.width,
          height: preview.sourceInfo.height,
          duration: preview.sourceInfo.duration,
        }
      : null,
    previewState: {
      status: preview.status,
      frameAvailable: preview.frameAvailable,
      usingPreviewCopy: preview.usingProxy,
      showingPoster: preview.showPoster,
      message: preview.message || null,
    },
    videoElement: video
      ? {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          duration: Number.isFinite(video.duration) ? video.duration : String(video.duration),
          currentTime: video.currentTime,
          readyState: video.readyState,
          networkState: video.networkState,
          paused: video.paused,
          errorCode: video.error?.code ?? null,
          errorMessage: video.error?.message || null,
          canPlayType: file?.type ? video.canPlayType(file.type) || 'no' : 'unknown',
          clientWidth: video.clientWidth,
          clientHeight: video.clientHeight,
        }
      : null,
    overlayCanvas: canvas ? { width: canvas.width, height: canvas.height } : null,
    frameBox: frame ? { clientWidth: frame.clientWidth, clientHeight: frame.clientHeight } : null,
    technicalDetails: preview.technicalDetails || null,
    userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
    ...extra,
  }
}
