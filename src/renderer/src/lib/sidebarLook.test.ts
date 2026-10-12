import { describe, expect, it } from 'vitest'
import { sidebarEdge } from './sidebarLook'

describe("the sidebar's edge", () => {
  it('is a line only where both grounds are black', () => {
    expect(sidebarEdge('#000000', '#000000', 'dark')).toBe('line')
    expect(sidebarEdge('#0c0c0c', '#0c0c0cff', 'dark')).toBe('line')
    expect(sidebarEdge('#121212', '#0e0e0e', 'dark')).toBe('shadow')
    expect(sidebarEdge('#000000', '#3a3a3a', 'dark')).toBe('shadow')
    expect(sidebarEdge('#f6f4ee', '#e5e3dd', 'light')).toBe('shadow-light')
  })

  it('is neither over a see-through ground', () => {
    expect(sidebarEdge('#121212', '#090909b9', 'dark', '#121212b9')).toBe('none')
    expect(sidebarEdge('#000000', '#000000b9', 'dark', '#000000b9')).toBe('none')
    expect(sidebarEdge('#121212', '#090909', 'dark', '#121212')).toBe('shadow')
    expect(sidebarEdge('#121212', '#090909', 'dark', '#121212ff')).toBe('shadow')
  })
})
