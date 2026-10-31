const DATABASE_NAME = 'web-video-toolkit'
const STORE_NAME = 'transcripts'
const LATEST_KEY = 'latest'
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Transcript storage is not available in this browser.'))
      return
    }

    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open transcript storage.'))
    request.onblocked = () =>
      reject(new Error('Transcript storage is busy in another tab.'))
  })
}

/**
 * Saves the latest transcript for up to 14 days in local IndexedDB.
 *
 * @param {{text: string, words: Array<{word: string, start: number, end: number}>, language: string | null, fileName: string, duration: number}} transcript Transcript data to persist.
 * @returns {Promise<void>} Resolves after the record is stored.
 */
export async function saveLatestTranscript(transcript) {
  const database = await openDatabase()
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put({
        ...transcript,
        key: LATEST_KEY,
        savedAt: Date.now(),
      })
      transaction.oncomplete = resolve
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Could not save the transcript.'))
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Transcript saving was cancelled.'))
    })
  } finally {
    database.close()
  }
}

/**
 * Loads the latest transcript if it is no more than 14 days old.
 *
 * @returns {Promise<{text: string, words: Array<{word: string, start: number, end: number}>, language: string | null, fileName: string, duration: number} | null>} Recent transcript or null when none is available.
 */
export async function loadLatestTranscript() {
  const database = await openDatabase()
  try {
    const record = await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const request = transaction.objectStore(STORE_NAME).get(LATEST_KEY)
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () =>
        reject(request.error ?? new Error('Could not read the saved transcript.'))
    })

    if (!record) return null
    if (!Number.isFinite(record.savedAt) || Date.now() - record.savedAt > RETENTION_MS) {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite')
        transaction.objectStore(STORE_NAME).delete(LATEST_KEY)
        transaction.oncomplete = resolve
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('Could not remove expired transcript data.'))
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('Transcript cleanup was cancelled.'))
      })
      return null
    }

    return {
      text: record.text,
      words: record.words,
      language: record.language,
      fileName: record.fileName,
      duration: record.duration,
    }
  } finally {
    database.close()
  }
}
