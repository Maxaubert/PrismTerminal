import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { configureTermCore, resetTermCore, termHost, type TermApi, type TermHostConfig } from './host'
import { agentColorChoice, agentIndicator, termAcrylic, termExtraDefaults, termThemeId } from './lib/termLook'
import { CH } from '../shared/channels'

// The seam is what lets ONE terminal serve two apps. These tests are the two
// apps: each host's defaults, read through the same stores.

const api = {} as TermApi

/** Prism Terminal: the theme drives the window, quiet by default. */
const PRISM_TERMINAL: TermHostConfig = {
  api,
  defaults: { theme: 'prism', acrylic: false, indicator: 'minimal', agentColor: '', agentDoneColor: '' },
  followsHostStyle: false,
  paintsGround: true,
  ownsKey: () => false
}

/** Prism, as it ships today: the terminal wears the app style. */
const PRISM: TermHostConfig = {
  api,
  defaults: { theme: 'style', acrylic: true, indicator: 'full', agentColor: '#f97316', agentDoneColor: '#22c55e' },
  followsHostStyle: true,
  paintsGround: false,
  ownsKey: () => false
}

describe('the host seam', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => resetTermCore())

  it('refuses to be used before a host has spoken', () => {
    expect(() => termHost()).toThrow(/configureTermCore/)
  })

  it('an untouched setting reads as ITS HOST says, so adopting the core changes nothing a user sees', () => {
    configureTermCore(PRISM)
    expect([termThemeId(), termAcrylic(), agentIndicator(), agentColorChoice()]).toEqual(['style', true, 'full', '#f97316'])
    configureTermCore(PRISM_TERMINAL)
    expect([termThemeId(), termAcrylic(), agentIndicator(), agentColorChoice()]).toEqual(['prism', false, 'minimal', ''])
  })

  it('a setting the user DID touch wins over either host', () => {
    localStorage.setItem('prism.term.theme', 'dracula')
    localStorage.setItem('prism.term.acrylic', '0')
    localStorage.setItem('prism.term.agentIndicator', 'off')
    for (const host of [PRISM, PRISM_TERMINAL]) {
      configureTermCore(host)
      expect([termThemeId(), termAcrylic(), agentIndicator()]).toEqual(['dracula', false, 'off'])
    }
  })

  it("'style' is a theme only where the host has a style to follow", () => {
    localStorage.setItem('prism.term.theme', 'style')
    configureTermCore(PRISM)
    expect(termThemeId()).toBe('style')
    // A save carried over from Prism must not leave a theme nothing can resolve.
    configureTermCore(PRISM_TERMINAL)
    expect(termThemeId()).toBe('prism')
  })

  it('"what a theme pick resets to" follows the host too', () => {
    configureTermCore(PRISM)
    expect(termExtraDefaults()).toMatchObject({ indicator: 'full', acrylic: true, indicatorColor: '#f97316' })
    configureTermCore(PRISM_TERMINAL)
    expect(termExtraDefaults()).toMatchObject({ indicator: 'minimal', acrylic: false, indicatorColor: '' })
  })
})

describe('the channel table', () => {
  it('names every channel once, and no two alike', () => {
    const names = Object.values(CH)
    expect(new Set(names).size).toBe(names.length)
    // main's terminal.ts sends these two by their literal names.
    expect([CH.data, CH.exit]).toEqual(['term:data', 'term:exit'])
  })
})
