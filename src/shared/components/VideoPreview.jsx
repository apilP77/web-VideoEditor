import './videoPreview.css'

/**
 * Renders a visible local video inside the shared responsive preview frame.
 *
 * @param {{src?: string, videoRef?: import('react').RefObject<HTMLVideoElement | null>, frameRef?: import('react').RefObject<HTMLDivElement | null>, frameClassName?: string, videoClassName?: string, frameStyle?: import('react').CSSProperties, videoStyle?: import('react').CSSProperties, frameProps?: import('react').HTMLAttributes<HTMLDivElement>, videoProps?: import('react').VideoHTMLAttributes<HTMLVideoElement>, children?: import('react').ReactNode}} props Preview source, refs, styling, events, and optional transparent overlay layers.
 * @returns {import('react').JSX.Element} Video preview with an always-visible video element.
 */
function VideoPreview({
  src,
  videoRef,
  frameClassName = '',
  videoClassName = '',
  frameRef,
  frameStyle,
  videoStyle,
  frameProps = {},
  videoProps = {},
  children,
}) {
  const { className: framePropClassName, ...restFrameProps } = frameProps
  const { className: videoPropClassName, ...restVideoProps } = videoProps

  return (
    <div
      {...restFrameProps}
      ref={frameRef}
      className={[
        'video-preview-frame',
        frameClassName,
        framePropClassName,
      ].filter(Boolean).join(' ')}
      style={{ ...frameStyle, ...frameProps.style }}
    >
      <video
        {...restVideoProps}
        ref={videoRef}
        className={[
          'video-preview-video',
          videoClassName,
          videoPropClassName,
        ].filter(Boolean).join(' ')}
        src={src || undefined}
        style={{ ...videoStyle, ...videoProps.style }}
      />
      {children}
    </div>
  )
}

export default VideoPreview
