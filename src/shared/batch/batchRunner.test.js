import { describe, expect, it, vi } from 'vitest'
import { BATCH_LIMITS, checkBatchLimits, createBatchRunner } from './batchRunner.js'

function file(name, size = 1000) {
  const result = new File(['x'], name, { type: 'video/mp4' })
  Object.defineProperty(result, 'size', { value: size })
  return result
}

function statuses(runner) {
  return runner.getState().items.map((item) => item.status)
}

describe('checkBatchLimits', () => {
  it('rejects too many files, too many bytes and too much video', () => {
    const many = Array.from({ length: 11 }, () => ({ size: 1 }))
    expect(checkBatchLimits([], many).ok).toBe(false)
    expect(checkBatchLimits([], [{ size: BATCH_LIMITS.maxTotalBytes + 1 }]).ok).toBe(false)
    expect(checkBatchLimits([{ size: 1, duration: 1000 }], [{ size: 1, duration: 900 }]).ok).toBe(false)
  })

  it('allows a normal batch', () => {
    expect(checkBatchLimits([{ size: 10, duration: 60 }], [{ size: 10, duration: 60 }]).ok).toBe(true)
  })
})

describe('createBatchRunner', () => {
  it('processes items one at a time, in order', async () => {
    let active = 0
    let maxActive = 0
    const order = []
    const runner = createBatchRunner({
      process: async (item) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        order.push(item.name)
        await Promise.resolve()
        active -= 1
        return { words: 3 }
      },
    })
    runner.add([file('a.mp4'), file('b.mp4'), file('c.mp4')])
    await runner.start()
    expect(maxActive).toBe(1)
    expect(order).toEqual(['a.mp4', 'b.mp4', 'c.mp4'])
    expect(statuses(runner)).toEqual(['done', 'done', 'done'])
    expect(runner.getState().items[0].result).toEqual({ words: 3 })
  })

  it('keeps going after an item fails and can retry it', async () => {
    let failB = true
    const runner = createBatchRunner({
      process: async (item) => {
        if (item.name === 'b.mp4' && failB) {
          const error = new Error('Out of memory.')
          error.technicalDetails = 'log'
          throw error
        }
        return 'ok'
      },
    })
    runner.add([file('a.mp4'), file('b.mp4'), file('c.mp4')])
    await runner.start()
    expect(statuses(runner)).toEqual(['done', 'failed', 'done'])
    const failed = runner.getState().items[1]
    expect(failed.error).toBe('Out of memory.')
    expect(failed.technicalDetails).toBe('log')

    failB = false
    runner.retryFailed()
    expect(statuses(runner)).toEqual(['done', 'queued', 'done'])
    await runner.start()
    expect(statuses(runner)).toEqual(['done', 'done', 'done'])
  })

  it('releases the file when an item is done but keeps it when it fails', async () => {
    const runner = createBatchRunner({
      process: async (item) => {
        if (item.name === 'bad.mp4') throw new Error('nope')
      },
    })
    runner.add([file('ok.mp4'), file('bad.mp4')])
    await runner.start()
    const [ok, bad] = runner.getState().items
    expect(ok.file).toBeNull()
    expect(bad.file).not.toBeNull()
  })

  it('reports progress only for the running item', async () => {
    const seen = []
    const runner = createBatchRunner({
      process: async (item, { onProgress }) => {
        onProgress({ percent: 40, stage: 'Listening' })
        seen.push(runner.getState().items[0].percent)
      },
    })
    runner.add([file('a.mp4')])
    await runner.start()
    expect(seen).toEqual([40])
  })

  it('cancels the current item and carries on with the next', async () => {
    const runner = createBatchRunner({
      process: (item, { signal }) =>
        item.name === 'slow.mp4'
          ? new Promise((_, reject) => {
              signal.addEventListener('abort', () => {
                const error = new Error('aborted')
                error.name = 'AbortError'
                reject(error)
              })
            })
          : Promise.resolve('fine'),
    })
    runner.add([file('slow.mp4'), file('next.mp4')])
    const done = runner.start()
    await Promise.resolve()
    runner.cancelCurrent()
    await done
    expect(statuses(runner)).toEqual(['cancelled', 'done'])
  })

  it('stop() cancels the current item and leaves the rest queued', async () => {
    const runner = createBatchRunner({
      process: (item, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          })
        }),
    })
    runner.add([file('a.mp4'), file('b.mp4')])
    const done = runner.start()
    await Promise.resolve()
    runner.stop()
    await done
    expect(statuses(runner)).toEqual(['cancelled', 'queued'])
    expect(runner.getState().running).toBe(false)
  })

  it('removing the running item aborts it and drops it from the list', async () => {
    let aborted = false
    const runner = createBatchRunner({
      process: (item, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          })
        }),
    })
    runner.add([file('a.mp4')])
    const done = runner.start()
    await Promise.resolve()
    runner.remove(runner.getState().items[0].id)
    await done
    expect(aborted).toBe(true)
    expect(runner.getState().items).toEqual([])
  })

  it('refuses files over the limits and says why', () => {
    const runner = createBatchRunner({ process: async () => {}, limits: { ...BATCH_LIMITS, maxItems: 2 } })
    expect(runner.add([file('a.mp4'), file('b.mp4')]).ok).toBe(true)
    const result = runner.add([file('c.mp4')])
    expect(result.ok).toBe(false)
    expect(result.added).toBe(0)
    expect(result.message).toMatch(/up to 2/)
    expect(runner.getState().items).toHaveLength(2)
  })

  it('picks up an item added while running', async () => {
    const order = []
    let added = false
    const runner = createBatchRunner({
      process: async (item) => {
        order.push(item.name)
        if (!added) {
          added = true
          runner.add([file('late.mp4')])
        }
      },
    })
    runner.add([file('a.mp4')])
    await runner.start()
    expect(order).toEqual(['a.mp4', 'late.mp4'])
  })

  it('notifies subscribers and restores finished items without files', () => {
    const runner = createBatchRunner({ process: async () => {} })
    const listener = vi.fn()
    const unsubscribe = runner.subscribe(listener)
    runner.restore([
      { name: 'done.mp4', size: 5, status: 'done', result: { captions: 4 } },
      { name: 'half.mp4', size: 5, status: 'running' },
    ])
    expect(listener).toHaveBeenCalled()
    const [done, half] = runner.getState().items
    expect(done.status).toBe('done')
    expect(half.status).toBe('cancelled')
    expect(half.file).toBeNull()
    runner.retry(half.id) // no file, so it stays cancelled
    expect(runner.getState().items[1].status).toBe('cancelled')
    unsubscribe()
  })
})
