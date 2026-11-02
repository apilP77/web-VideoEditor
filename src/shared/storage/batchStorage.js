const DATABASE_NAME = 'web-video-toolkit-batch-captions'
const STORE_NAME = 'batches'
const LATEST_KEY = 'latest'
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000

/**
 * Picks the small, saveable parts of a batch. Video files are not included:
 * the browser cannot keep them across a refresh.
 *
 * @param {object[]} items Batch items from the runner.
 * @param {{presetId: string, model: string, language: string, pace: number | string}} settings Shared settings.
 * @returns {{items: object[], settings: object}} Plain data ready to store.
 */
export function serializeBatch(items, settings) {
  return {
    items: items.map((item) => ({
      name: item.name,
      size: item.size,
      duration: item.duration ?? null,
      status: item.status,
      result: item.status === 'done' ? item.result ?? null : null,
    })),
    settings: { ...settings },
  }
}

/**
 * Whether a saved record is still within the 14-day retention window.
 *
 * @param {{savedAt?: number} | null} record Stored record.
 * @param {number} [now] Current time in milliseconds.
 * @returns {boolean} True when the record can still be offered.
 */
export function isRecentBatch(record, now = Date.now()) {
  return Boolean(record) && Number.isFinite(record.savedAt) && now - record.savedAt <= RETENTION_MS
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Batch storage is not available in this browser.'))
      return
    }
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open batch storage.'))
    request.onblocked = () => reject(new Error('Batch storage is busy in another tab.'))
  })
}

async function withStore(mode, run) {
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode)
      const request = run(transaction.objectStore(STORE_NAME))
      transaction.oncomplete = () => resolve(request?.result ?? null)
      transaction.onerror = () => reject(transaction.error ?? new Error('Batch storage failed.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Batch storage was cancelled.'))
    })
  } finally {
    database.close()
  }
}

/**
 * Saves the latest batch locally.
 *
 * @param {ReturnType<typeof serializeBatch>} batch Data from serializeBatch.
 * @returns {Promise<void>} Resolves once stored.
 */
export async function saveBatch(batch) {
  await withStore('readwrite', (store) => store.put({ ...batch, key: LATEST_KEY, savedAt: Date.now() }))
}

/**
 * Loads the latest batch if it is no more than 14 days old.
 *
 * @returns {Promise<object | null>} Saved batch, or null.
 */
export async function loadBatch() {
  const record = await withStore('readonly', (store) => store.get(LATEST_KEY))
  if (!isRecentBatch(record)) {
    if (record) await clearBatch()
    return null
  }
  return record
}

/**
 * Deletes the saved batch.
 *
 * @returns {Promise<void>} Resolves once removed.
 */
export async function clearBatch() {
  await withStore('readwrite', (store) => store.delete(LATEST_KEY))
}
