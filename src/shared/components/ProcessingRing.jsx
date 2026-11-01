import { useEffect, useId, useState } from 'react'
import { Check, X } from 'lucide-react'
import Button from './Button.jsx'
import { getWeightedProgress } from './processingStages.js'
import './processingRing.css'

const CIRCLE_SIZE = 140
const CIRCLE_RADIUS = 60
const CIRCLE_LENGTH = 2 * Math.PI * CIRCLE_RADIUS

function formatElapsed(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function StageIcon({ status }) {
  if (status === 'done') {
    return (
      <span className="processing-ring-stage-icon is-done" aria-hidden="true">
        <Check size={13} strokeWidth={3} />
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="processing-ring-stage-icon is-failed" aria-hidden="true">
        <X size={13} strokeWidth={3} />
      </span>
    )
  }
  return <span className={`processing-ring-stage-icon is-${status}`} aria-hidden="true" />
}

function StageBar({ percent }) {
  const determinate = Number.isFinite(percent)
  return (
    <span
      className={`processing-ring-stage-bar${determinate ? '' : ' is-indeterminate'}`}
      aria-hidden="true"
    >
      <span
        style={determinate ? { width: `${Math.min(100, Math.max(0, percent))}%` } : undefined}
      />
    </span>
  )
}

/**
 * Displays weighted task progress and the status of each processing stage.
 *
 * @param {{stages: Array<{id: string, label: string, weight: number}>, stageId: string, percent: number | null, startedAt: number, progressUpdatedAt: number, detail?: string, failedStage?: string | null, onCancel?: () => void}} props Task stages, actual progress, and cancellation.
 * @returns {import('react').JSX.Element} Shared circular processing indicator.
 */
function ProcessingRing({
  stages,
  stageId,
  percent,
  startedAt,
  progressUpdatedAt,
  detail,
  failedStage = null,
  onCancel,
}) {
  const gradientId = `processing-ring-gradient-${useId().replace(/:/g, '')}`
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const activeIndex = stages.findIndex((stage) => stage.id === stageId)
  const failed = Boolean(failedStage)
  const overallPercent = failed
    ? null
    : getWeightedProgress(stages, stageId, percent)
  const waitingSince = progressUpdatedAt || startedAt
  const isStalled = !failed && now - waitingSince >= 15_000
  const determinate = Number.isFinite(overallPercent)
  const dashOffset = determinate
    ? CIRCLE_LENGTH * (1 - overallPercent / 100)
    : CIRCLE_LENGTH * 0.72
  const activeLabel =
    stages.find((stage) => stage.id === (failedStage || stageId))?.label ??
    'Preparing'

  return (
    <section
      className={`processing-ring${failed ? ' is-failed' : ' is-running'}`}
      aria-label="Processing progress"
    >
      <div className="processing-ring-overview">
        <div className="processing-ring-dial">
          <svg
            className={`processing-ring-large${determinate || failed ? '' : ' is-indeterminate'}`}
            width={CIRCLE_SIZE}
            height={CIRCLE_SIZE}
            viewBox="0 0 140 140"
            role="img"
            aria-label={
              failed
                ? `${activeLabel} failed`
                : determinate
                  ? `${overallPercent}% complete`
                  : 'Progress is being prepared'
            }
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#c4b5fd" />
                <stop offset="55%" stopColor="#a78bfa" />
                <stop offset="100%" stopColor="#f0abfc" />
              </linearGradient>
            </defs>
            <circle className="processing-ring-track" cx="70" cy="70" r={CIRCLE_RADIUS} />
            {!failed && (
              <circle
                className="processing-ring-sweep"
                cx="70"
                cy="70"
                r={CIRCLE_RADIUS}
                strokeDasharray={`${CIRCLE_LENGTH * 0.12} ${CIRCLE_LENGTH}`}
              />
            )}
            <circle
              className="processing-ring-progress"
              cx="70"
              cy="70"
              r={CIRCLE_RADIUS}
              stroke={failed ? undefined : `url(#${gradientId})`}
              strokeDasharray={CIRCLE_LENGTH}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <span className="processing-ring-center" aria-hidden="true">
            {failed ? (
              '!'
            ) : determinate ? (
              <>
                {overallPercent}
                <small>%</small>
              </>
            ) : (
              <span className="processing-ring-dots">
                <span />
                <span />
                <span />
              </span>
            )}
          </span>
        </div>
        <p className="processing-ring-current-stage" role="status" aria-live="polite">
          {failed ? `${activeLabel} failed` : activeLabel}
        </p>
        <p className="processing-ring-elapsed" aria-live="off">
          {formatElapsed(Math.max(0, now - startedAt))} elapsed
        </p>
      </div>

      <div className="processing-ring-stage-panel">
        <ol className="processing-ring-stages">
          {stages.map((stage, index) => {
            const status = stage.id === failedStage
              ? 'failed'
              : index < activeIndex
                ? 'done'
                : index === activeIndex
                  ? 'active'
                  : 'waiting'
            return (
              <li
                key={stage.id}
                className={`processing-ring-stage is-${status}`}
                aria-current={status === 'active' ? 'step' : undefined}
              >
                <StageIcon status={status} />
                <span className="processing-ring-stage-label">{stage.label}</span>
                {status === 'active' && !failed && <StageBar percent={percent} />}
              </li>
            )
          })}
        </ol>
        {detail && (
          <p className="processing-ring-detail" aria-live="polite">
            {detail}
          </p>
        )}
        {isStalled && (
          <p className="processing-ring-stalled" role="status" aria-live="polite">
            Still working. Long or high-resolution videos take longer.
          </p>
        )}
        {onCancel && (
          <Button
            variant="secondary"
            className="processing-ring-cancel"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </div>
    </section>
  )
}

export default ProcessingRing
