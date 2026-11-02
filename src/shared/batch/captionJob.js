import { layoutCaptions } from '../captions/engine.js'
import { decodeAudio } from '../media/decodeAudio.js'
import { prepareWhisperModel, transcribe } from '../whisper/whisperClient.js'

/** Share of one video's progress given to each stage, matching Captions. */
const STAGE_WEIGHTS = {
  'loading-model': { start: 0, span: 25, label: 'Preparing the speech model' },
  'reading-audio': { start: 25, span: 15, label: 'Pulling out the audio' },
  transcribing: { start: 40, span: 55, label: 'Listening for words' },
  finishing: { start: 95, span: 5, label: 'Arranging captions' },
}

/**
 * Turns a stage report from the speech engine into overall batch progress.
 *
 * @param {{stage?: string, percent?: number | null}} progress Engine report.
 * @returns {{percent: number | null, stage: string}} Overall percent and label.
 */
export function describeCaptionProgress(progress) {
  const stage = STAGE_WEIGHTS[progress?.stage]
  if (!stage) return { percent: null, stage: '' }
  const inner = Number.isFinite(progress.percent)
    ? Math.min(100, Math.max(0, progress.percent))
    : 0
  return {
    percent: Math.round(stage.start + (stage.span * inner) / 100),
    stage: stage.label,
  }
}

const defaultDeps = { decodeAudio, prepareWhisperModel, transcribe, layoutCaptions }

/**
 * Creates timed captions for one video: model, audio, words, then layout.
 *
 * Audio is decoded while the model loads, as in the Captions tool. Only the
 * small words and captions are returned; the audio samples are not kept.
 *
 * @param {File} file Source video.
 * @param {{model: string, language: string, pace: number | string, signal?: AbortSignal, onProgress?: (update: {percent?: number | null, stage?: string}) => void}} options
 *   Speech settings, cancellation and progress.
 * @param {typeof defaultDeps} [deps] Replaceable steps, for tests.
 * @returns {Promise<{words: object[], captions: object[], language: string | null}>} Words and laid-out captions.
 */
export async function createCaptionsForFile(file, options, deps = defaultDeps) {
  const { model, language, pace, signal, onProgress } = options
  const report = (progress) => onProgress?.(describeCaptionProgress(progress))

  report({ stage: 'loading-model', percent: null })
  const audioPromise = deps.decodeAudio(file, { signal })
  audioPromise.catch(() => {})

  await deps.prepareWhisperModel(model, { signal, onProgress: report })
  if (signal?.aborted) throw Object.assign(new Error('Cancelled.'), { name: 'AbortError' })

  report({ stage: 'reading-audio', percent: null })
  const audio = await audioPromise
  report({ stage: 'reading-audio', percent: 100 })

  const transcription = await deps.transcribe(audio, {
    model,
    language: language === 'auto' ? undefined : language,
    signal,
    onProgress: report,
  })
  report({ stage: 'finishing', percent: null })

  const captions = deps.layoutCaptions(transcription.words, pace)
  if (captions.length === 0) {
    throw new Error('No speech was found in this video.')
  }
  return { words: transcription.words, captions, language: transcription.language ?? null }
}
