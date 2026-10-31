import { useEffect } from 'react'

/**
 * Sets the browser title and description for the current route.
 *
 * @param {string} title Document title.
 * @param {string} description Search and sharing summary.
 * @returns {void}
 */
export function usePageMeta(title, description) {
  useEffect(() => {
    document.title = title
    const descriptionTag = document.querySelector('meta[name="description"]')
    descriptionTag?.setAttribute('content', description)
  }, [description, title])
}
