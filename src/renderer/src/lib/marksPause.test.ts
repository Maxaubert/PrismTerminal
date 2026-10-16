import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { watchMarksPause } from './marksPause'

describe('the marks pause while minimised (perf review 2026-10-16)', () => {
  it('sets data-marks-paused on a minimise and takes it off on a restore', () => {
    let say: (m: boolean) => void = () => {}
    const attrs = new Set<string>()
    const root = {
      toggleAttribute: (name: string, force?: boolean): boolean => {
        if (force) attrs.add(name)
        else attrs.delete(name)
        return !!force
      }
    }
    watchMarksPause((cb) => {
      say = cb
      return () => {}
    }, root)
    say(true)
    expect(attrs.has('data-marks-paused')).toBe(true)
    say(false)
    expect(attrs.has('data-marks-paused')).toBe(false)
  })

  it('is the attribute the core marks pause on, and the app starts the watch', () => {
    const css = readFileSync(join(__dirname, '..', '..', '..', '..', 'core', 'renderer', 'styles', 'marks.css'), 'utf8')
    expect(css).toContain(':root[data-marks-paused]')
    const entry = readFileSync(join(__dirname, '..', 'main.tsx'), 'utf8')
    expect(entry).toMatch(/watchMarksPause\(window\.prism\.onMinimized, document\.documentElement\)/)
  })
})
