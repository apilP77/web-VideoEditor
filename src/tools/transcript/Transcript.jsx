import { useEffect, useRef, useState } from 'react'
import {
  Clipboard,
  Download,
  FileAudio,
  FileText,
  RotateCcw,
} from 'lucide-react'
import Button from '../../shared/components/Button.jsx'
import ProcessingBar from '../../shared/components/ProcessingBar.jsx'
import ResultCard from '../../shared/components/ResultCard.jsx'
import ToolLayout from '../../shared/components/ToolLayout.jsx'
import UploadBox from '../../shared/components/UploadBox.jsx'
import VideoPlayerControls from '../../shared/components/VideoPlayerControls.jsx'
import { useResultCardAttention } from '../../shared/hooks/useResultCardAttention.js'
import { decodeAudio } from '../../shared/media/decodeAudio.js'
import { getMediaInfo } from '../../shared/media/mediaInfo.js'
import {
  applyEditedText,
  formatTimestamp,
  toPlainText,
  toSRT,
  toVTT,
} from '../../shared/captions/transcript.js'
import { findWordsForReview } from '../../shared/captions/reviewWords.js'
import {
  loadLatestTranscript,
  saveLatestTranscript,
} from '../../shared/storage/transcriptStorage.js'
import { getMonotonicTime } from '../../shared/utils/timing.js'
import { transcribe } from '../../shared/whisper/whisperClient.js'
import './transcript.css'

