import { Ellipsis, ExternalLink, LockKeyhole } from 'lucide-react'
import { Link } from 'react-router-dom'
import ToolCard from '../shared/components/ToolCard'
import { usePageMeta } from '../shared/hooks/usePageMeta'
import { tools } from '../tools/index.js'
import { APP_NAME } from '../shared/appConfig.js'

const HOME_DESCRIPTION =
  'Free browser-based video tools for cropping, trimming, captions, and more. Your files stay on your device.'

/**
 * Displays the ready tools and privacy-focused introduction.
 *
 * @returns {import('react').JSX.Element} Homepage tool grid.
 */
function Home() {
  usePageMeta(`${APP_NAME} | Free browser video tools`, HOME_DESCRIPTION)
  const readyTools = tools.filter((tool) => tool.ready)

  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="site-brand" to="/" aria-label={`${APP_NAME} home`}>
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span>{APP_NAME}</span>
        </Link>
        <span className="privacy-label">
          <LockKeyhole size={15} strokeWidth={2} aria-hidden="true" />
          <span>Private: your videos never leave your device</span>
        </span>
      </header>

      <main className="home-main">
        <section className="home-hero" aria-labelledby="home-heading">
          <span className="hero-kicker">Simple tools. Your device. Your files.</span>
          <h1 id="home-heading">
            Free video tools that
            <br className="hero-break" />
            <span> run in your browser</span>
          </h1>
          <p>
            Edit and export for free, with no watermark and no upload.
            <br className="desktop-break" /> Your videos stay right here on your device.
          </p>
        </section>

        <section className="tools-section" aria-labelledby="tools-heading">
          <div className="section-heading">
            <div>
              <p className="section-eyebrow">Choose a tool</p>
              <h2 id="tools-heading">Ready when you are</h2>
            </div>
            <span className="tool-count">
              {readyTools.length} {readyTools.length === 1 ? 'tool' : 'tools'} available
            </span>
          </div>

          <div className="tool-grid">
            {readyTools.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
            <div className="more-card" aria-label="More tools are coming soon">
              <span className="more-icon" aria-hidden="true">
                <Ellipsis size={24} strokeWidth={1.8} />
              </span>
              <span>
                <strong>More on the way</strong>
                <small>More tools are coming soon</small>
              </span>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <p>No uploads, no accounts, no tracking</p>
        <a
          href="https://github.com/apilP77/web-VideoEditor"
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={16} aria-hidden="true" />
          View on GitHub
        </a>
      </footer>
    </div>
  )
}

export default Home
