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

function buildVideoOutputArgs(inputPath, outputPath, filters = []) {
  return [
    '-i', inputPath,
    ...filters,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ]
}

/**
 * Builds an FFmpeg trim command using stream copy unless exact re-encoding is requested.
 *
 * @param {string} inputPath FFmpeg virtual filesystem input path.
 * @param {string} outputPath FFmpeg virtual filesystem output path.
 * @param {number} start Start time in seconds.
 * @param {number} end End time in seconds.
 * @param {{exact?: boolean}} options Re-encode to trim at an exact frame boundary.
 * @returns {string[]} FFmpeg arguments.
 */
export function buildTrimArgs(inputPath, outputPath, start, end, { exact = false } = {}) {
  assertTrimRange(start, end)

  const seekArgs = ['-ss', formatNumber(start), '-i', inputPath]
  const durationArgs = ['-t', formatNumber(end - start)]
  if (!exact) {
    return [
      ...seekArgs,
      ...durationArgs,
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c', 'copy',
      '-movflags', '+faststart',
      outputPath,
    ]
  }

  return [
    ...seekArgs,
    ...durationArgs,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ]
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
  return buildVideoOutputArgs(inputPath, outputPath, ['-vf', `crop=${w}:${h}:${x}:${y}`])
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
  return [
    '-ss', formatNumber(start),
    '-i', inputPath,
    '-t', formatNumber(end - start),
    '-vf', `crop=${w}:${h}:${x}:${y}`,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ]
}

/**
 * Builds a low-resolution H.264/AAC preview-copy command.
 *
 * @param {string} inputPath FFmpeg virtual filesystem input path.
 * @param {string} outputPath FFmpeg virtual filesystem output path.
 * @param {number} width Source display width.
 * @param {number} height Source display height.
 * @returns {string[]} FFmpeg arguments.
 */
export function buildPreviewProxyArgs(inputPath, outputPath, width, height) {
  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new RangeError('Video dimensions must be positive finite numbers.')
  }

  const scale = width >= height ? '960:-2' : '-2:960'
  return [
    '-i', inputPath,
    '-vf', `scale=${scale}`,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '32',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '96k',
    '-movflags', '+faststart',
    outputPath,
  ]
}

/**
 * Builds an atempo filter chain whose individual stages stay in FFmpeg's supported range.
 *
 * @param {number} factor Playback-speed multiplier.
 * @returns {string} Comma-separated atempo filters.
 */
export function buildAtempoChain(factor) {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new RangeError('Speed factor must be a positive finite number.')
  }

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
 * @param {{hasAudio?: boolean | 'unknown', removeAudio?: boolean, keepAudioPitchNatural?: boolean}} options Audio stream and pitch settings.
 * @returns {string[]} FFmpeg arguments.
 */
export function buildSpeedArgs(
  inputPath,
  outputPath,
  factor,
  { hasAudio = 'unknown', removeAudio = false, keepAudioPitchNatural = true } = {},
) {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new RangeError('Speed factor must be a positive finite number.')
  }

  const args = [
    '-i', inputPath,
    '-map', '0:v:0',
    '-filter:v', `setpts=PTS/${formatNumber(factor)}`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
  ]

  if (hasAudio !== false && !removeAudio) {
    const audioFilter = keepAudioPitchNatural
      ? buildAtempoChain(factor)
      : `aresample=44100,asetrate=${formatNumber(44100 * factor)},aresample=44100`
    args.push(
      '-map', hasAudio === true ? '0:a:0' : '0:a?',
      '-filter:a', audioFilter,
      '-c:a', 'aac',
      '-b:a', '128k',
    )
  }

  args.push('-movflags', '+faststart', outputPath)
  return args
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
