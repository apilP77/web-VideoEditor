import { useEffect } from 'react'

/**
 * Logs uncaught browser errors and rejected promises with their original values.
 *
 * @returns {null} This component renders no UI.
 */
export default function GlobalErrorLogger() {
  useEffect(() => {
    function handleError(event) {
      console.error('Uncaught application error.', event.error ?? event.message)
    }

    function handleRejection(event) {
      console.error('Unhandled application rejection.', event.reason)
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)
    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  return null
}
