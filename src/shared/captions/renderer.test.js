import { describe, expect, it, vi } from 'vitest'
import { drawCaption, getCaptionLines, getCenteredPosition } from './renderer.js'
import { createCaptionStyle } from './styles.js'

function createContext() {
  const methods = ['clearRect', 'save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'roundRect', 'fill', 'strokeText', 'fillText']
  const context = {
    canvas: { height: 720 },
    measureText: (text) => ({ width: text.length * 12 }),
  }
  for (const method of methods) context[method] = vi.fn()
  return context
}

describe('getCenteredPosition', () => {
  it('sits just under the middle so the text box is centred', () => {
    const position = getCenteredPosition({ size: 100 }, 720)
    expect(position).toBeLessThan(50)
    expect(position).toBeGreaterThan(48)
  })

  it('moves further from 50 for larger text and for the 12 px minimum on small canvases', () => {
    expect(getCenteredPosition({ size: 150 }, 720)).toBeLessThan(getCenteredPosition({ size: 100 }, 720))
    // 135 px tall: the 12 px minimum applies, so the shift is 0.51 * 12 / 135.
    expect(getCenteredPosition({ size: 100 }, 135)).toBeCloseTo(50 - (12 * 0.51 * 100) / 135, 5)
  })
})

describe('drawCaption', () => {
  it('draws active words and leaves the shared style unchanged', () => {
    const context = createContext()
    const style = createCaptionStyle('pill')
    const originalTextColor = style.textColor
    const caption = {
      start: 0,
      end: 2,
      words: [
        { word: 'Hello', start: 0, end: 1 },
        { word: 'there', start: 1, end: 2 },
      ],
    }

    drawCaption(context, caption, 1.5, style, 1280, 720)

    expect(context.fillText).toHaveBeenCalledTimes(2)
    expect(context.roundRect).toHaveBeenCalled()
    expect(style.textColor).toBe(originalTextColor)
  })

  it('places centre-aligned words side by side without overlapping', () => {
    const context = createContext()
    // Track horizontal translation so fillText calls resolve to canvas x.
    const stack = [0]
    context.save = vi.fn(() => stack.push(stack[stack.length - 1]))
    context.restore = vi.fn(() => stack.pop())
    context.translate = vi.fn((x) => {
      stack[stack.length - 1] += x
    })
    const drawn = []
    context.fillText = vi.fn((text, x) => {
      drawn.push({ text, center: stack[stack.length - 1] + x, width: text.length * 12 })
    })
    const style = createCaptionStyle('classic', { animation: 'none' })
    const caption = {
      start: 0,
      end: 3,
      words: [
        { word: 'I', start: 0, end: 1 },
        { word: 'running', start: 1, end: 2 },
        { word: 'fast', start: 2, end: 3 },
      ],
    }

    drawCaption(context, caption, 2.5, style, 1280, 720)

    expect(drawn.map((word) => word.text)).toEqual(['I', 'running', 'fast'])
    for (let index = 1; index < drawn.length; index += 1) {
      const previousRight = drawn[index - 1].center + drawn[index - 1].width / 2
      const left = drawn[index].center - drawn[index].width / 2
      expect(left).toBeGreaterThan(previousRight)
    }
    // The line is centred on the canvas, which is translated to x = 640.
    const first = drawn[0]
    const last = drawn[drawn.length - 1]
    const lineLeft = first.center - first.width / 2
    const lineRight = last.center + last.width / 2
    expect((lineLeft + lineRight) / 2).toBeCloseTo(640)
  })

  it('balances wrapped lines instead of leaving one word on the last line', () => {
    const context = createContext()
    const style = createCaptionStyle('classic')
    const words = 'She says I run in'.split(' ').map((word) => ({ word }))
    // 12px per character: the whole caption is 204px, so 180px needs two lines.
    // Greedy wrapping gives "She says I run" / "in".
    const lines = getCaptionLines(context, words, style, 180)

    expect(lines.map((line) => line.map((word) => word.displayText).join(' '))).toEqual([
      'She says',
      'I run in',
    ])
  })

  it('clears the canvas when the playhead is outside a caption', () => {
    const context = createContext()
    drawCaption(
      context,
      { start: 2, end: 3, words: [{ word: 'Later', start: 2, end: 3 }] },
      1,
      createCaptionStyle(),
      640,
      360,
    )
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 640, 360)
    expect(context.fillText).not.toHaveBeenCalled()
  })
})