const MODEL_OPTIONS = [
  { value: 'fast', label: 'Fast — Whisper tiny · about 60–200 MB' },
  { value: 'balanced', label: 'Balanced — Whisper base · about 110–360 MB' },
  { value: 'accurate', label: 'Accurate — Whisper small · about 300 MB–1 GB' },
]
const LANGUAGE_OPTIONS = [
  ['auto', 'Auto-detect'],
  ['english', 'English'],
  ['spanish', 'Spanish'],
  ['french', 'French'],
  ['german', 'German'],
  ['italian', 'Italian'],
  ['portuguese', 'Portuguese'],
  ['dutch', 'Dutch'],
  ['russian', 'Russian'],
  ['japanese', 'Japanese'],
  ['korean', 'Korean'],
  ['chinese', 'Chinese'],
  ['arabic', 'Arabic'],
  ['hindi', 'Hindi'],
  ['turkish', 'Turkish'],
  ['ukrainian', 'Ukrainian'],
  ['vietnamese', 'Vietnamese'],
  ['thai', 'Thai'],
  ['swedish', 'Swedish'],
]
const LONG_AUDIO_SECONDS = 10 * 60
const LANGUAGE_NAMES = Object.fromEntries(
  LANGUAGE_OPTIONS.filter(([value]) => value !== 'auto').map(([value, name]) => [
    value,
    name,
  ]),
)
const LANGUAGE_ALIASES = {
  ar: 'Arabic',
  de: 'German',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  hi: 'Hindi',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  nl: 'Dutch',
  pt: 'Portuguese',
  ru: 'Russian',
  th: 'Thai',
  tr: 'Turkish',
  uk: 'Ukrainian',
  vi: 'Vietnamese',
  zh: 'Chinese',
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Duration unavailable'
  const wholeSeconds = Math.floor(seconds)
  const minutes = Math.floor(wholeSeconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`
}

function isAudioOrVideoFile(file) {
  if (file.type.startsWith('audio/') || file.type.startsWith('video/')) return true
  return /\.(aac|aif|aiff|flac|m4a|m4v|mkv|mov|mp3|mp4|ogg|opus|wav|webm|wma)$/i.test(
    file.name,
  )
}

function getLanguageLabel(language, selectedLanguage) {
  if (selectedLanguage !== 'auto') {
    return `${LANGUAGE_NAMES[selectedLanguage] ?? selectedLanguage} (selected)`
  }
  if (!language) return 'Auto (language not reported)'
  const normalized = language.toLowerCase()
  return LANGUAGE_NAMES[normalized] ?? LANGUAGE_ALIASES[normalized] ?? normalized.toUpperCase()
}

function getProgressLabel(progress) {
  if (progress?.stage === 'loading-model') return 'Loading model'
  if (progress?.stage === 'reading-audio') return 'Reading audio'
  if (progress?.stage === 'finishing') return 'Finishing'
  if (progress?.stage === 'transcribing') {
    return `Transcribing · Chunk ${progress.chunk} of ${progress.total}`
  }
  return 'Reading audio'
}

function downloadText(content, fileName, mimeType) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Transcribes local audio or video and provides editable timed text exports.
 *
 * @param {{tool: {id: string, name: string, description: string, icon: string, accent: string}}} props Registry tool metadata.
 * @returns {import('react').JSX.Element} Transcript generator.
 */
function Transcript({ tool }) {
  const videoRef = useRef(null)
  const audioRef = useRef(null)
  const abortControllerRef = useRef(null)
  const [file, setFile] = useState(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [mediaInfo, setMediaInfo] = useState(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [model, setModel] = useState('balanced')
  const [language, setLanguage] = useState('auto')
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(null)
  const [startedAt, setStartedAt] = useState(0)
  const [progressUpdatedAt, setProgressUpdatedAt] = useState(0)
  const [error, setError] = useState('')
  const [technicalDetails, setTechnicalDetails] = useState('')
  const [backendUsed, setBackendUsed] = useState(null)
  const [result, setResult] = useState(null)
  const [resultAttentionToken, setResultAttentionToken] = useState(0)
  const [savedTranscript, setSavedTranscript] = useState(null)
  const [showTimestamps, setShowTimestamps] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const [previewNote, setPreviewNote] = useState('')
  const { cardRef, highlighted } = useResultCardAttention(
    resultAttentionToken || null,
  )
  const isProcessing = status === 'processing'
  const timedEditedWords = result
    ? applyEditedText(result.words, result.text)
    : []
  const reviewWords = result
    ? findWordsForReview(
        timedEditedWords,
        result.language ?? (language === 'auto' ? null : language),
      )
    : []
  const transcriptText = result
    ? showTimestamps
      ? toPlainText(timedEditedWords, { includeTimestamps: true })
      : result.text
    : ''
  const shouldWarnAboutLongFile =
    (mediaInfo?.duration ?? 0) > LONG_AUDIO_SECONDS
  const shouldWarnAboutLargeVideo =
    Boolean(mediaInfo?.hasVideo) &&
    ((mediaInfo.duration ?? 0) > 3 * 60 || (file?.size ?? 0) > 500 * 1024 * 1024)

  useEffect(() => {
    if (!sourceUrl) return undefined
    return () => URL.revokeObjectURL(sourceUrl)
  }, [sourceUrl])

  useEffect(() => () => abortControllerRef.current?.abort(), [])

  useEffect(() => {
    let active = true
    if (!file) {
      return () => {
        active = false
      }
    }

    getMediaInfo(file).then((info) => {
      if (active) setMediaInfo(info)
    })
    return () => {
      active = false
    }
  }, [file])

  useEffect(() => {
    let active = true
    loadLatestTranscript()
      .then((transcript) => {
        if (active) setSavedTranscript(transcript)
      })
      .catch((storageError) => {
        console.error('Could not restore the saved transcript.', storageError)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!result) return undefined
    const timer = window.setTimeout(() => {
      saveLatestTranscript({
        text: result.text,
        words: result.words,
        language: result.language,
        fileName: result.fileName,
        duration: result.duration,
      }).catch((storageError) => {
        console.error('Could not save the transcript locally.', storageError)
      })
    }, 500)

    return () => {
      window.clearTimeout(timer)
    }
  }, [result])

  function chooseFile(selectedFile) {
    if (!isAudioOrVideoFile(selectedFile)) {
      setError('Choose a supported audio or video file.')
      return
    }

    abortControllerRef.current?.abort()
    setFile(selectedFile)
    setSourceUrl(URL.createObjectURL(selectedFile))
    setMediaInfo(null)
    setResult(null)
    setProgress(null)
    setStatus('idle')
    setError('')
    setTechnicalDetails('')
    setBackendUsed(null)
    setPreviewNote('')
    setCopyMessage('')
    setCurrentTime(0)
    setIsPlaying(false)
  }

  function startOver() {
    abortControllerRef.current?.abort()
    setFile(null)
    setSourceUrl('')
    setMediaInfo(null)
    setResult(null)
    setProgress(null)
    setStatus('idle')
    setError('')
    setTechnicalDetails('')
    setBackendUsed(null)
    setPreviewNote('')
    setCopyMessage('')
    setCurrentTime(0)
    setIsPlaying(false)
  }

  function restoreTranscript() {
    if (!savedTranscript) return
    setResult({
      ...savedTranscript,
      text: savedTranscript.text ?? '',
      words: Array.isArray(savedTranscript.words) ? savedTranscript.words : [],
      restored: true,
    })
    setResultAttentionToken((current) => current + 1)
    setShowTimestamps(false)
    setError('')
  }

  function updateProgress(nextProgress) {
    setProgress(nextProgress)
    if (nextProgress.backend) setBackendUsed(nextProgress.backend)
    if (Number.isFinite(nextProgress.percent) || Number.isFinite(nextProgress.chunk)) {
      setProgressUpdatedAt(getMonotonicTime())
    }
  }

  async function runTranscription() {
    if (!file || isProcessing) return

    const controller = new AbortController()
    abortControllerRef.current = controller
    const now = getMonotonicTime()
    videoRef.current?.pause()
    audioRef.current?.pause()
    setStatus('processing')
    setProgress({ stage: 'reading-audio', percent: null })
    setStartedAt(now)
    setProgressUpdatedAt(now)
    setError('')
    setTechnicalDetails('')
    setBackendUsed(null)
    setCopyMessage('')

    try {
      const audio = await decodeAudio(file, {
        signal: controller.signal,
        onProgress: updateProgress,
      })
      if (controller.signal.aborted) return

      setProgress({ stage: 'loading-model', percent: null })
      const transcript = await transcribe(audio, {
        model,
        language: language === 'auto' ? undefined : language,
        signal: controller.signal,
        onProgress: updateProgress,
      })
      if (controller.signal.aborted) return
      setBackendUsed(transcript.backend)

      setProgress({ stage: 'finishing', percent: null })
      const text = toPlainText(transcript.words)
      const nextResult = {
        text,
        words: transcript.words,
        language: transcript.language,
        fileName: file.name,
        duration: [
          videoRef.current?.duration,
          audioRef.current?.duration,
          mediaInfo?.duration,
        ].find((value) => Number.isFinite(value) && value > 0) ?? 0,
        restored: false,
      }
      setResult(nextResult)
      setResultAttentionToken((current) => current + 1)
      setSavedTranscript(nextResult)
      setShowTimestamps(false)
      setStatus('done')
    } catch (caughtError) {
      if (caughtError?.name === 'AbortError' || controller.signal.aborted) {
        setStatus(result ? 'done' : 'idle')
      } else {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Could not transcribe this file. Check it and try again.',
        )
        setTechnicalDetails(caughtError?.technicalDetails ?? '')
        setStatus('error')
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
    }
  }

  async function togglePlayback() {
    const media = videoRef.current ?? audioRef.current
    if (!media || isProcessing) return

    if (media.paused) {
      try {
        await media.play()
      } catch {
        setPreviewNote('Could not play this file in the browser.')
      }
    } else {
      media.pause()
    }
  }

  function handleMediaMetadata(event) {
    const media = event.currentTarget
    setMediaInfo((current) => ({
      ...current,
      width: media.videoWidth ?? current?.width ?? 0,
      height: media.videoHeight ?? current?.height ?? 0,
      duration: Number.isFinite(media.duration)
        ? media.duration
        : current?.duration ?? 0,
      hasVideo: media instanceof HTMLVideoElement,
    }))
  }

  function setMediaTime(time) {
    const media = videoRef.current ?? audioRef.current
    if (media) media.currentTime = time
    setCurrentTime(time)
  }

  function handleTranscriptChange(value) {
    const text = showTimestamps
      ? value
          .split('\n')
          .map((line) => line.replace(/^\[\d{2}:\d{2}:\d{2}(?:\.\d{3})?\]\s*/, ''))
          .join('\n')
      : value
    setResult((current) => (current ? { ...current, text } : current))
    setSavedTranscript((current) => (current ? { ...current, text } : current))
  }

  async function copyTranscript() {
    try {
      await navigator.clipboard.writeText(transcriptText)
      setCopyMessage('Copied to clipboard.')
    } catch (copyError) {
      console.error('Could not copy the transcript.', copyError)
      setCopyMessage('Copy is unavailable in this browser.')
    }
  }

  function downloadTranscript(format) {
    if (!result) return
    const editedWords = applyEditedText(result.words, result.text)
    const baseName = result.fileName.replace(/\.[^.]+$/, '') || 'transcript'
    if (format === 'txt') {
      const text = showTimestamps
        ? toPlainText(editedWords, { includeTimestamps: true })
        : result.text
      downloadText(text, `${baseName}.txt`, 'text/plain;charset=utf-8')
      return
    }
    if (format === 'srt') {
      downloadText(toSRT(editedWords), `${baseName}.srt`, 'application/x-subrip')
    } else {
      downloadText(toVTT(editedWords), `${baseName}.vtt`, 'text/vtt')
    }
  }

  const duration = mediaInfo?.duration ?? 0
  const hasVideo = mediaInfo?.hasVideo === true
  const hasMediaDuration = Number.isFinite(duration) && duration > 0
  const actionLabel =
    status === 'error'
      ? 'Try again'
      : result
        ? 'Transcribe again'
        : 'Transcribe'
  const actionVariant = result ? 'outline' : 'primary'
  const progressDetail =
    progress?.stage === 'loading-model'
      ? [progress.file, progress.status].filter(Boolean).join(' · ')
      : progress?.detail

  return (
    <ToolLayout
      tool={tool}
      headerAction={
        file && (
          <Button
            variant="secondary"
            className="tool-change-button"
            onClick={startOver}
            disabled={isProcessing}
          >
            Choose a different video
          </Button>
        )
      }
    >
      <div className="media-tool-app transcript-tool">
        {!file ? (
          <section className="media-tool-upload" aria-label="Upload audio or video">
            <UploadBox
              onFileSelect={chooseFile}
              accept="audio/*,video/*"
              title="Choose or drop an audio or video file"
              helpText="Your media stays on this device."
              formats="MP3, WAV, M4A, AAC, OGG, MP4, MOV, WebM and more"
            />
            {savedTranscript && (
              <Button
                variant="secondary"
                icon={<RotateCcw size={17} aria-hidden="true" />}
                onClick={restoreTranscript}
              >
                Restore last transcript
              </Button>
            )}
            {error && <p className="transcript-validation-note" role="alert">{error}</p>}
          </section>
        ) : (
          <>
            <div className="editor-layout transcript-editor-layout">
              <section className="tool-panel preview-panel" aria-label="Media preview">
                <div className="panel-heading">
                  <div>
                    <h2>Preview</h2>
                    <p>
                      {mediaInfo
                        ? [
                            hasVideo && mediaInfo.width && mediaInfo.height
                              ? `${mediaInfo.width} × ${mediaInfo.height}`
                              : 'Audio only',
                            hasMediaDuration ? formatDuration(duration) : null,
                            mediaInfo.hasAudio === true
                              ? 'Audio track'
                              : mediaInfo.hasAudio === false
                                ? 'No audio track detected'
                                : 'Audio status unknown',
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : 'Reading media details…'}
                    </p>
                  </div>
                </div>

                <div className="transcript-preview-frame">
                  {hasVideo ? (
                    <video
                      ref={videoRef}
                      className="transcript-source-video"
                      src={sourceUrl}
                      playsInline
                      preload="metadata"
                      onLoadedMetadata={handleMediaMetadata}
                      onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onError={() =>
                        setPreviewNote(
                          'This video cannot be previewed, but audio transcription may still work.',
                        )
                      }
                      style={{
                        aspectRatio:
                          mediaInfo?.width && mediaInfo?.height
                            ? `${mediaInfo.width} / ${mediaInfo.height}`
                            : '16 / 9',
                      }}
                    />
                  ) : (
                    <div className="transcript-audio-preview">
                      <FileAudio size={36} aria-hidden="true" />
                      <span>{file.name}</span>
                      <audio
                        ref={audioRef}
                        src={sourceUrl}
                        preload="metadata"
                        onLoadedMetadata={handleMediaMetadata}
                        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        controls={!isProcessing}
                        aria-label="Audio preview"
                      />
                    </div>
                  )}
                </div>

                {hasVideo && (
                  <VideoPlayerControls
                    currentTime={currentTime}
                    duration={duration}
                    isPlaying={isPlaying}
                    disabled={isProcessing || !hasMediaDuration}
                    mediaLabel="video"
                    onPlayPause={togglePlayback}
                    onSeek={setMediaTime}
                  />
                )}
                {previewNote && (
                  <p className="media-info-note" role="status">{previewNote}</p>
                )}
              </section>

              <div className="editor-controls">
                <section className="tool-panel transcript-settings" aria-labelledby="transcript-settings-heading">
                  <div className="panel-heading">
                    <div>
                      <h2 id="transcript-settings-heading">Transcription settings</h2>
                      <p>Choose the speech model and language.</p>
                    </div>
                  </div>

                  <label className="transcript-field" htmlFor="transcript-model">
                    <span>Model</span>
                    <select
                      id="transcript-model"
                      value={model}
                      disabled={isProcessing}
                      onChange={(event) => setModel(event.target.value)}
                    >
                      {MODEL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="transcript-field" htmlFor="transcript-language">
                    <span>Language</span>
                    <select
                      id="transcript-language"
                      value={language}
                      disabled={isProcessing}
                      onChange={(event) => setLanguage(event.target.value)}
                    >
                      {LANGUAGE_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>

                  <p className="transcript-cache-note">
                    The first run downloads the selected model once. The browser
                    caches it for later runs. Approximate download size varies
                    with the browser processing backend.
                  </p>
                  {backendUsed && (
                    <p className="transcript-backend-note" role="status" aria-live="polite">
                      Running on: {backendUsed === 'webgpu' ? 'GPU' : 'CPU (slower)'}
                    </p>
                  )}
                  {shouldWarnAboutLargeVideo && (
                    <p className="transcript-long-warning" role="status">
                      Long videos can be slow and use a lot of memory. Close other tabs.
                    </p>
                  )}
                  {shouldWarnAboutLongFile && (
                    <p className="transcript-long-warning" role="status">
                      Long files take a while to transcribe. Keep this tab open and in front.
                    </p>
                  )}

                  {status === 'error' && (
                    <div className="transcript-error" role="alert">
                      <p className="tool-error">{error}</p>
                      {technicalDetails && (
                        <details>
                          <summary>Details</summary>
                          <pre>{technicalDetails}</pre>
                        </details>
                      )}
                    </div>
                  )}

                  <Button
                    variant={actionVariant}
                    className="transcript-action"
                    onClick={runTranscription}
                    disabled={isProcessing || !file}
                    icon={status === 'error' ? <RotateCcw size={17} aria-hidden="true" /> : <FileText size={18} aria-hidden="true" />}
                  >
                    {actionLabel}
                  </Button>

                  {isProcessing && (
                    <ProcessingBar
                      percent={progress?.percent ?? null}
                      startedAt={startedAt}
                      progressUpdatedAt={progressUpdatedAt}
                      label={getProgressLabel(progress)}
                      detail={progressDetail}
                      onCancel={() => abortControllerRef.current?.abort()}
                    />
                  )}
                </section>
              </div>
            </div>

          </>
        )}

        {result && (
          <ResultCard
            variant="content"
            heading="Your transcript is ready"
            cardRef={cardRef}
            highlighted={highlighted}
          >
            <dl className="transcript-result-info">
              <div><dt>File</dt><dd title={result.fileName}>{result.fileName}</dd></div>
              <div><dt>Duration</dt><dd>{formatDuration(result.duration)}</dd></div>
              <div><dt>Language</dt><dd>{getLanguageLabel(result.language, language)}</dd></div>
              <div>
                <dt>Words</dt>
                <dd>{result.text.trim() ? result.text.trim().split(/\s+/u).length : 0}</dd>
              </div>
            </dl>

            <label className="transcript-text-label" htmlFor="transcript-text">
              Transcript
            </label>
            <textarea
              id="transcript-text"
              className="transcript-textarea"
              value={transcriptText}
              onChange={(event) => handleTranscriptChange(event.target.value)}
              disabled={isProcessing}
              aria-label="Edit transcript"
            />
            {reviewWords.length > 0 && (
              <section
                className="transcript-review-words"
                aria-labelledby="review-words-heading"
              >
                <h3 id="review-words-heading">Words to review</h3>
                <ul>
                  {reviewWords.map((word, index) => (
                    <li key={`${word.start}-${word.end}-${index}`}>
                      <strong>{word.word}</strong>
                      <span>{word.reason}</span>
                      <time>{formatTimestamp(word.start, '.')}</time>
                    </li>
                  ))}
                </ul>
                <p>These are suggestions only. Check the audio and context.</p>
              </section>
            )}
            <label className="transcript-timestamp-toggle">
              <input
                type="checkbox"
                checked={showTimestamps}
                disabled={isProcessing}
                onChange={(event) => setShowTimestamps(event.target.checked)}
              />
              <span>Show timestamps</span>
            </label>

            <div className="transcript-result-actions">
              <Button
                variant="secondary"
                icon={<Clipboard size={17} aria-hidden="true" />}
                onClick={copyTranscript}
                disabled={isProcessing}
              >
                Copy
              </Button>
              <Button
                variant="primary"
                icon={<Download size={17} aria-hidden="true" />}
                onClick={() => downloadTranscript('txt')}
                disabled={isProcessing}
              >
                Download TXT
              </Button>
              <Button
                variant="secondary"
                onClick={() => downloadTranscript('srt')}
                disabled={isProcessing}
              >
                Download SRT
              </Button>
              <Button
                variant="secondary"
                onClick={() => downloadTranscript('vtt')}
                disabled={isProcessing}
              >
                Download VTT
              </Button>
            </div>
            <p className="transcript-copy-status" role="status" aria-live="polite">
              {copyMessage}
            </p>
            {result.restored && (
              <p className="transcript-restored-note" role="status">
                Restored from this device.
              </p>
            )}
          </ResultCard>
        )}
      </div>
    </ToolLayout>
  )
}

export default Transcript
