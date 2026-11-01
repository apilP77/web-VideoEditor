import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ErrorBoundary from './shared/components/ErrorBoundary.jsx'
import GlobalErrorLogger from './shared/components/GlobalErrorLogger.jsx'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <GlobalErrorLogger />
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
