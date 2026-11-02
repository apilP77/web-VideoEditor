import { useEffect, useState, useSyncExternalStore } from 'react'
import { createBatchRunner } from './batchRunner.js'

/**
 * Creates one batch runner for a component and keeps it in sync with React.
 *
 * The latest `process` is handed to the queue after every render, so it
 * always sees the current settings without recreating the queue.
 *
 * @param {(item: object, context: object) => Promise<unknown>} process Handles one item.
 * @returns {{runner: ReturnType<typeof createBatchRunner>, items: object[], running: boolean}}
 *   The runner and its current state.
 */
export function useBatchRunner(process) {
  const [runner] = useState(() => createBatchRunner({ process }))
  // Keep the queue using the current settings.
  useEffect(() => {
    runner.setProcess(process)
  }, [runner, process])

  const state = useSyncExternalStore(runner.subscribe, runner.getState)

  // Leaving the page stops the queue and releases the files.
  useEffect(() => () => runner.clear(), [runner])

  return { runner, items: state.items, running: state.running }
}
