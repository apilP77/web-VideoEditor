function formatNumber(value) {
  return String(Number(value.toFixed(6)))
}

function assertTrimRange(start, end) {
  if (!Number.isFinite(start) || start < 0) {
    throw new TypeError('Start time must be zero or greater.')
  }
  if (!Number.isFinite(end) || end <= start) {
    throw new TypeError('End time must be greater than start time.')
  }
}

function normalizeCrop(crop, videoSize) {
  const { w, h, x, y } = crop ?? {}
  const { width, height } = videoSize ?? {}

  if (![w, h, x, y, width, height].every(Number.isFinite)) {
    throw new TypeError('Crop values and video dimensions must be finite numbers.')
  }
  if (width < 2 || height < 2 || w <= 0 || h <= 0) {
    throw new RangeError('Video dimensions and crop size must be at least 2 pixels.')
  }

  const videoWidth = Math.floor(width / 2) * 2
  const videoHeight = Math.floor(height / 2) * 2
  const evenX = Math.max(0, Math.min(Math.floor(x / 2) * 2, videoWidth - 2))
  const evenY = Math.max(0, Math.min(Math.floor(y / 2) * 2, videoHeight - 2))
  const evenW = Math.floor(Math.min(w, videoWidth - evenX) / 2) * 2
  const evenH = Math.floor(Math.min(h, videoHeight - evenY) / 2) * 2

  if (evenW < 2 || evenH < 2) {
    throw new RangeError('The crop must be at least 2 pixels wide and high.')
  }

  return { w: evenW, h: evenH, x: evenX, y: evenY }
}

function buildVideoOutputArgs(inputPath, outputPath) {
  return [
    '-i', inputPath,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ]
}

/**
 * Builds an accurate, re-encoded FFmpeg command for trimming a video.
 *
 * @param {string} inputPath FFmpeg virtual filesystem input path.
 * @param {string} outputPath FFmpeg virtual filesystem output path.
 * @param {number} start Start time in seconds.
 * @param {number} end End time in seconds.
 * @returns {string[]} FFmpeg arguments.
 */
export function buildTrimArgs(inputPath, outputPath, start, end) {
  assertTrimRange(start, end)

  const args = buildVideoOutputArgs(inputPath, outputPath)
  args.splice(2, 0, '-ss', formatNumber(start), '-t', formatNumber(end - start))
  return args
}

/**
 * Builds an FFmpeg command that crops a video using an even, clamped rectangle.
 *
 * @param {string} inputPath FFmpeg virtual filesystem input path.
 * @param {string} outputPath FFmpeg virtual filesystem output path.
 * @param {{w: number, h: number, x: number, y: number}} crop Requested crop rectangle in pixels.
 * @param {{width: number, height: number}} videoSize Source video dimensions in pixels.
 * @returns {string[]} FFmpeg arguments.
 */
export function buildCropArgs(inputPath, outputPath, crop, videoSize) {
  const { w, h, x, y } = normalizeCrop(crop, videoSize)
  const args = buildVideoOutputArgs(inputPath, outputPath)
  args.splice(2, 0, '-vf', `crop=${w}:${h}:${x}:${y}`)
  return args
}

/**
 * Builds one FFmpeg command that trims and crops a video in a single encode.
 *
 * @param {string} inputPath FFmpeg virtual filesystem input path.
 * @param {string} outputPath FFmpeg virtual filesystem output path.
 * @param {number} start Start time in seconds.
 * @param {number} end End time in seconds.
 * @param {{w: number, h: number, x: number, y: number}} crop Requested crop rectangle in pixels.
 * @param {{width: number, height: number}} videoSize Source video dimensions in pixels.
 * @returns {string[]} FFmpeg arguments.
 */
export function buildTrimCropArgs(inputPath, outputPath, start, end, crop, videoSize) {
  assertTrimRange(start, end)
  const { w, h, x, y } = normalizeCrop(crop, videoSize)
  const args = buildVideoOutputArgs(inputPath, outputPath)
  args.splice(
    2,
    0,
    '-ss', formatNumber(start),
    '-t', formatNumber(end - start),
    '-vf', `crop=${w}:${h}:${x}:${y}`,
  )
  return args
}

function buildAtempoChain(factor) {
  let remaining = factor
  const filters = []

  while (remaining > 2) {
    filters.push(2)
    remaining /= 2
  }
  while (remaining < 0.5) {
    filters.push(0.5)
    remaining /= 0.5
  }
  filters.push(remaining)

  return filters
    .map((value) => `atempo=${value === 2 ? '2.0' : formatNumber(value)}`)
    .join(',')
}

/**
 * Builds an FFmpeg command to change video speed while preserving audio pitch.
 *
 * @param {string} inputPath FFmpeg virtual filesystem input path.
 * @param {string} outputPath FFmpeg virtual filesystem output path.
 * @param {number} factor Playback speed multiplier; values above 1 are faster.
 * @returns {string[]} FFmpeg arguments.
 */
export function buildSpeedArgs(inputPath, outputPath, factor) {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new RangeError('Speed factor must be a positive finite number.')
  }

  return [
    '-i', inputPath,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-filter:v', `setpts=PTS/${formatNumber(factor)}`,
    '-filter:a', buildAtempoChain(factor),
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ]
}

/**
 * Builds an FFmpeg command to extract mono 16 kHz PCM audio as WAV.
 *
 * @param {string} inputPath FFmpeg virtual filesystem input path.
 * @param {string} outputPath FFmpeg virtual filesystem output path.
 * @returns {string[]} FFmpeg arguments.
 */
export function buildExtractAudioArgs(inputPath, outputPath) {
  return [
    '-i', inputPath,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-c:a', 'pcm_s16le',
    outputPath,
  ]
}
