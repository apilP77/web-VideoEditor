import { useEffect, useState } from 'react'

/**
 * Creates an object URL for a file and revokes it with the same effect lifecycle.
 *
 * @param {File | null} file Local file to expose as a URL.
 * @returns {string} Object URL for the current file, or an empty string.
 */
export function useObjectUrl(file) {
  const [entry, setEntry] = useState(null)

  useEffect(() => {
    if (!file) return undefined

    const url = URL.createObjectURL(file)
    setEntry({ file, url })
    return () => URL.revokeObjectURL(url)
  }, [file])

  return entry?.file === file ? entry.url : ''
}
