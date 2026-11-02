/**
 * Shared batch queue: runs one job at a time, keeps going after a failure,
 * and holds no media in memory once an item has finished.
 *
 * It knows nothing about captions or React. A tool supplies a `process`
 * function and reads state through `subscribe`.
 */

export const BATCH_LIMITS = Object.freeze({
  maxItems: 10,
  maxTotalBytes: 4 * 1024 * 1024 * 1024,
  maxTotalSeconds: 30 * 60,
})

/** @typedef {'queued' | 'running' | 'done' | 'failed' | 'cancelled'} BatchItemStatus */

/**
 * @typedef {object} BatchItem
 * @property {number} id Stable id for lists and retries.
 * @property {File | null} file Source file. Dropped when the item is done.
 * @property {string} name File name, kept after the file is released.
 * @property {number} size Size in bytes.
 * @property {number | null} duration Seconds, once known.
 * @property {BatchItemStatus} status Current state.
 * @property {number | null} percent Progress of the current run, 0-100.
 * @property {string} stage Short label from the tool, such as "Listening".
 * @property {string} error User-facing failure message.
 * @property {string} technicalDetails Extra detail for a "Details" section.
 * @property {unknown} result Small result data from `process`, never media.
 */

/**
 * Checks whether files can be added without passing the batch limits.
 *
 * @param {Pick<BatchItem, 'size' | 'duration'>[]} existing Items already queued.
 * @param {{size: number, duration?: number | null}[]} incoming Files being added.
 * @param {typeof BATCH_LIMITS} [limits] Limits to apply.
 * @returns {{ok: boolean, message: string}} Whether adding is allowed, and why not.
 */
export function checkBatchLimits(existing, incoming, limits = BATCH_LIMITS) {
  const all = [...existing, ...incoming]
  if (all.length > limits.maxItems) {
    return {
      ok: false,
      message: `A batch can hold up to ${limits.maxItems} videos. Remove some or run a second batch.`,
    }
  }
  const bytes = all.reduce((sum, item) => sum + (item.size || 0), 0)
  if (bytes > limits.maxTotalBytes) {
    return {
      ok: false,
      message: `These files are over ${Math.round(limits.maxTotalBytes / 1073741824)} GB in total. Add fewer, or run a second batch.`,
    }
  }
  const seconds = all.reduce((sum, item) => sum + (item.duration || 0), 0)
  if (seconds > limits.maxTotalSeconds) {
    return {
      ok: false,
      message: `A batch can cover up to ${Math.round(limits.maxTotalSeconds / 60)} minutes of video in total.`,
    }
  }
  return { ok: true, message: '' }
}

function createAbortError() {
  const error = new Error('Batch item was cancelled.')
  error.name = 'AbortError'
  return error
}

/**
 * Creates a batch runner.
 *
 * @param {{
 *   process: (item: BatchItem, context: {signal: AbortSignal, onProgress: (update: {percent?: number | null, stage?: string}) => void}) => Promise<unknown>,
 *   limits?: typeof BATCH_LIMITS,
 * }} options `process` handles one item and resolves to small result data.
 * @returns {{
 *   getState: () => {items: BatchItem[], running: boolean},
 *   subscribe: (listener: () => void) => () => void,
 *   add: (files: File[], durations?: Record<string, number>) => {ok: boolean, message: string, added: number},
 *   remove: (id: number) => void,
 *   retry: (id: number) => void,
 *   retryFailed: () => void,
 *   start: () => Promise<void>,
 *   cancelCurrent: () => void,
 *   stop: () => void,
 *   setDuration: (id: number, seconds: number) => void,
 *   setProcess: (next: typeof process) => void,
 *   restore: (items: Partial<BatchItem>[]) => void,
 *   clear: () => void,
 * }} Runner API.
 */
