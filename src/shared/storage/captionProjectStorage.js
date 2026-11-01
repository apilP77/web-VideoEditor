const DATABASE_NAME = 'web-video-toolkit-caption-projects'
const STORE_NAME = 'projects'
const LATEST_KEY = 'latest'
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Caption project storage is not available in this browser.'))
      return
    }

    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open caption project storage.'))
    request.onblocked = () =>
      reject(new Error('Caption project storage is busy in another tab.'))
  })
}

/**
 * Saves the latest caption project locally for up to 14 days.
 *
 * @param {{words: Array<object>, captions: Array<object>, style: object, pace: number | 'sentence', fileName: string, language: string | null, duration: number}} project Project data to save.
 * @returns {Promise<void>} Resolves after the project is stored.
 */
export async function saveLatestCaptionProject(project) {
  const database = await openDatabase()
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put({
        ...project,
        key: LATEST_KEY,
        savedAt: Date.now(),
      })
      transaction.oncomplete = resolve
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Could not save the caption project.'))
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Caption project saving was cancelled.'))
    })
  } finally {
    database.close()
  }
}

/**
 * Loads the latest caption project if it is no more than 14 days old.
 *
 * @returns {Promise<object | null>} Recent project or null if none is available.
 */
export async function loadLatestCaptionProject() {
  const database = await openDatabase()
  try {
    const record = await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const request = transaction.objectStore(STORE_NAME).get(LATEST_KEY)
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () =>
        reject(request.error ?? new Error('Could not read the saved caption project.'))
    })

    if (!record) return null
    if (!Number.isFinite(record.savedAt) || Date.now() - record.savedAt > RETENTION_MS) {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite')
        transaction.objectStore(STORE_NAME).delete(LATEST_KEY)
        transaction.oncomplete = resolve
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('Could not remove expired caption data.'))
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('Caption cleanup was cancelled.'))
      })
      return null
    }

    return {
      words: record.words,
      captions: record.captions,
      style: record.style,
      pace: record.pace,
      fileName: record.fileName,
      language: record.language,
      duration: record.duration,
    }
  } finally {
    database.close()
  }
}
