/**
 * Calculates weighted progress only when the active stage reports real progress.
 *
 * @param {Array<{id: string, weight: number}>} stages Ordered processing stages.
 * @param {string | null} activeStageId Current stage identifier.
 * @param {number | null} activePercent Actual active-stage progress, if available.
 * @returns {number | null} Rounded overall percentage, or null while indeterminate.
 */
export function getWeightedProgress(stages, activeStageId, activePercent) {
  const activeIndex = stages.findIndex((stage) => stage.id === activeStageId)
  if (
    activeIndex < 0 ||
    !Number.isFinite(activePercent) ||
    activePercent < 0
  ) {
    return null
  }

  const totalWeight = stages.reduce(
    (total, stage) => total + Math.max(0, stage.weight),
    0,
  )
  if (totalWeight === 0) return null

  const completedWeight = stages
    .slice(0, activeIndex)
    .reduce((total, stage) => total + Math.max(0, stage.weight), 0)
  const activeWeight = Math.max(0, stages[activeIndex].weight)
  const activeProgress = Math.min(100, activePercent) / 100

  return Math.round(
    ((completedWeight + activeWeight * activeProgress) / totalWeight) * 100,
  )
}
