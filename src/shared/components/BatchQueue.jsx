import { STATUS_LABELS } from './batchQueueLabels.js'
import './batchQueue.css'

function formatSize(bytes) {
  return bytes >= 1073741824
    ? `${(bytes / 1073741824).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1048576))} MB`
}

function formatLength(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * The queue panel every batch tool shows: a heading with a toolbar, an
 * optional notice, and one row per video with its status and progress.
 *
 * Tool-specific buttons and extra content come in through render props, so
 * the rows look and behave the same in every batch tool.
 *
 * @param {{
 *   heading: string,
 *   toolbar: import('react').ReactNode,
 *   notice?: import('react').ReactNode,
 *   items: object[],
 *   statusLabels?: Record<string, string>,
 *   renderMeta?: (item: object) => string,
 *   renderActions: (item: object) => import('react').ReactNode,
 *   renderExtra?: (item: object) => import('react').ReactNode,
 * }} props Queue content and render hooks.
 * @returns {import('react').JSX.Element} Queue panel.
 */
function BatchQueue({
  heading,
  toolbar,
  notice,
  items,
  statusLabels = STATUS_LABELS,
  renderMeta,
  renderActions,
  renderExtra,
}) {
  return (
    <section className="batch-queue tool-panel" aria-label="Queue">
      <div className="batch-queue-heading">
        <h2>{heading}</h2>
        <div className="batch-queue-actions">{toolbar}</div>
      </div>

      {notice}

      <ol className="batch-list">
        {items.map((item) => (
          <li key={item.id} className={`batch-item is-${item.status}`}>
            <div className="batch-item-main">
              <strong className="batch-item-name">{item.name}</strong>
              <span className="batch-item-meta">
                {formatSize(item.size)}
                {formatLength(item.duration) && ` · ${formatLength(item.duration)}`}
                {renderMeta?.(item)}
              </span>
            </div>
            <div className="batch-item-status">
              <span className="batch-item-label">
                {item.status === 'running' && item.stage ? item.stage : statusLabels[item.status]}
              </span>
              {item.status === 'running' && (
                <span className="batch-item-bar" aria-hidden="true">
                  <span style={{ width: `${item.percent ?? 0}%` }} />
                </span>
              )}
            </div>
            <div className="batch-item-actions">{renderActions(item)}</div>
            {renderExtra?.(item)}
            {item.error && (
              <div className="batch-item-error" role="alert">
                <p>{item.error}</p>
                {item.technicalDetails && (
                  <details>
                    <summary>Details</summary>
                    <pre>{item.technicalDetails}</pre>
                  </details>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

export default BatchQueue
