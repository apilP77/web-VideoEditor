import { useEffect, useRef, useState } from 'react'

/**
 * Scrolls a newly-created result into view and briefly highlights its card.
 *
 * @param {unknown} result Export result identity.
 * @returns {{cardRef: import('react').RefObject<HTMLElement | null>, highlighted: boolean}} Card ref and highlight state.
 */
export function useResultCardAttention(result) {
  const cardRef = useRef(null)
  const timeoutRef = useRef(null)
  const [highlighted, setHighlighted] = useState(false)

  useEffect(() => {
    if (!result) return undefined

    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      cardRef.current?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'center',
      })
      setHighlighted(true)
      timeoutRef.current = window.setTimeout(
        () => setHighlighted(false),
        1400,
      )
    })

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timeoutRef.current)
    }
  }, [result])

  return { cardRef, highlighted }
}
