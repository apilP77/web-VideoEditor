import {
  getCaptionAnimationState,
  getContrastingTextColor,
} from './styles.js'
import { getActiveWordIndex } from './engine.js'

const FONT_HEIGHT_RATIO = 0.064
const MAX_TEXT_WIDTH_RATIO = 0.9

function getWordText(word, style) {
  return style.allCaps ? word.word.toLocaleUpperCase() : word.word
}

function getLines(ctx, words, style, maxWidth) {
  const lines = []
  let line = []
  let lineWidth = 0

  for (const [wordIndex, word] of words.entries()) {
    const text = getWordText(word, style)
    const width = ctx.measureText(text).width
    const nextWidth = line.length ? lineWidth + ctx.measureText(' ').width + width : width
    if (line.length && nextWidth > maxWidth) {
      lines.push(line)
      line = []
      lineWidth = 0
    }
    const leading = line.length ? ctx.measureText(' ').width : 0
    line.push({ ...word, displayText: text, width, leading, wordIndex })
    lineWidth += leading + width
  }
  if (line.length) lines.push(line)
  return lines
}

function roundedRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, safeRadius)
}

function drawText(ctx, word, x, baseline, style, active, textColor) {
  const fill = style.preset === 'highlight' && active
    ? style.highlightColor
    : style.preset === 'outline'
      ? 'rgba(255,255,255,0.02)'
      : textColor ?? style.textColor
  if (style.strokeWidth > 0) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = style.strokeWidth * Math.max(1, ctx.canvas.height / 720)
    ctx.strokeStyle = style.strokeColor
    ctx.strokeText(word.displayText, x, baseline)
  }
  if (style.preset !== 'outline') {
    ctx.fillStyle = fill
    ctx.fillText(word.displayText, x, baseline)
  }
}

/**
 * Draws a timed caption onto a canvas context for preview and future export.
 *
 * @param {CanvasRenderingContext2D} ctx Canvas context.
 * @param {{start: number, end: number, words: Array<{word: string, start: number, end: number}>}} caption Timed caption.
 * @param {number} time Current video time in seconds.
 * @param {object} style Caption style model.
 * @param {number} width Canvas width in pixels.
 * @param {number} height Canvas height in pixels.
 * @returns {void} Draws the caption in place.
 */
export function drawCaption(ctx, caption, time, style, width, height) {
  ctx.clearRect(0, 0, width, height)
  if (!caption || time < caption.start || time > caption.end || caption.words.length === 0) return

  const activeWordIndex = getActiveWordIndex(caption, time)
  const captionAnimation = getCaptionAnimationState(
    style.animation,
    time - caption.start,
    { speed: style.animationSpeed },
  )
  if (!captionAnimation.visible || captionAnimation.opacity <= 0) return

  ctx.save()
  ctx.globalAlpha = captionAnimation.opacity
  ctx.translate(width / 2, height)
  ctx.translate(0, -height * (style.position / 100))
  ctx.translate(0, captionAnimation.offsetY * (height / 720))
  ctx.rotate(captionAnimation.rotation)
  ctx.scale(captionAnimation.scale, captionAnimation.scale)

  const fontSize = Math.max(12, height * FONT_HEIGHT_RATIO * (style.size / 100))
  ctx.font = `${style.fontWeight} ${fontSize}px "${style.fontFamily}", sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.shadowColor = style.glow ? style.highlightColor : '#000000'
  ctx.shadowBlur = style.glow ? fontSize * 0.55 : style.shadow ? fontSize * 0.16 : 0
  const lines = getLines(ctx, caption.words, style, width * MAX_TEXT_WIDTH_RATIO)
  const lineHeight = fontSize * 1.22
  const paddingX = fontSize * 0.38
  const paddingY = fontSize * 0.18
  const totalHeight = lines.length * lineHeight
  let baseline = -totalHeight + lineHeight * 0.82
  let characterOffset = 0

  for (const line of lines) {
    const lineWidth = line.reduce((sum, word) => sum + word.leading + word.width, 0)
    let x = -lineWidth / 2
    const lineTop = baseline - fontSize * 0.82
    const lineBottom = baseline + fontSize * 0.24

    if (style.backgroundOpacity > 0 && !['pill', 'block'].includes(style.preset)) {
      roundedRect(
        ctx,
        x - paddingX,
        lineTop - paddingY,
        lineWidth + paddingX * 2,
        lineBottom - lineTop + paddingY * 2,
        fontSize * 0.2,
      )
      ctx.fillStyle = style.backgroundColor
      ctx.globalAlpha = captionAnimation.opacity * (style.backgroundOpacity / 100)
      ctx.fill()
      ctx.globalAlpha = captionAnimation.opacity
    }

    for (const word of line) {
      x += word.leading
      const currentIndex = word.wordIndex
      const isActive = currentIndex === activeWordIndex
      const sinceWordStart = Math.max(0, time - word.start)
      const wordAnimation = getCaptionAnimationState(
        style.animation,
        ['reveal', 'typewriter'].includes(style.animation)
          ? time - caption.start
          : sinceWordStart,
        {
          speed: style.animationSpeed,
          wordIndex: currentIndex,
          characterIndex: characterOffset,
        },
      )
      characterOffset += word.displayText.length + 1
      if (!wordAnimation.visible) {
        x += word.width
        continue
      }

      const isPill = style.preset === 'pill' && isActive
      const isBlock = style.preset === 'block'
      if (isPill || isBlock) {
        const pad = fontSize * 0.16
        const boxColor = isPill ? style.highlightColor : style.backgroundColor
        const boxOpacity = isBlock ? style.backgroundOpacity / 100 : 1
        roundedRect(
          ctx,
          x - pad,
          lineTop - pad * 0.35,
          word.width + pad * 2,
          lineBottom - lineTop + pad * 0.7,
          isPill ? fontSize * 0.32 : fontSize * 0.08,
        )
        ctx.fillStyle = boxColor
        ctx.globalAlpha = captionAnimation.opacity * boxOpacity
        ctx.fill()
        ctx.globalAlpha = captionAnimation.opacity
      }

      ctx.save()
      ctx.translate(x + word.width / 2, baseline)
      ctx.translate(0, wordAnimation.offsetY * (height / 720))
      ctx.scale(wordAnimation.scale, wordAnimation.scale)
      const previousAlign = ctx.textAlign
      ctx.textAlign = 'center'
      const textColor = isPill
        ? getContrastingTextColor(style.highlightColor)
        : style.textColor
      drawText(ctx, word, -word.width / 2, 0, style, isActive, textColor)
      ctx.textAlign = previousAlign
      ctx.restore()
      x += word.width
    }

    baseline += lineHeight
  }

  ctx.restore()
}
