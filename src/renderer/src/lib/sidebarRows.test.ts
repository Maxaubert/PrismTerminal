import { describe, expect, it } from 'vitest'
import { findKeeps, folderLine, isFindTabChord } from './sidebarRows'

describe('the folder line under a sidebar row', () => {
  const home = 'C:\\Users\\Admin'
  it("is the folder's parent, the user's folder as ~", () => {
    expect(folderLine('C:\\Users\\Admin\\Documents\\Claude\\Github\\Prism', home)).toBe(
      '~\\Documents\\Claude\\Github'
    )
    expect(folderLine('C:\\Users\\Admin\\dotfiles', home)).toBe('~')
    expect(folderLine('c:\\users\\admin\\code\\api', home)).toBe('~\\code')
  })

  it('says the drive for a folder at a root, and leaves other places as they are', () => {
    expect(folderLine('X:\\Emulators', home)).toBe('X:')
    expect(folderLine('D:\\work\\site\\', home)).toBe('D:\\work')
    expect(folderLine('C:\\Users\\Administrator\\x', home)).toBe('C:\\Users\\Administrator')
  })
})

describe('finding a tab', () => {
  it('keeps a row with every word in its name or folder, any case, any order', () => {
    expect(findKeeps('', 'Prism', 'C:\\x')).toBe(true)
    expect(findKeeps('pri', 'PrismTerminal', 'C:\\x')).toBe(true)
    expect(
      findKeeps('github prism', 'Prism', 'C:\\Users\\Admin\\Documents\\Claude\\Github\\Prism')
    ).toBe(true)
    expect(findKeeps('sonara', 'Prism', 'C:\\x')).toBe(false)
  })

  it('opens on Ctrl+Shift+K only', () => {
    const k = (key: string, ctrlKey: boolean, shiftKey: boolean) => ({
      key,
      ctrlKey,
      shiftKey,
      altKey: false,
      metaKey: false
    })
    expect(isFindTabChord(k('K', true, true))).toBe(true)
    expect(isFindTabChord(k('k', true, false))).toBe(false)
    expect(isFindTabChord(k('k', false, true))).toBe(false)
  })
})
