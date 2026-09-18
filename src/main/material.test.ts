import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ nativeTheme: { themeSource: 'system' } }))

import { acrylicOk, isLightBg, validBg } from './material'

describe('acrylicOk', () => {
  it('is Windows 11 and later, by build number', () => {
    expect(acrylicOk('10.0.22631', 'win32')).toBe(true)
    expect(acrylicOk('10.0.22000', 'win32')).toBe(true)
    expect(acrylicOk('10.0.26200', 'win32')).toBe(true)
  })
  it('is not Windows 10, whose release string differs only in the build', () => {
    expect(acrylicOk('10.0.19045', 'win32')).toBe(false)
    expect(acrylicOk('10.0.17763', 'win32')).toBe(false)
  })
  it('is not another platform, or a release it cannot read', () => {
    expect(acrylicOk('24.1.0', 'darwin')).toBe(false)
    expect(acrylicOk('', 'win32')).toBe(false)
  })
})

describe('the window ground', () => {
  it('takes #rrggbb and nothing else', () => {
    expect(validBg('#0b0b0f')).toBe(true)
    expect(validBg('#FFFFFF')).toBe(true)
    expect(validBg('#fff')).toBe(false)
    expect(validBg('#0b0b0f80')).toBe(false)
    expect(validBg('red')).toBe(false)
    expect(validBg(undefined)).toBe(false)
  })
  it('reads a pale ground as light, for the frost DWM picks', () => {
    expect(isLightBg('#fdf6e3')).toBe(true)
    expect(isLightBg('#0b0b0f')).toBe(false)
  })
})
