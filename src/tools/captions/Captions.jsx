import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Merge,
  Scissors,
  Trash2,
} from 'lucide-react'
import '@fontsource/inter/400.css'
import '@fontsource/inter/700.css'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import '@fontsource/montserrat/400.css'
import '@fontsource/montserrat/700.css'
import '@fontsource/bebas-neue/400.css'
import '@fontsource/anton/400.css'
import '@fontsource/caveat/700.css'
import Button from '../../shared/components/Button.jsx'
import PreviewPoster, { PreviewCopyBadge } from '../../shared/components/PreviewPoster.jsx'
import ProcessingRing from '../../shared/components/ProcessingRing.jsx'
import ResultCard from '../../shared/components/ResultCard.jsx'
import ToolLayout from '../../shared/components/ToolLayout.jsx'
import UploadBox from '../../shared/components/UploadBox.jsx'
import VideoPreview from '../../shared/components/VideoPreview.jsx'
import VideoPlayerControls from '../../shared/components/VideoPlayerControls.jsx'
import { decodeAudio } from '../../shared/media/decodeAudio.js'
import { getMediaDuration } from '../../shared/media/duration.js'
import { getVideoFrameRate } from '../../shared/media/frameRate.js'
import { getMediaInfo } from '../../shared/media/mediaInfo.js'
import { getPreviewSize } from '../../shared/media/previewProxy.js'
import { useObjectUrl } from '../../shared/media/useObjectUrl.js'
import { usePreviewFallback } from '../../shared/media/usePreviewFallback.js'
import {
  CAPTION_PACES,
  deleteCaption,
  editCaptionText,
  findCaptionReviewWords,
  getActiveCaption,
  getActiveWordIndex,
  layoutCaptions,
  mergeCaptions,
  nudgeCaptionEnd,
  nudgeCaptionStart,
  splitCaption,
} from '../../shared/captions/engine.js'
import { canOpenCaptionStep } from '../../shared/captions/workflow.js'
import { LANGUAGE_OPTIONS, MODEL_OPTIONS } from '../../shared/captions/options.js'
import {
  getCaptionExportFilename,
  getCaptionExportWords,
  shouldWarnAboutCaptionExport,
} from '../../shared/captions/exportHelpers.js'
import { exportCaptionVideo } from '../../shared/captions/captionExport.js'
import { drawCaption } from '../../shared/captions/renderer.js'
import { toPlainText, toSRT, toVTT } from '../../shared/captions/transcript.js'
import {
  CAPTION_ANIMATIONS,
  CAPTION_FONTS,
  CAPTION_PRESETS,
  createCaptionStyle,
  waitForCaptionFonts,
} from '../../shared/captions/styles.js'
import {
  loadLatestCaptionProject,
  saveLatestCaptionProject,
} from '../../shared/storage/captionProjectStorage.js'
import { useResultCardAttention } from '../../shared/hooks/useResultCardAttention.js'
import { getMonotonicTime } from '../../shared/utils/timing.js'
import {
  prepareWhisperModel,
  transcribe,
} from '../../shared/whisper/whisperClient.js'
import './captions.css'

const PROCESSING_STAGES = [
  { id: 'loading-model', label: 'Preparing the speech model', weight: 25 },
  { id: 'reading-audio', label: 'Pulling out the audio', weight: 15 },
  { id: 'transcribing', label: 'Listening for words', weight: 55 },
  { id: 'finishing', label: 'Arranging captions', weight: 5 },
]
const CAPTION_FLOW_STEPS = [
  { number: 1, label: 'Video' },
  { number: 2, label: 'Words' },
  { number: 3, label: 'Style and export' },
]
const LANGUAGE_NAMES = Object.fromEntries(
  LANGUAGE_OPTIONS.filter(([value]) => value !== 'auto'),
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
const HIGHLIGHT_SWATCHES = [
  '#ffe066',
  '#a4ff79',
  '#ff77e9',
  '#63e6ff',
  '#ff8b6a',
  '#a78bfa',
  '#ffffff',
]
const PREVIEW_CAPTION = {
  start: 0,
  end: 3,
  words: [
    { word: 'Make', start: 0, end: 0.6 },
    { word: 'every', start: 0.6, end: 1.2 },
    { word: 'moment', start: 1.2, end: 2 },
    { word: 'count.', start: 2, end: 2.8 },
  ],
}
const STYLE_STORAGE_KEY = 'web-video-toolkit-caption-style'
const NUDGE_SECONDS = 0.05


function isVideoFile(file) {
  return file.type.startsWith('video/') ||
    /\.(avi|m4v|mkv|mov|mp4|mpeg|mpg|ogv|webm)$/iu.test(file.name)
}

function formatTime(seconds) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const minutes = Math.floor(safe / 60)
  return `${String(minutes).padStart(2, '0')}:${(safe % 60).toFixed(2).padStart(5, '0')}`
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Duration unavailable'
  const whole = Math.floor(seconds)
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}

