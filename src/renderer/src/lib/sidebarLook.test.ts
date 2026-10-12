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
})