export function createBatchRunner({ process, limits = BATCH_LIMITS }) {
  let handler = process
  let items = []
  let nextId = 1
  let running = false
  let stopping = false
  let current = null // {id, controller}
  let snapshot = { items, running }
  const listeners = new Set()

  function publish() {
    snapshot = { items, running }
    for (const listener of listeners) listener()
  }

  function update(id, patch) {
    let changed = false
    items = items.map((item) => {
      if (item.id !== id) return item
      changed = true
      return { ...item, ...patch }
    })
    if (changed) publish()
  }

  function add(files, durations = {}) {
    const incoming = files.map((file) => ({
      size: file.size,
      duration: durations[file.name] ?? null,
    }))
    const check = checkBatchLimits(items, incoming, limits)
    if (!check.ok) return { ...check, added: 0 }

    items = [
      ...items,
      ...files.map((file, index) => ({
        id: nextId++,
        file,
        name: file.name,
        size: file.size,
        duration: incoming[index].duration,
        status: 'queued',
        percent: null,
        stage: '',
        error: '',
        technicalDetails: '',
        result: null,
      })),
    ]
    publish()
    return { ok: true, message: '', added: files.length }
  }

  function remove(id) {
    if (current?.id === id) current.controller.abort()
    items = items.filter((item) => item.id !== id)
    publish()
  }

  function retry(id) {
    const item = items.find((candidate) => candidate.id === id)
    // Items restored from storage have no file; they cannot be re-run.
    if (!item?.file || (item.status !== 'failed' && item.status !== 'cancelled')) return
    update(id, { status: 'queued', percent: null, stage: '', error: '', technicalDetails: '' })
  }

  function retryFailed() {
    for (const item of items) retry(item.id)
  }

  async function runOne(item) {
    const controller = new AbortController()
    current = { id: item.id, controller }
    update(item.id, { status: 'running', percent: null, stage: '', error: '', technicalDetails: '' })
    try {
      const result = await handler(item, {
        signal: controller.signal,
        onProgress: ({ percent, stage } = {}) => {
          if (controller.signal.aborted || current?.id !== item.id) return
          update(item.id, {
            ...(percent !== undefined ? { percent } : {}),
            ...(stage !== undefined ? { stage } : {}),
          })
        },
      })
      if (controller.signal.aborted) throw createAbortError()
      // The file is released so a long batch does not keep every video alive.
      update(item.id, { status: 'done', percent: 100, stage: '', result, file: null })
    } catch (error) {
      if (error?.name === 'AbortError' || controller.signal.aborted) {
        if (items.some((candidate) => candidate.id === item.id)) {
          update(item.id, { status: 'cancelled', percent: null, stage: '' })
        }
      } else {
        update(item.id, {
          status: 'failed',
          percent: null,
          stage: '',
          error: error instanceof Error && error.message ? error.message : 'This video could not be processed.',
          technicalDetails: error?.technicalDetails ?? '',
        })
      }
    } finally {
      current = null
    }
  }

  async function start() {
    if (running) return
    running = true
    stopping = false
    publish()
    try {
      // Re-read the list each time so items added, removed or retried
      // while running are picked up.
      for (;;) {
        if (stopping) break
        const next = items.find((item) => item.status === 'queued' && item.file)
        if (!next) break
        await runOne(next)
      }
    } finally {
      running = false
      stopping = false
      publish()
    }
  }

  return {
    getState: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    add,
    remove,
    retry,
    retryFailed,
    start,
    cancelCurrent() {
      current?.controller.abort()
    },
    stop() {
      stopping = true
      current?.controller.abort()
    },
    setProcess(next) {
      handler = next
    },
    setDuration(id, seconds) {
      if (Number.isFinite(seconds) && seconds > 0) update(id, { duration: seconds })
    },
    restore(saved) {
      items = saved.map((entry) => ({
        id: nextId++,
        file: null,
        name: entry.name ?? 'Video',
        size: entry.size ?? 0,
        duration: entry.duration ?? null,
        status: entry.status === 'done' ? 'done' : 'cancelled',
        percent: entry.status === 'done' ? 100 : null,
        stage: '',
        error: entry.status === 'done' ? '' : 'Choose this video again to continue.',
        technicalDetails: '',
        result: entry.result ?? null,
      }))
      publish()
    },
    clear() {
      current?.controller.abort()
      items = []
      publish()
    },
  }
}