function formatElapsed(milliseconds) {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000)
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`
}

function downloadText(content, fileName, mimeType) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function getInitialStyle() {
  try {
    const saved = window.localStorage.getItem(STYLE_STORAGE_KEY)
    if (!saved) return createCaptionStyle()
    const parsed = JSON.parse(saved)
    const presetExists = CAPTION_PRESETS.some((preset) => preset.id === parsed.preset)
    return createCaptionStyle(presetExists ? parsed.preset : 'classic', parsed)
  } catch (error) {
    console.error('Could not restore the saved caption style.', error)
    return createCaptionStyle()
  }
}

function getLanguageLabel(language) {
  if (!language) return 'Not reported'
  const normalized = language.toLowerCase()
  return LANGUAGE_NAMES[normalized] ?? LANGUAGE_ALIASES[normalized] ?? normalized.toUpperCase()
}

function formatProgressDetail(progress, duration) {
  const length = Number.isFinite(duration) && duration > 0 ? formatDuration(duration) : null
  if (progress?.stage === 'loading-model') {
    if (Number.isFinite(progress.loadedBytes) && Number.isFinite(progress.totalBytes)) {
      const loaded = Math.round(progress.loadedBytes / 1048576)
      const total = Math.round(progress.totalBytes / 1048576)
      return loaded >= total
        ? 'Model ready. Starting it up on your device.'
        : `Downloading ${loaded} of ${total} MB. This happens once; next time it loads instantly.`
    }
    return 'Getting the speech model ready on your device.'
  }
  if (progress?.stage === 'reading-audio') {
    return length
      ? `Extracting the soundtrack from your ${length} video.`
      : 'Extracting the soundtrack from your video.'
  }
  if (progress?.stage === 'transcribing') {
    const heard = formatDuration(progress.coveredSeconds ?? 0)
    const total = progress.total ?? 0
    if (!progress.completedChunks) {
      return total > 1
        ? `Listening to part 1 of ${total}. Words appear as each part finishes.`
        : 'Listening to your video. Words appear when it finishes.'
    }
    return length
      ? `Heard ${heard} of ${length} so far · part ${Math.min(progress.chunk ?? total, total)} of ${total}.`
      : `Part ${Math.min(progress.chunk ?? total, total)} of ${total}.`
  }
  if (progress?.stage === 'finishing') return 'Grouping words into readable captions.'
  return ''
}

function LiveTranscript({ words }) {
  const textRef = useRef(null)
  // Words from earlier parts stay put; only the newly heard batch types in.
  const [storedSettledCount, setSettledCount] = useState(0)
  // A retry restarts the transcript with fewer words; treat all as new.
  const settledCount = words.length < storedSettledCount ? 0 : storedSettledCount
  const newWordCount = Math.max(0, words.length - settledCount)
  const stepMs = newWordCount > 0 ? Math.min(45, 1800 / newWordCount) : 0

  useEffect(() => {
    const element = textRef.current
    if (element) element.scrollTop = element.scrollHeight
    const timer = window.setTimeout(
      () => setSettledCount(words.length),
      newWordCount * stepMs + 450,
    )
    return () => window.clearTimeout(timer)
  }, [newWordCount, stepMs, words.length])

  return (
    <div className="captions-live" aria-live="polite">
      <p className="captions-live-label">
        <span className="captions-live-dot" aria-hidden="true" />
        {words.length > 0 ? `Heard so far · ${words.length} words` : 'Heard so far'}
      </p>
      {words.length > 0 ? (
        <p className="captions-live-text" ref={textRef}>
          {words.map((word, index) => (
            <span
              key={`${word.start}-${index}`}
              className={index >= settledCount ? 'captions-live-word is-new' : 'captions-live-word'}
              style={
                index >= settledCount
                  ? { '--word-delay': `${(index - settledCount) * stepMs}ms` }
                  : undefined
              }
            >
              {word.word}{' '}
            </span>
          ))}
          <span className="captions-live-caret" aria-hidden="true" />
        </p>
      ) : (
        <div className="captions-live-skeleton" aria-hidden="true">
          <span />
          <span />
        </div>
      )}
    </div>
  )
}

function CaptionStyleThumbnail({ style, selected, onSelect, disabled, fontsReady }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !fontsReady) return
    const context = canvas.getContext('2d')
    if (!context) return
    drawCaption(context, PREVIEW_CAPTION, 1.5, style, canvas.width, canvas.height)
  }, [fontsReady, style])

  return (
    <button
      className={`caption-style-card${selected ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
    >
      <canvas ref={canvasRef} width="240" height="135" aria-hidden="true" />
      <span>{CAPTION_PRESETS.find((preset) => preset.id === style.preset)?.name}</span>
    </button>
  )
}

/**
 * Transcribes a local video and provides a timed, styled caption editor.
 *
 * @param {{tool: {id: string, name: string, description: string, icon: string, accent: string}}} props Registry tool metadata.
 * @returns {import('react').JSX.Element} Captions generator.
 */
