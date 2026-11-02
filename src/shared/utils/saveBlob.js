/**
 * Saves a blob to the user's device as a download.
 *
 * @param {Blob} blob File contents.
 * @param {string} fileName Suggested file name.
 * @returns {void}
 */
export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
