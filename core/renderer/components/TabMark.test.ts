import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { resolveTabMark, type MarkState } from '../lib/tabMark'
import { TabMark } from './TabMark'

const draw = (
  indicator: 'minimal' | 'ring' | 'full',
  state: MarkState,
  extra: { active?: boolean; foot?: string; ink?: string } = {}
): string =>
  renderToStaticMarkup(
    createElement(TabMark, {
      mark: resolveTabMark({ indicator, tabStyle: 'flat', state, active: !!extra.active, rainbow: true }),
      state,
      background: '#123456',
      foot: extra.foot,
      ink: extra.ink
    })
  )

describe('the flat tab mark (#143)', () => {
  it('draws the running bar while working, hidden from the reader', () => {
    const html = draw('minimal', 'working')
    expect(html).toContain('data-mark="run"')
    expect(html).toContain('p-agent-run')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('data-attention')
  })

  it('draws a 3 px line for a question, breathing, with its attention kept for the e2e', () => {
    const html = draw('minimal', 'question')
    expect(html).toContain('data-mark="line"')
    expect(html).toContain('data-attention="question"')
    expect(html).toContain('p-mark-breathe')
    expect(html).toContain('h-[3px]')
  })

  it('flows the rainbow on a finished line and says so', () => {
    const html = draw('minimal', 'done')
    expect(html).toContain('data-rainbow=""')
    expect(html).toContain('p-mark-flow-x')
    expect(html).toContain('data-attention="done"')
  })

  it('spins a ring for Ring while working', () => {
    const html = draw('ring', 'working')
    expect(html).toContain('data-mark="ring"')
    expect(html).toContain('p-mark-spin')
  })

  it('fills a Full tab not in front, the name ink a CSS variable, not per frame', () => {
    const html = draw('full', 'working', { ink: '#0b0b0b' })
    expect(html).toContain('data-mark="fill"')
    expect(html).toContain('--mark-ink:#0b0b0b')
    expect(html).toContain('p-mark-ride')
    const q = draw('full', 'question', { ink: '#eeeeee' })
    expect(q).toContain('p-mark-breathe')
    expect(q).toContain('--mark-ink:#eeeeee')
  })

  it('puts the rainbow along a finished badge\'s foot', () => {
    const html = draw('full', 'done', { foot: 'linear-gradient(90deg, red, blue, red)' })
    expect(html).toContain('data-mark-foot')
    expect(html).toContain('p-mark-flow-x')
  })

  it('draws nothing for a Full tab in front beyond Minimal\'s mark', () => {
    expect(draw('full', 'working', { active: true })).toContain('data-mark="run"')
  })
})