function Captions({ tool }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const previewFrameRef = useRef(null)
  const editorListRef = useRef(null)
  const abortControllerRef = useRef(null)
  const audioCacheRef = useRef(null)
  const exportAbortControllerRef = useRef(null)
  const progressRef = useRef(null)
  const activeCaptionRef = useRef(-1)
  const [file, setFile] = useState(null)
  const [flowStep, setFlowStep] = useState(1)
  const audioReadyRef = useRef(null)
  const preview = usePreviewFallback({
    file,
    videoRef,
    // Audio extraction for captions goes first in the shared FFmpeg queue.
    waitBeforeFFmpeg: () => audioReadyRef.current ?? Promise.resolve(),
  })
  const previewUrl = preview.previewUrl
  const [mediaInfo, setMediaInfo] = useState(null)
  const [previewDimensions, setPreviewDimensions] = useState({ width: 0, height: 0 })
  const [previewMaxWidth, setPreviewMaxWidth] = useState(640)
  const [frameRate, setFrameRate] = useState(null)
  const [previewFrameVersion, setPreviewFrameVersion] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [activeCaptionIndex, setActiveCaptionIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [model, setModel] = useState('balanced')
  const [language, setLanguage] = useState('auto')
  const [spokenLanguage, setSpokenLanguage] = useState(null)
  const [showLanguagePicker, setShowLanguagePicker] = useState(false)
  const [pace, setPace] = useState(5)
  const [captions, setCaptions] = useState([])
  const [words, setWords] = useState([])
  const [style, setStyle] = useState(getInitialStyle)
  const [openPanel, setOpenPanel] = useState(null)
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(null)
  const [liveWords, setLiveWords] = useState([])
  const [startedAt, setStartedAt] = useState(0)
  const [progressUpdatedAt, setProgressUpdatedAt] = useState(0)
  const [failedStage, setFailedStage] = useState(null)
  const [error, setError] = useState('')
  const [technicalDetails, setTechnicalDetails] = useState('')
  const [lastProject, setLastProject] = useState(null)
  const [restoredProject, setRestoredProject] = useState(false)
  const [fontsReady, setFontsReady] = useState(false)
  const [exportStatus, setExportStatus] = useState('idle')
  const [exportResult, setExportResult] = useState(null)
  const [exportProgress, setExportProgress] = useState(null)
  const [exportError, setExportError] = useState('')
  const [exportTechnicalDetails, setExportTechnicalDetails] = useState('')
  const [exportStartedAt, setExportStartedAt] = useState(0)
  const [exportElapsed, setExportElapsed] = useState(0)
  const [exportFallbackReason, setExportFallbackReason] = useState('')
  const exportResultFile = useMemo(
    () =>
      exportResult
        ? new File([exportResult.blob], exportResult.filename, {
            type: exportResult.blob.type || 'video/mp4',
            lastModified: Date.now(),
          })
        : null,
    [exportResult],
  )
  const exportResultUrl = useObjectUrl(exportResultFile)
  const isProcessing = status === 'processing' || exportStatus === 'processing'
  const hasCaptions = captions.length > 0
  // Export burns captions into the original unless the browser cannot decode
  // its picture; then it uses the 960px preview copy.
  const exportNeedsPreviewProxy = preview.frameAvailable === false
  const exportWaitingForFrame = preview.frameAvailable === null
  const exportUsesPreviewProxy = exportNeedsPreviewProxy && Boolean(preview.previewFile)
  const previewSize = getPreviewSize(
    previewDimensions.width,
    previewDimensions.height,
    previewMaxWidth,
    Math.min(440, window.innerHeight * 0.5),
  )
  const captionWords = useMemo(() => getCaptionExportWords(captions), [captions])
  const settingsSnapshot = useMemo(
    () => JSON.stringify({ captions, style }),
    [captions, style],
  )
  const resultSettingsChanged =
    Boolean(exportResult) && exportResult.settingsSnapshot !== settingsSnapshot
  const exportWarning = shouldWarnAboutCaptionExport({
    duration: mediaInfo?.duration ?? 0,
    width: mediaInfo?.width ?? 0,
    height: mediaInfo?.height ?? 0,
    frameRate,
  })
  const { cardRef, highlighted } = useResultCardAttention(exportResult)
  const reviewWords = useMemo(
    () => findCaptionReviewWords(captions, spokenLanguage),
    [captions, spokenLanguage],
  )
  useEffect(() => {
    let active = true
    waitForCaptionFonts()
      .then(() => {
        if (active) setFontsReady(true)
      })
      .catch((fontError) => {
        console.error('Could not load bundled caption fonts.', fontError)
        if (active) setFontsReady(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(STYLE_STORAGE_KEY, JSON.stringify(style))
    } catch (storageError) {
      console.error('Could not save the caption style locally.', storageError)
    }
  }, [style])

  useEffect(() => {
    let active = true
    loadLatestCaptionProject()
      .then((project) => {
        if (active) setLastProject(project)
      })
      .catch((storageError) => {
        console.error('Could not restore the saved caption project.', storageError)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => () => {
    abortControllerRef.current?.abort()
    audioCacheRef.current = null
  }, [])
  useEffect(() => () => exportAbortControllerRef.current?.abort(), [])

  useEffect(() => {
    if (exportStatus !== 'processing') return undefined
    const timer = window.setInterval(() => {
      setExportElapsed(getMonotonicTime() - exportStartedAt)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [exportStartedAt, exportStatus])

  useEffect(() => {
    const frame = previewFrameRef.current
    if (!frame) return undefined

    function updateWidth() {
      setPreviewMaxWidth(frame.clientWidth)
    }

    updateWidth()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth)
      return () => window.removeEventListener('resize', updateWidth)
    }

    const observer = new ResizeObserver(updateWidth)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [file])

  useEffect(() => {
    let active = true
    if (!file) {
      return () => {
        active = false
      }
    }
    getMediaInfo(file)
      .then((info) => {
        if (active) {
          setMediaInfo((current) => ({
            ...info,
            width: info.width || current?.width || 0,
            height: info.height || current?.height || 0,
            duration: getMediaDuration(current?.duration, info.duration),
          }))
          setPreviewDimensions((current) => ({
            width: current.width || info.width || 0,
            height: current.height || info.height || 0,
          }))
        }
      })
      .catch((mediaError) => {
        console.error('Could not inspect the selected video.', mediaError)
      })
    getVideoFrameRate(file)
      .then((rate) => {
        if (active) setFrameRate(rate)
      })
      .catch((frameRateError) => {
        console.error('Could not estimate the video frame rate.', frameRateError)
        if (active) setFrameRate(null)
      })
    return () => {
      active = false
    }
  }, [file])

  useEffect(() => {
    if (!file || captions.length === 0 || isProcessing) return undefined
    const timer = window.setTimeout(() => {
      const project = {
        words,
        captions,
        style,
        pace,
        fileName: file.name,
        language: spokenLanguage,
        duration: mediaInfo?.duration ?? 0,
      }
      saveLatestCaptionProject(project)
        .then(() => setLastProject(project))
        .catch((storageError) => {
          console.error('Could not save the caption project locally.', storageError)
        })
    }, 450)
    return () => window.clearTimeout(timer)
  }, [captions, file, isProcessing, language, mediaInfo, pace, spokenLanguage, style, words])

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!video || !canvas || !context || !fontsReady) return undefined

    let animationFrame = 0
    let videoFrame = 0
    let cancelled = false

    function paint() {
      if (cancelled) return
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
        }
        const time = video.currentTime || 0
        const nextCaptionIndex = getActiveCaption(captions, time)
        if (activeCaptionRef.current !== nextCaptionIndex) {
          activeCaptionRef.current = nextCaptionIndex
          setActiveCaptionIndex(nextCaptionIndex)
        }
        const activeCaption = nextCaptionIndex >= 0 ? captions[nextCaptionIndex] : null
        drawCaption(context, activeCaption, time, style, canvas.width, canvas.height)
        setCurrentTime((previous) => Math.abs(previous - time) > 0.08 ? time : previous)
      }
      if (!video.paused && !video.ended) {
        if (typeof video.requestVideoFrameCallback === 'function') {
          videoFrame = video.requestVideoFrameCallback(paint)
        } else {
          animationFrame = requestAnimationFrame(paint)
        }
      }
    }

    paint()
    return () => {
      cancelled = true
      if (animationFrame) cancelAnimationFrame(animationFrame)
      if (videoFrame && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(videoFrame)
      }
    }
  }, [
    captions,
    fontsReady,
    isPlaying,
    mediaInfo?.height,
    mediaInfo?.width,
    previewFrameVersion,
    previewUrl,
    style,
  ])

  useEffect(() => {
    const activeRow = editorListRef.current?.querySelector('[data-active="true"]')
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    activeRow?.scrollIntoView({
      block: 'nearest',
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
  }, [activeCaptionIndex])

  function handleVideoMetadata(event) {
    preview.videoHandlers.onLoadedMetadata(event)
    const video = event.currentTarget
    if (video.currentSrc !== previewUrl) return
    const width = video.videoWidth
    const height = video.videoHeight
    if (width > 0 && height > 0) {
      setPreviewDimensions({ width, height })
      // The preview copy is smaller than the original; keep the source size.
      setMediaInfo((current) => ({
        ...current,
        ...(preview.usingProxy
          ? {}
          : { width: current?.width || width, height: current?.height || height, hasVideo: true }),
        duration: getMediaDuration(video.duration, current?.duration),
      }))
    }
    setPreviewFrameVersion((version) => version + 1)
  }

  function handlePreviewLoadedData(event) {
    preview.videoHandlers.onLoadedData(event)
    setPreviewFrameVersion((version) => version + 1)
  }

  function chooseFile(selectedFile) {
    if (!isVideoFile(selectedFile)) {
      setError('Choose a video file to continue.')
      return
    }
    abortControllerRef.current?.abort()
    exportAbortControllerRef.current?.abort()
    const shouldRestore = restoredProject && lastProject?.fileName === selectedFile.name
    setFile(selectedFile)
    setFlowStep(shouldRestore ? 3 : 2)
    audioCacheRef.current = null
    setMediaInfo(null)
    setPreviewDimensions({ width: 0, height: 0 })
    setFrameRate(null)
    setPreviewFrameVersion(0)
    setExportResult(null)
    setExportStatus('idle')
    setExportProgress(null)
    setExportError('')
    setExportTechnicalDetails('')
    setExportFallbackReason('')
    setCurrentTime(0)
    setActiveCaptionIndex(-1)
    activeCaptionRef.current = -1
    setIsPlaying(false)
    setError('')
    setTechnicalDetails('')
    setFailedStage(null)
    setProgress(null)
    setStatus(shouldRestore ? 'done' : 'idle')
    if (shouldRestore) {
      setWords(lastProject.words ?? [])
      setCaptions(lastProject.captions ?? [])
      setStyle(createCaptionStyle(lastProject.style?.preset, lastProject.style))
      setPace(lastProject.pace ?? 5)
      setSpokenLanguage(lastProject.language ?? null)
    } else {
      setWords([])
      setCaptions([])
      setSpokenLanguage(null)
      setRestoredProject(false)
      // Start captioning straight away; the original video stays in the
      // preview while it works.
      void runTranscription(selectedFile, { auto: true })
    }
  }

  function startOver() {
    abortControllerRef.current?.abort()
    exportAbortControllerRef.current?.abort()
    setFile(null)
    setFlowStep(1)
    audioCacheRef.current = null
    setMediaInfo(null)
    setPreviewDimensions({ width: 0, height: 0 })
    setFrameRate(null)
    setPreviewFrameVersion(0)
    setCurrentTime(0)
    setActiveCaptionIndex(-1)
    activeCaptionRef.current = -1
    setIsPlaying(false)
    setWords([])
    setCaptions([])
    setSpokenLanguage(null)
    setProgress(null)
    setStatus('idle')
    setError('')
    setTechnicalDetails('')
    setFailedStage(null)
    setRestoredProject(false)
    setExportResult(null)
    setExportStatus('idle')
    setExportProgress(null)
    setExportError('')
    setExportTechnicalDetails('')
    setExportFallbackReason('')
  }

  function restoreProject() {
    if (!lastProject) return
    setWords(lastProject.words ?? [])
    setCaptions(lastProject.captions ?? [])
    setStyle(createCaptionStyle(lastProject.style?.preset, lastProject.style))
    setPace(lastProject.pace ?? 5)
    setSpokenLanguage(lastProject.language ?? null)
    setRestoredProject(true)
    setError('')
  }

  function updateProgress(nextProgress) {
    if (Array.isArray(nextProgress.partialWords)) setLiveWords(nextProgress.partialWords)
    const previousStage = progressRef.current?.stage
    progressRef.current = nextProgress
    setProgress(nextProgress)
    if (
      Number.isFinite(nextProgress.percent) ||
      Number.isFinite(nextProgress.chunk) ||
      nextProgress.stage !== previousStage
    ) {
      setProgressUpdatedAt(getMonotonicTime())
    }
  }

  function handleVideoSeeked(event) {
    preview.videoHandlers.onSeeked(event)
    const video = event.currentTarget
    setCurrentTime(video.currentTime)
    setPreviewFrameVersion((version) => version + 1)
  }

  /**
   * Transcribes the video into timed words and lays them out as captions.
   *
   * @param {File} [sourceFile] File to use; defaults to the selected file.
   *   Passed explicitly right after upload, before state has updated.
   * @param {{auto?: boolean}} [options] `auto` runs start on upload and move
   *   to Style and export when they finish.
   */
  async function runTranscription(sourceFile = file, { auto = false } = {}) {
    if (!(sourceFile instanceof File) || (!auto && isProcessing)) return
    const controller = new AbortController()
    abortControllerRef.current = controller
    const now = getMonotonicTime()
    videoRef.current?.pause()
    setIsPlaying(false)
    setStatus('processing')
    setLiveWords([])
    setProgress({ stage: 'loading-model', percent: null })
    progressRef.current = { stage: 'loading-model', percent: null }
    setStartedAt(now)
    setProgressUpdatedAt(now)
    setError('')
    setTechnicalDetails('')
    setFailedStage(null)

    // Extract the audio while the model loads. It is quick, and starting it
    // first keeps it ahead of any FFmpeg preview copy in the queue.
    const cached = audioCacheRef.current?.file === sourceFile
    const audioPromise = cached
      ? Promise.resolve(audioCacheRef.current.samples)
      : decodeAudio(sourceFile, { signal: controller.signal })
    audioReadyRef.current = audioPromise
    audioPromise.catch(() => {})

    try {
      const prepared = await prepareWhisperModel(model, {
        signal: controller.signal,
        onProgress: updateProgress,
      })
      if (controller.signal.aborted) return

      updateProgress({ stage: 'loading-model', backend: prepared.backend, percent: 100 })
      updateProgress({ stage: 'reading-audio', backend: prepared.backend, percent: null })
      const audio = await audioPromise
      if (controller.signal.aborted) return
      if (!cached) audioCacheRef.current = { file: sourceFile, samples: audio }
      updateProgress({ stage: 'reading-audio', backend: prepared.backend, percent: 100 })

      const transcription = await transcribe(audio, {
        model,
        language: language === 'auto' ? undefined : language,
        signal: controller.signal,
        onProgress: updateProgress,
      })
      if (controller.signal.aborted) return

      updateProgress({ stage: 'finishing', backend: transcription.backend, percent: null })
      const nextWords = transcription.words
      const nextCaptions = layoutCaptions(nextWords, pace)
      setWords(nextWords)
      setCaptions(nextCaptions)
      setSpokenLanguage(transcription.language)
      setRestoredProject(false)
      setStatus('done')
      if (auto && nextCaptions.length > 0) {
        // Land on Style and export so pace and style can be tried right away
        // over the same preview. Respect a step the user picked meanwhile.
        setFlowStep((current) => (current === 2 ? 3 : current))
        setOpenPanel((current) => current ?? 'style')
      }
    } catch (caughtError) {
      // A newer run (for example after choosing another video) owns the UI.
      if (abortControllerRef.current !== controller) return
      if (caughtError?.name === 'AbortError' || controller.signal.aborted) {
        setStatus(captions.length > 0 ? 'done' : 'idle')
      } else {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Could not create captions from this video. Check it and try again.',
        )
        setTechnicalDetails(caughtError?.technicalDetails ?? '')
        setFailedStage(progressRef.current?.stage ?? 'loading-model')
        setStatus('error')
      }
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null
      if (audioReadyRef.current === audioPromise) audioReadyRef.current = null
    }
  }

  async function runCaptionExport() {
    if (!file || captions.length === 0 || isProcessing) return
    const exportFile = exportUsesPreviewProxy ? preview.previewFile : file
    if (!exportFile) return
    const controller = new AbortController()
    exportAbortControllerRef.current = controller
    const started = getMonotonicTime()
    setExportStatus('processing')
    setExportProgress({ stage: 'preparing', percent: null })
    setExportStartedAt(started)
    setExportElapsed(0)
    setExportError('')
    setExportTechnicalDetails('')
    setExportFallbackReason('')
    setError('')
    if (captions.length > 0) setStatus('done')
    videoRef.current?.pause()
    setIsPlaying(false)

    try {
      const output = await exportCaptionVideo(exportFile, captions, style, {
        signal: controller.signal,
        hasAudio: mediaInfo?.hasAudio ?? 'unknown',
        onProgress: (nextProgress) => setExportProgress(nextProgress),
        onFallback: (reason) => {
          setExportFallbackReason(reason)
          setExportProgress({ stage: 'recording', percent: null })
        },
      })
      if (controller.signal.aborted) return
      setExportResult({
        ...output,
        aspectRatio: output.width / output.height,
        settingsSnapshot,
        duration: Number.isFinite(output.duration)
          ? output.duration
          : Number.isFinite(videoRef.current?.duration)
            ? videoRef.current.duration
            : duration,
      })
      setExportProgress({ stage: 'complete', percent: 100 })
      setExportStatus('done')
    } catch (caughtError) {
      if (caughtError?.name === 'AbortError' || controller.signal.aborted) {
        setExportStatus(exportResult ? 'done' : 'idle')
      } else {
        setExportError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Could not export this video. Check available memory and try again.',
        )
        setExportTechnicalDetails(
          caughtError?.technicalDetails ??
            (caughtError?.cause instanceof Error ? caughtError.cause.message : ''),
        )
        setExportStatus('error')
      }
    } finally {
      if (exportAbortControllerRef.current === controller) {
        exportAbortControllerRef.current = null
      }
    }
  }

  async function togglePlayback() {
    const video = videoRef.current
    if (!video || isProcessing) return
    if (video.paused) {
      try {
        await video.play()
      } catch (playError) {
        console.error('Could not play the selected video.', playError)
        setError('This video could not be played in the browser.')
      }
    } else {
      video.pause()
    }
  }

  function seekVideo(time) {
    const video = videoRef.current
    if (!video) return
    video.currentTime = time
    setCurrentTime(time)
    const activeIndex = getActiveCaption(captions, time)
    activeCaptionRef.current = activeIndex
    setActiveCaptionIndex(activeIndex)
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (fontsReady && canvas && context) {
      const index = getActiveCaption(captions, time)
      drawCaption(context, index >= 0 ? captions[index] : null, time, style, canvas.width, canvas.height)
    }
  }

  function updateCaption(index, updater) {
    setCaptions((current) =>
      current.map((caption, captionIndex) =>
        captionIndex === index ? updater(caption) : caption,
      ),
    )
  }

  function setPaceStep(stepIndex) {
    const nextPace = CAPTION_PACES[stepIndex]?.value
    if (nextPace === undefined) return
    setPace(nextPace)
    if (captions.length > 0) {
      const currentWords = captions.flatMap((caption) => caption.words)
      setWords(currentWords)
      setCaptions(layoutCaptions(currentWords, nextPace))
    } else if (words.length > 0) {
      setCaptions(layoutCaptions(words, nextPace))
    }
  }

  function changePreset(preset) {
    setStyle(createCaptionStyle(preset))
  }

  function changeStyle(property, value) {
    setStyle((current) => ({ ...current, [property]: value }))
  }

  function handleSplit(index) {
    setCaptions((current) => {
      const [first, second] = splitCaption(current[index])
      if (!second) return current
      return [...current.slice(0, index), first, second, ...current.slice(index + 1)]
    })
  }

  function handleMerge(index) {
    setCaptions((current) => mergeCaptions(current, index))
  }

  function downloadCaptionedVideo() {
    if (!exportResult || !exportResultUrl) return
    const link = document.createElement('a')
    link.href = exportResultUrl
    link.download = exportResult.filename
    link.click()
  }

  const duration = getMediaDuration(mediaInfo?.duration)
  const stageId = failedStage ?? progress?.stage ?? 'loading-model'
  const progressDetail = formatProgressDetail(progress, duration)
  const actionLabel = status === 'error'
    ? 'Try again'
    : captions.length > 0
      ? 'Transcribe again'
      : 'Create captions'
  const paceIndex = CAPTION_PACES.findIndex((option) => option.value === pace)
  const languageLabel = getLanguageLabel(spokenLanguage)
  const shouldWarnAboutLongVideo =
    duration > 3 * 60 || (file?.size ?? 0) > 500 * 1024 * 1024

  const transcriptionForm = (
    <>
      <p className="captions-model-note">
        The selected model downloads on its first run and is cached on this device.
      </p>
      {spokenLanguage && (
        <div className="captions-language-row">
          <p>
            Spoken language: <strong>{languageLabel}, detected</strong>
          </p>
          <button
            type="button"
            className="text-button"
            disabled={isProcessing}
            onClick={() => setShowLanguagePicker((visible) => !visible)}
          >
            Change
          </button>
        </div>
      )}
      {(!spokenLanguage || showLanguagePicker) && (
        <label className="captions-field" htmlFor="captions-language">
          Language
          <select
            id="captions-language"
            value={language}
            disabled={isProcessing}
            onChange={(event) => setLanguage(event.target.value)}
          >
            {LANGUAGE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      )}
      <label className="captions-field" htmlFor="captions-model">
        Model
        <select
          id="captions-model"
          value={model}
          disabled={isProcessing}
          onChange={(event) => setModel(event.target.value)}
        >
          {MODEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      {shouldWarnAboutLongVideo && (
        <p className="captions-warning" role="status">
          Long videos can be slow and use a lot of memory. Close other tabs.
        </p>
      )}
      {status === 'error' && (
        <div className="captions-error" role="alert">
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
        variant={captions.length > 0 ? 'outline' : 'primary'}
        className="captions-transcribe-button"
        disabled={isProcessing}
        onClick={() => runTranscription()}
      >
        {actionLabel}
      </Button>
        {status === 'error' && (
          <ProcessingRing
            stages={PROCESSING_STAGES}
            stageId={stageId}
            percent={progress?.percent ?? null}
            startedAt={startedAt}
            progressUpdatedAt={progressUpdatedAt}
            detail={progressDetail}
            failedStage={failedStage}
            onCancel={
              status === 'processing'
                ? () => abortControllerRef.current?.abort()
                : undefined
            }
          />
        )}
    </>
  )

  return (
    <ToolLayout
      tool={tool}
      headerAction={file && (
        <Button
          variant="secondary"
          className="tool-change-button"
          onClick={startOver}
          disabled={isProcessing}
        >
          Choose a different video
        </Button>
      )}
    >
      <div className="media-tool-app captions-tool">
        {!file ? (
          <section className="media-tool-upload captions-upload" aria-label="Upload a video">
            <UploadBox
              onFileSelect={chooseFile}
              accept="video/*"
              title="Choose or drop a video"
              helpText="Your video stays on this device."
              formats="MP4, MOV, WebM, MKV and more"
            />
            {lastProject && (
              <Button variant="secondary" onClick={restoreProject}>
                Restore last project
              </Button>
            )}
            {restoredProject && (
              <p className="captions-restored-note" role="status">
                Project restored. Choose its source video to preview and edit it.
              </p>
            )}
            {error && <p className="tool-error" role="alert">{error}</p>}
          </section>
        ) : (
          <>
            <nav className="captions-stepper" aria-label="Caption workflow">
              {CAPTION_FLOW_STEPS.map(({ number, label }) => {
                const available = canOpenCaptionStep(number, hasCaptions)
                return (
                  <button
                    key={number}
                    type="button"
                    className={[
                      'captions-step',
                      flowStep === number ? 'is-active' : '',
                      available && flowStep !== number ? 'is-available' : '',
                      hasCaptions && number < 3 ? 'is-complete' : '',
                    ].filter(Boolean).join(' ')}
                    aria-current={flowStep === number ? 'step' : undefined}
                    aria-disabled={!available}
                    onClick={() => {
                      if (available) setFlowStep(number)
                    }}
                  >
                    <span>{number}</span>
                    {label}
                  </button>
                )
              })}
            </nav>
            <div className="editor-layout captions-editor-layout">
              <div className="editor-preview-column">
                <section className="tool-panel captions-preview-panel" aria-label="Video preview">
                  <div className="panel-heading">
                    <div>
                      <h2>Preview</h2>
                      <p>
                        {file.name}
                        {' · '}
                        {mediaInfo?.width && mediaInfo?.height
                          ? `${mediaInfo.width} × ${mediaInfo.height} · `
                          : ''}
                        {formatDuration(duration)}
                      </p>
                    </div>
                    {captions.length > 0 && (
                      <span className="captions-count">
                        {captions.length} {captions.length === 1 ? 'caption' : 'captions'}
                      </span>
                    )}
                  </div>
                  <div ref={previewFrameRef} className="captions-video-frame">
                    <VideoPreview
                      videoRef={videoRef}
                      src={previewUrl}
                      frameClassName="captions-video-stage"
                      frameStyle={{
                        width: previewSize.width || '100%',
                        height: previewSize.height || undefined,
                        aspectRatio:
                          previewDimensions.width && previewDimensions.height
                            ? `${previewDimensions.width} / ${previewDimensions.height}`
                            : undefined,
                      }}
                      videoClassName="captions-video"
                      videoProps={{
                        playsInline: true,
                        preload: 'metadata',
                        onLoadedMetadata: handleVideoMetadata,
                        onLoadedData: handlePreviewLoadedData,
                        onSeeked: handleVideoSeeked,
                        onTimeUpdate: (event) => {
                          const video = event.currentTarget
                          const time = video.currentTime
                          setCurrentTime(time)
                          const nextIndex = getActiveCaption(captions, time)
                          activeCaptionRef.current = nextIndex
                          setActiveCaptionIndex(nextIndex)
                        },
                        onPlay: () => setIsPlaying(true),
                        onPause: () => setIsPlaying(false),
                        onError: preview.videoHandlers.onError,
                      }}
                    >
                      {fontsReady && (
                        <canvas
                          ref={canvasRef}
                          className="captions-overlay"
                          aria-hidden="true"
                        />
                      )}
                      {status === 'processing' && (
                        <div className="captions-listening-badge" aria-hidden="true">
                          <span className="captions-listening-bars">
                            <span />
                            <span />
                            <span />
                            <span />
                          </span>
                          {progress?.stage === 'transcribing'
                            ? 'Listening'
                            : progress?.stage === 'finishing'
                              ? 'Almost done'
                              : 'Getting ready'}
                        </div>
                      )}
                      {preview.showPoster && (
                        <PreviewPoster
                          fileName={file.name}
                          codec={preview.sourceInfo?.codec ?? mediaInfo?.codec}
                          status={preview.status}
                          progress={preview.progress}
                          startedAt={preview.conversionStartedAt}
                          progressUpdatedAt={preview.progressUpdatedAt}
                          message={preview.message}
                          technicalDetails={preview.technicalDetails}
                          note="Captions are made from the audio, so they keep working while the picture is unavailable."
                          onCancel={preview.cancelConversion}
                        />
                      )}
                      {!preview.showPoster && preview.status === 'converting' && (
                        <PreviewCopyBadge
                          progress={preview.progress}
                          onCancel={preview.cancelConversion}
                        />
                      )}
                    </VideoPreview>
                  </div>
                  {!fontsReady && (
                    <p className="captions-font-loading" role="status">
                      Preparing caption fonts…
                    </p>
                  )}
                  <VideoPlayerControls
                    currentTime={currentTime}
                    duration={duration}
                    isPlaying={isPlaying}
                    disabled={isProcessing || duration <= 0}
                    onPlayPause={togglePlayback}
                    onSeek={seekVideo}
                  />
                </section>
              </div>

              <div className="editor-controls">
                {flowStep === 1 && (
                  <section className="tool-panel captions-locked-panel" aria-label="Locked caption tools">
                    <h2>Style and export</h2>
                    <div className="captions-panel-tabs" aria-label="Locked tools">
                      <button type="button" disabled>Pace</button>
                      <button type="button" disabled>Style</button>
                      <button type="button" disabled>Export video</button>
                    </div>
                    <p>Create the words first to unlock Pace, Style, and Export.</p>
                    <Button className="captions-next-step" onClick={() => setFlowStep(2)}>
                      Continue to words
                    </Button>
                  </section>
                )}
                {flowStep === 3 && (
                <>
                <button
                  type="button"
                  className="captions-back-to-words"
                  onClick={() => setFlowStep(2)}
                >
                  Back to words
                </button>
                <section className="tool-panel captions-settings-panel" aria-label="Caption settings">
                  <div className="captions-panel-tabs" role="group" aria-label="Caption settings panels">
                    <button
                      type="button"
                      className={openPanel === 'pace' ? 'is-active' : ''}
                      aria-expanded={openPanel === 'pace'}
                      disabled={isProcessing}
                      onClick={() => setOpenPanel(openPanel === 'pace' ? null : 'pace')}
                    >
                      Pace <ChevronDown size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={openPanel === 'style' ? 'is-active' : ''}
                      aria-expanded={openPanel === 'style'}
                      disabled={isProcessing}
                      onClick={() => setOpenPanel(openPanel === 'style' ? null : 'style')}
                    >
                      Style <ChevronDown size={16} aria-hidden="true" />
                    </button>
                  </div>

                  {openPanel === 'pace' && (
                    <div className="captions-settings-content">
                      <label className="captions-control-label" htmlFor="caption-pace">
                        <span>Pace</span>
                        <strong>{CAPTION_PACES[paceIndex]?.label}</strong>
                      </label>
                      <input
                        id="caption-pace"
                        type="range"
                        min="0"
                        max={CAPTION_PACES.length - 1}
                        step="1"
                        value={Math.max(0, paceIndex)}
                        disabled={isProcessing}
                        onChange={(event) => setPaceStep(Number(event.target.value))}
                        aria-label="Caption pace"
                      />
                      <div className="caption-pace-labels" aria-hidden="true">
                        <span>1 word</span><span>Sentence</span>
                      </div>
                    </div>
                  )}

                  {openPanel === 'style' && (
                    <div className="captions-settings-content captions-style-scroll">
                      <fieldset className="caption-style-grid">
                        <legend>Caption style</legend>
                        {CAPTION_PRESETS.map((preset) => {
                          const previewStyle = createCaptionStyle(preset.id, {
                            ...style,
                            ...preset.style,
                            preset: preset.id,
                          })
                          return (
                            <CaptionStyleThumbnail
                              key={preset.id}
                              style={previewStyle}
                              selected={style.preset === preset.id}
                              disabled={!fontsReady || isProcessing}
                              fontsReady={fontsReady}
                              onSelect={() => changePreset(preset.id)}
                            />
                          )
                        })}
                      </fieldset>

                      <label className="caption-toggle">
                        <input
                          type="checkbox"
                          checked={style.allCaps}
                          disabled={isProcessing}
                          onChange={(event) => changeStyle('allCaps', event.target.checked)}
                        />
                        <span>ALL CAPS</span>
                      </label>

                      <label className="caption-control-label" htmlFor="caption-font">
                        Font
                      </label>
                      <select
                        id="caption-font"
                        value={style.fontFamily}
                        disabled={isProcessing}
                        onChange={(event) => changeStyle('fontFamily', event.target.value)}
                      >
                        {CAPTION_FONTS.map((font) => (
                          <option key={font.name} value={font.name}>{font.name}</option>
                        ))}
                      </select>

                      <fieldset className="caption-animation-picker">
                        <legend>Animation</legend>
                        <div>
                          {CAPTION_ANIMATIONS.map((animation) => (
                            <button
                              key={animation.id}
                              type="button"
                              aria-pressed={style.animation === animation.id}
                              className={style.animation === animation.id ? 'is-active' : ''}
                              disabled={isProcessing}
                              onClick={() => changeStyle('animation', animation.id)}
                            >
                              {animation.name}
                            </button>
                          ))}
                        </div>
                      </fieldset>

                      <label className="caption-control-label" htmlFor="caption-size">
                        <span>Size</span><strong>{style.size}%</strong>
                      </label>
                      <input
                        id="caption-size"
                        type="range"
                        min="50"
                        max="200"
                        value={style.size}
                        disabled={isProcessing}
                        onChange={(event) => changeStyle('size', Number(event.target.value))}
                      />

                      <label className="caption-control-label" htmlFor="caption-position">
                        <span>Position</span><strong>{style.position}% from bottom</strong>
                      </label>
                      <input
                        id="caption-position"
                        type="range"
                        min="0"
                        max="100"
                        value={style.position}
                        disabled={isProcessing}
                        onChange={(event) => changeStyle('position', Number(event.target.value))}
                      />

                      <label className="caption-color-control" htmlFor="caption-text-color">
                        Text colour
                        <input
                          id="caption-text-color"
                          type="color"
                          value={style.textColor}
                          disabled={isProcessing}
                          onChange={(event) => changeStyle('textColor', event.target.value)}
                        />
                      </label>

                      <div className="caption-highlight-control">
                        <span>Highlight colour</span>
                        <div className="caption-highlight-swatches">
                          {HIGHLIGHT_SWATCHES.map((color) => (
                            <button
                              key={color}
                              type="button"
                              aria-label={`Use highlight colour ${color}`}
                              aria-pressed={style.highlightColor === color}
                              disabled={isProcessing}
                              style={{ '--swatch-color': color }}
                              onClick={() => changeStyle('highlightColor', color)}
                            />
                          ))}
                          <label className="caption-custom-color" title="Custom highlight colour">
                            Custom
                            <input
                              type="color"
                              value={style.highlightColor}
                              aria-label="Choose custom highlight colour"
                              disabled={isProcessing}
                              onChange={(event) => changeStyle('highlightColor', event.target.value)}
                            />
                          </label>
                        </div>
                      </div>

                      <label className="caption-control-label" htmlFor="caption-background-opacity">
                        <span>Background opacity</span><strong>{style.backgroundOpacity}%</strong>
                      </label>
                      <input
                        id="caption-background-opacity"
                        type="range"
                        min="0"
                        max="100"
                        value={style.backgroundOpacity}
                        disabled={isProcessing}
                        onChange={(event) =>
                          changeStyle('backgroundOpacity', Number(event.target.value))
                        }
                      />

                      <label className="caption-control-label" htmlFor="caption-stroke-width">
                        <span>Stroke width</span><strong>{style.strokeWidth}px</strong>
                      </label>
                      <input
                        id="caption-stroke-width"
                        type="range"
                        min="0"
                        max="8"
                        step="1"
                        value={style.strokeWidth}
                        disabled={isProcessing}
                        onChange={(event) => changeStyle('strokeWidth', Number(event.target.value))}
                      />

                      <label className="caption-control-label" htmlFor="caption-animation-speed">
                        <span>Animation speed</span><strong>{style.animationSpeed.toFixed(1)}×</strong>
                      </label>
                      <input
                        id="caption-animation-speed"
                        type="range"
                        min="0.5"
                        max="2"
                        step="0.1"
                        value={style.animationSpeed}
                        disabled={isProcessing}
                        onChange={(event) =>
                          changeStyle('animationSpeed', Number(event.target.value))
                        }
                      />
                    </div>
                  )}
                </section>
                </>
                )}

                {flowStep === 2 && hasCaptions && (
                <section
                  className="tool-panel captions-editor-panel"
                  aria-labelledby="caption-list-heading"
                >
                  <div className="panel-heading">
                    <div>
                      <h2 id="caption-list-heading">Caption editor</h2>
                      <p>
                        {spokenLanguage
                          ? `Spoken language: ${languageLabel}, detected`
                          : 'Edit wording and timing while keeping each caption in sync.'}
                      </p>
                    </div>
                    <span className="captions-count">{captions.length} total</span>
                  </div>
                  <ol className="captions-list" ref={editorListRef}>
                    {captions.map((caption, index) => {
                      const active = index === activeCaptionIndex
                      const activeWordIndex = active
                        ? getActiveWordIndex(caption, currentTime)
                        : -1
                      return (
                        <li
                          key={`${caption.start}-${index}`}
                          className={`caption-row${active ? ' is-active' : ''}`}
                          data-active={active ? 'true' : 'false'}
                          onClick={(event) => {
                            if (
                              !isProcessing &&
                              !event.target.closest('button, textarea')
                            ) {
                              seekVideo(caption.start)
                            }
                          }}
                        >
                          <div className="caption-row-top">
                            <button
                              type="button"
                              className="caption-time-button"
                              disabled={isProcessing}
                              onClick={() => seekVideo(caption.start)}
                              aria-label={`Seek to caption ${index + 1} at ${formatTime(caption.start)}`}
                            >
                              {formatTime(caption.start)}
                            </button>
                            <div className="caption-row-actions">
                              <span className="caption-nudge-group" aria-label="Adjust caption start">
                                <button type="button" aria-label="Move start earlier by 0.05 seconds" disabled={isProcessing} onClick={() => updateCaption(index, (item) => nudgeCaptionStart(item, -NUDGE_SECONDS))}><ChevronLeft size={15} /></button>
                                <button type="button" aria-label="Move start later by 0.05 seconds" disabled={isProcessing} onClick={() => updateCaption(index, (item) => nudgeCaptionStart(item, NUDGE_SECONDS))}><ChevronRight size={15} /></button>
                              </span>
                              <span className="caption-nudge-group" aria-label="Adjust caption end">
                                <button type="button" aria-label="Move end earlier by 0.05 seconds" disabled={isProcessing} onClick={() => updateCaption(index, (item) => nudgeCaptionEnd(item, -NUDGE_SECONDS))}><ChevronLeft size={15} /></button>
                                <button type="button" aria-label="Move end later by 0.05 seconds" disabled={isProcessing} onClick={() => updateCaption(index, (item) => nudgeCaptionEnd(item, NUDGE_SECONDS))}><ChevronRight size={15} /></button>
                              </span>
                              <button
                                type="button"
                                className="caption-icon-button"
                                aria-label={`Split caption ${index + 1}`}
                                title="Split caption"
                                disabled={isProcessing || caption.words.length < 2}
                                onClick={() => handleSplit(index)}
                              >
                                <Scissors size={15} />
                              </button>
                              <button
                                type="button"
                                className="caption-icon-button"
                                aria-label={`Merge caption ${index + 1} with the next`}
                                title="Merge with next"
                                disabled={isProcessing || index === captions.length - 1}
                                onClick={() => handleMerge(index)}
                              >
                                <Merge size={15} />
                              </button>
                              <button
                                type="button"
                                className="caption-icon-button is-delete"
                                aria-label={`Delete caption ${index + 1}`}
                                title="Delete caption"
                                disabled={isProcessing}
                                onClick={() => setCaptions((current) => deleteCaption(current, index))}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                          <div className="caption-row-text">
                            <textarea
                              value={caption.text}
                              rows={Math.min(3, Math.max(1, Math.ceil(caption.text.length / 48)))}
                              aria-label={`Edit caption ${index + 1}`}
                              disabled={isProcessing}
                              onChange={(event) =>
                                updateCaption(index, (item) =>
                                  editCaptionText(item, event.target.value),
                                )
                              }
                            />
                            {caption.words.map((word, wordIndex) => {
                              const review = reviewWords.get(
                                `${word.start}:${word.end}:${word.word}`,
                              )
                              return review ? (
                                <span
                                  key={`${word.start}-${wordIndex}`}
                                  className="caption-review-marker"
                                  title={review}
                                >
                                  Check “{word.word}”
                                </span>
                              ) : null
                            })}
                          </div>
                          {active && activeWordIndex >= 0 && (
                            <span className="caption-current-word" aria-live="polite">
                              Playing word {activeWordIndex + 1} of {caption.words.length}
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                  {captions.length > 0 && (
                    <Button
                      className="captions-next-step"
                      disabled={isProcessing}
                      onClick={() => setFlowStep(3)}
                    >
                      Looks good, style them
                    </Button>
                  )}
                </section>
                )}
                {flowStep === 2 && (
                <section className="tool-panel captions-transcription-panel" aria-label="Speech to captions">
                  {status === 'processing' ? (
                    <div className="captions-working">
                      <div className="captions-working-heading">
                        <h2>Creating your captions</h2>
                        <p>
                          {MODEL_OPTIONS.find((option) => option.value === model)?.label.split(' · ')[0]} model
                          {' · '}
                          {language === 'auto' ? 'Auto-detect language' : getLanguageLabel(language)}
                          . Keep watching the preview while it works.
                        </p>
                      </div>
                      <ProcessingRing
                        stages={PROCESSING_STAGES}
                        stageId={stageId}
                        percent={progress?.percent ?? null}
                        startedAt={startedAt}
                        progressUpdatedAt={progressUpdatedAt}
                        detail={progressDetail}
                        failedStage={failedStage}
                        onCancel={
                          status === 'processing'
                            ? () => abortControllerRef.current?.abort()
                            : undefined
                        }
                      />
                      <LiveTranscript words={liveWords} />
                    </div>
                  ) : hasCaptions && status !== 'error' ? (
                    <details className="captions-redo">
                      <summary>Change language or model and redo</summary>
                      {transcriptionForm}
                    </details>
                  ) : (
                    <>
                      <h2>Speech to captions</h2>
                      {transcriptionForm}
                    </>
                  )}
                </section>
                )}
                {flowStep === 3 && (
                <section className="tool-panel captions-transcription-panel" aria-label="Export">
                  {exportUsesPreviewProxy && (
                    <p className="captions-warning" role="status">
                      The browser cannot decode the original picture. Export will use the preview copy at 960 px long edge.
                    </p>
                  )}
                  {exportNeedsPreviewProxy && !preview.previewFile && (
                    <p className="captions-warning" role="status">
                      {preview.status === 'converting'
                        ? 'This browser cannot decode the original picture, so export uses the preview copy. Export unlocks when the copy shown on the preview is ready.'
                        : 'This browser cannot decode the original picture and no preview copy could be made, so the video cannot be exported here. Convert it to a 1080p H.264 MP4 and try again.'}
                    </p>
                  )}
                  {captions.length > 0 && (
                    <div className="captions-export-controls" aria-label="Captioned video export">
                      <p className="captions-export-description">
                        Burn the current captions and style into a downloadable video.
                      </p>
                      {exportWarning && (
                        <p className="captions-warning" role="status">
                          Exporting this video may take longer and use substantial memory.
                        </p>
                      )}
                      <div className="captions-export-action-row">
                        <Button
                          variant={
                            exportStatus === 'processing' || !exportResult
                              ? 'primary'
                              : 'outline'
                          }
                          className={`captions-export-button${exportStatus === 'processing' ? ' is-exporting' : ''}`}
                          style={{
                            '--export-progress': `${Number.isFinite(exportProgress?.percent) ? exportProgress.percent : 0}%`,
                          }}
                          disabled={
                            isProcessing ||
                            !fontsReady ||
                            exportWaitingForFrame ||
                            (exportNeedsPreviewProxy && !preview.previewFile)
                          }
                          onClick={runCaptionExport}
                        >
                          {exportStatus === 'processing'
                            ? Number.isFinite(exportProgress?.percent)
                              ? `Exporting · ${exportProgress.percent}%`
                              : 'Preparing export…'
                            : exportStatus === 'error'
                              ? 'Try again'
                              : exportResult
                                ? 'Export again'
                                : 'Export video'}
                        </Button>
                        {exportStatus === 'processing' && (
                          <Button
                            variant="secondary"
                            className="captions-export-cancel"
                            onClick={() => exportAbortControllerRef.current?.abort()}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                      {exportStatus === 'processing' && (
                        <p className="captions-export-status" role="status" aria-live="polite">
                          {exportFallbackReason
                            ? 'This browser cannot use fast encoding. Recording in real time; it takes as long as the video plays.'
                            : exportProgress?.stage === 'encoding'
                              ? 'Encoding captioned video frames with WebCodecs.'
                              : 'Preparing video export.'}
                          {Number.isFinite(exportProgress?.percent) &&
                            ` ${exportProgress.percent}% complete.`}
                          {' '}Elapsed {formatElapsed(exportElapsed)}.
                        </p>
                      )}
                      {exportStatus === 'error' && (
                        <div className="captions-error" role="alert">
                          <p className="tool-error">{exportError}</p>
                          {exportTechnicalDetails && (
                            <details>
                              <summary>Details</summary>
                              <pre>{exportTechnicalDetails}</pre>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </section>
                )}
              </div>
            </div>
            {flowStep === 3 && exportResult && exportResultUrl && (
              <section className="captions-result-section" aria-label="Exported captioned video">
                <ResultCard
                  cardRef={cardRef}
                  result={{ ...exportResult, url: exportResultUrl }}
                  duration={formatDuration(exportResult.duration)}
                  resolution={`${exportResult.width} × ${exportResult.height}`}
                  processedWith={exportResult.processedWith}
                  onDownload={downloadCaptionedVideo}
                  downloadVariant={exportStatus === 'processing' ? 'outline' : 'primary'}
                  settingsChanged={resultSettingsChanged}
                  highlighted={highlighted}
                  previewSize="large"
                >
                  <div className="captions-subtitle-downloads" aria-label="Download subtitle files">
                    <Button
                      variant="outline"
                      onClick={() =>
                        downloadText(
                          toSRT(captionWords),
                          getCaptionExportFilename(file.name, 'srt'),
                          'application/x-subrip',
                        )
                      }
                    >
                      Download SRT
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        downloadText(
                          toVTT(captionWords),
                          getCaptionExportFilename(file.name, 'vtt'),
                          'text/vtt',
                        )
                      }
                    >
                      Download VTT
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        downloadText(
                          toPlainText(captionWords),
                          getCaptionExportFilename(file.name, 'txt'),
                          'text/plain',
                        )
                      }
                    >
                      Download TXT
                    </Button>
                  </div>
                </ResultCard>
              </section>
            )}
          </>
        )}
      </div>
    </ToolLayout>
  )
}

export default Captions
