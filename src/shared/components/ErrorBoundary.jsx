import { Component } from 'react'

/**
 * Prevents an uncaught rendering error from blanking the entire application.
 */
export default class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('The application encountered a rendering error.', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main role="alert" className="app-error-boundary">
          <h1>This page could not be displayed.</h1>
          <p>Reload the page and try again.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </main>
      )
    }

    return this.props.children
  }
}
