import { beforeEach, describe, expect, it, vi } from 'vitest'
import { onWindowEdgesChange, setWindowEdges, windowEdges } from './edgesPrefs'

describe('edgesPrefs', () => {
  beforeEach(() => localStorage.clear())

  it('is a hairline until somebody chooses, which is the window as it always was', () => {
    expect(windowEdges()).toBe('hairline')
  })

  it('remembers each of the four choices under its own key', () => {
    for (const e of ['faint', 'solid', 'none', 'hairline'] as const) {
      setWindowEdges(e)
      expect(windowEdges()).toBe(e)
      expect(localStorage.getItem('prism.window.edges')).toBe(e)
    }
  })

  it('reads a word it does not know as the default, and never stores one', () => {
    localStorage.setItem('prism.window.edges', 'strong')
    expect(windowEdges()).toBe('hairline')
    setWindowEdges('dotted' as never)
    expect(localStorage.getItem('prism.window.edges')).toBe('hairline')
  })

  it('tells its listeners on a change, and stops when asked', () => {
    const heard = vi.fn()
    const off = onWindowEdgesChange(heard)
    setWindowEdges('solid')
    expect(heard).toHaveBeenCalledTimes(1)
    off()
    setWindowEdges('none')
    expect(heard).toHaveBeenCalledTimes(1)
  })
})
