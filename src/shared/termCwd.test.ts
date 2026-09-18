import { describe, expect, it } from 'vitest'
import { parseOsc9 } from './termCwd'

describe('parseOsc9', () => {
  it('reads the Windows Terminal cwd report, quoted or not', () => {
    expect(parseOsc9('9;C:\\Users\\me\\proj')).toBe('C:\\Users\\me\\proj')
    expect(parseOsc9('9;"C:\\Users\\me\\proj"')).toBe('C:\\Users\\me\\proj')
    expect(parseOsc9('9;\\\\srv\\share\\x')).toBe('\\\\srv\\share\\x')
  })

  it('refuses anything that is not a report of a Windows folder', () => {
    expect(parseOsc9('4;100;50')).toBeNull() // ConEmu progress, same OSC number
    expect(parseOsc9('9;')).toBeNull()
    expect(parseOsc9('9;Cert:\\LocalMachine')).toBeNull()
    expect(parseOsc9('9;/home/me')).toBeNull()
  })
})
