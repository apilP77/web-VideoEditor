import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { APP_NAME } from '../shared/appConfig.js'
import { usePageMeta } from '../shared/hooks/usePageMeta'
import { tools } from '../tools/index.js'

/**
 * Renders a ready tool or a helpful unavailable-tool page.
 *
 * @returns {import('react').JSX.Element} Selected tool page.
 */
function ToolPage() {
  const { toolId } = useParams()
  const tool = tools.find((entry) => entry.id === toolId)
  const isReady = Boolean(tool?.ready && tool.component)

  usePageMeta(
    isReady ? `${tool.name} | ${APP_NAME}` : `Tool not ready | ${APP_NAME}`,
    isReady
      ? tool.description
      : 'This video tool is not ready yet. Browse the tools that are available now.',
  )

  if (!isReady) {
    return (
      <main className="unavailable-page">
        <div className="unavailable-icon" aria-hidden="true">…</div>
        <p className="section-eyebrow">Still in the workshop</p>
        <h1>This tool isn’t ready yet</h1>
        <p>
          {tool
            ? `${tool.name} is on the way. Choose a ready tool while we work on it.`
            : 'We couldn’t find that tool. Browse the tools that are ready to use.'}
        </p>
        <Link className="back-home-button" to="/">
          <ArrowLeft size={17} aria-hidden="true" />
          Back to all tools
        </Link>
      </main>
    )
  }

  const ToolComponent = tool.component

  return (
    <div className="tool-page">
      <div className="tool-page-top">
        <Link className="back-to-tools" to="/">
          <ArrowLeft size={17} aria-hidden="true" />
          Back to all tools
        </Link>
      </div>
      <ToolComponent />
    </div>
  )
}

export default ToolPage
