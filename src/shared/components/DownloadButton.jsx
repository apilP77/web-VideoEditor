import './mediaControls.css'

/**
 * Downloads a locally generated file and revokes its temporary URL.
 *
 * @param {{result: {blob: Blob, filename: string} | null}} props Download result.
 * @returns {import('react').JSX.Element} Download button.
 */
function DownloadButton({ result }) {
  function downloadResult() {
    if (!result) return

    const url = URL.createObjectURL(result.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = result.filename
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <button
      className="media-button"
      type="button"
      onClick={downloadResult}
      disabled={!result}
    >
      Download video
    </button>
  )
}

export default DownloadButton
