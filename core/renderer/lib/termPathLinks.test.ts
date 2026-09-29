import { describe, expect, it } from 'vitest'
import { pathCandidates } from './termPathLinks'

const paths = (text: string): string[] => pathCandidates(text).map((p) => p.path)

describe('pathCandidates', () => {
  it('leaves the prompt alone, PowerShell and cmd', () => {
    expect(paths('PS C:\Users\me\work> ls docs/a.pdf')).toEqual(['docs/a.pdf'])
    expect(paths('C:\Users\me\work>dir')).toEqual([])
  })
  it('leaves a path inside a web link to the link', () => {
    expect(paths('see https://github.com/a/b/blob/main/README.md and README.md')).toEqual(['README.md'])
  })
})
