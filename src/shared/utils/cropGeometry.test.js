import { describe, expect, it } from 'vitest'
import {
  displayedCropToVideoPixels,
  getCenteredAspectCrop,
  moveCropPixels,
  normalizeCropPixels,
  resizeCropPixels,
} from './cropGeometry.js'

describe('crop geometry', () => {
  it('converts displayed coordinates to even, clamped source pixels', () => {
    expect(
      displayedCropToVideoPixels(
        { x: 25, y: 12.5, w: 200, h: 150 },
        { width: 400, height: 300 },
        { width: 1920, height: 1080 },
      ),
    ).toEqual({ x: 120, y: 44, w: 960, h: 540 })
  })

  it('maps a crop shown over a small preview back to 4K portrait source pixels', () => {
    // Crop & trim shows a 4K HEVC file through a 540x960 preview copy;
    // export must still crop the 2160x3840 original.
    const source = { width: 2160, height: 3840 }
    const square = getCenteredAspectCrop(source, 1)
    const display = { width: 270, height: 480 }
    const shown = {
      x: (square.x / source.width) * display.width,
      y: (square.y / source.height) * display.height,
      w: (square.w / source.width) * display.width,
      h: (square.h / source.height) * display.height,
    }
    expect(displayedCropToVideoPixels(shown, display, source)).toEqual(square)
    expect(square).toEqual({ x: 0, y: 840, w: 2160, h: 2160 })
  })

  it('centers the largest 9:16 crop inside a landscape video', () => {
    expect(getCenteredAspectCrop({ width: 1920, height: 1080 }, 9 / 16)).toEqual({
      x: 656,
      y: 0,
      w: 608,
      h: 1080,
    })
  })

  it('clamps moved and resized crops to even video bounds', () => {
    const initial = { x: 20, y: 20, w: 100, h: 80 }
    expect(moveCropPixels(initial, 1000, -1000, { width: 640, height: 480 })).toEqual({
      x: 540,
      y: 0,
      w: 100,
      h: 80,
    })
    expect(
      resizeCropPixels(initial, 'se', 1000, 1000, { width: 640, height: 480 }),
    ).toEqual({ x: 20, y: 20, w: 620, h: 460 })
  })

  it('rounds a crop rectangle down to even values', () => {
    expect(
      normalizeCropPixels(
        { x: 5, y: 7, w: 100, h: 99 },
        { width: 101, height: 99 },
      ),
    ).toEqual({ x: 4, y: 6, w: 96, h: 92 })
  })
})
