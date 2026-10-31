import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import Button from './Button.jsx'
import { getWeightedProgress } from './processingStages.js'
import './processingRing.css'

const CIRCLE_SIZE = 140
const CIRCLE_RADIUS = 60
const CIRCLE_LENGTH = 2 * Math.PI * CIRCLE_RADIUS
const SMALL_RADIUS = 12
const SMALL_LENGTH = 2 * Math.PI * SMALL_RADIUS

function formatElapsed(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function SmallStageRing({ status, percent }) {
  if (status === 'done') {
    return <Check className="processing-ring-stage-check" size={18} aria-hidden="true" />
  }
  if (status === 'failed') {
    return <X className="processing-ring-stage-failed" size={18} aria-hidden="true" />
  }
  if (status === 'waiting') {
    return <span className="processing-ring-stage-waiting" aria-hidden="true" />
  }

  const determinate = Number.isFinite(percent)
  const clampedPercent = Math.min(100, Math.max(0, percent ?? 0))

  return (
    <span className="processing-ring-small-wrap" aria-hidden="true">
      <svg className={determinate ? '' : 'is-indeterminate'} viewBox="0 0 32 32">
        <circle className="processing-ring-small-track" cx="16" cy="16" r="12" />
        <circle
          className="processing-ring-small-progress"
          cx="16"
          cy="16"
          r={SMALL_RADIUS}
          strokeDasharray={SMALL_LENGTH}
          strokeDashoffset={determinate ? SMALL_LENGTH * (1 - clampedPercent / 100) : SMALL_LENGTH * 0.68}
        />
      </svg>
      {determinate && <span>{Math.round(percent)}%</span>}
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
  const circumference = CIRCLE_LENGTH
  const determinate = Number.isFinite(overallPercent)
  const dashOffset = determinate
    ? circumference * (1 - overallPercent / 100)
    : circumference * 0.7
  const activeLabel =
    stages.find((stage) => stage.id === (failedStage || stageId))?.label ??
    'Preparing'

  return (
    <section
      className={`processing-ring${failed ? ' is-failed' : ''}`}
      aria-label="Processing progress"
    >
      <div className="processing-ring-overview">
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
          <circle className="processing-ring-track" cx="70" cy="70" r={CIRCLE_RADIUS} />
          <circle
            className="processing-ring-progress"
            cx="70"
            cy="70"
            r={CIRCLE_RADIUS}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <span className="processing-ring-center" aria-hidden="true">
          {failed ? '!' : determinate ? `${overallPercent}%` : '…'}
        </span>
        <p className="processing-ring-current-stage" role="status" aria-live="polite">
          {failed ? `${activeLabel} failed` : activeLabel}
        </p>
        <p className="processing-ring-elapsed" aria-live="off">
          Elapsed: {formatElapsed(Math.max(0, now - startedAt))}
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
                <SmallStageRing
                  status={status}
                  percent={status === 'active' ? percent : null}
                />
                <span>{stage.label}</span>
                {status === 'active' && Number.isFinite(percent) && (
                  <span className="processing-ring-stage-percent">
                    {Math.round(percent)}%
                  </span>
                )}
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
