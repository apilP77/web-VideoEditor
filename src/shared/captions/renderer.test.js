import { describe, expect, it, vi } from 'vitest'
import { drawCaption } from './renderer.js'
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
