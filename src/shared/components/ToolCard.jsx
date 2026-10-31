import {
  Captions,
  ChevronRight,
  Crop,
  FileText,
  Gauge,
  Layers,
} from 'lucide-react'
import { Link } from 'react-router-dom'

const icons = { Captions, Crop, FileText, Gauge, Layers }

/**
 * Renders one registry tool as a keyboard-accessible navigation card.
 *
 * @param {{tool: {id: string, name: string, description: string, icon: string, accent: string}}} props Registry tool data.
 * @returns {import('react').JSX.Element} Linked tool card.
 */
function ToolCard({ tool }) {
  const Icon = icons[tool.icon]

  return (
    <Link className={`tool-card accent-${tool.accent}`} to={`/tool/${tool.id}`}>
      <span className="tool-card-icon" aria-hidden="true">
        <Icon size={23} strokeWidth={1.8} />
      </span>
      <span className="tool-card-copy">
        <span className="tool-card-title">{tool.name}</span>
        <span className="tool-card-description">{tool.description}</span>
      </span>
      <ChevronRight className="tool-card-chevron" size={20} aria-hidden="true" />
    </Link>
  )
}

export default ToolCard
