import {
  Captions,
  Crop,
  FileText,
  Gauge,
  Layers,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import './toolEditor.css'
import './toolLayout.css'

const icons = { Captions, Crop, FileText, Gauge, Layers }

/**
 * Provides consistent navigation, heading, and centered content for tool pages.
 *
 * @param {{tool: {id: string, name: string, description: string, icon: string, accent: string}, children: import('react').ReactNode, headerAction?: import('react').ReactNode}} props Tool metadata and page content.
 * @returns {import('react').JSX.Element} Shared tool page layout.
 */
function ToolLayout({ tool, children, headerAction }) {
  const Icon = icons[tool.icon]

  return (
    <div className={`tool-page-layout accent-${tool.accent}`}>
      <div className="tool-layout-inner">
        <Link className="tool-layout-back" to="/">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
            <path
              d="m14 18-6-6 6-6M8 12h12"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to all tools
        </Link>

        <header className="tool-layout-header">
          <span className="tool-layout-icon" aria-hidden="true">
            <Icon size={24} strokeWidth={1.8} />
          </span>
          <div className="tool-layout-heading">
            <h1>{tool.name}</h1>
            <p>{tool.description}</p>
          </div>
          {headerAction && <div className="tool-layout-action">{headerAction}</div>}
        </header>

        <main className="tool-layout-content">{children}</main>
      </div>
    </div>
  )
}

export default ToolLayout
