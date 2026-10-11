import { useMemo } from 'react'
import type { Tab } from '../lib/tabs'
import {
  useAgentDoneOn,
  useAgentFailedOn,
  useAgentIndicator,
  useAgentQuestionOn,
  useAgentRainbow
} from '@core/renderer/lib/termLook'
import { useAgentColors } from '@core/renderer/lib/agentColors'
import { markPalette } from '@core/renderer/lib/markPalette'
import {
  resolveTabMark,
  type MarkColour,
  type MarkState,
  type TabMark
} from '@core/renderer/lib/tabMark'
import type { AgentIndicator } from '@core/renderer/host'

/** One tab's agent state and the mark it wears. */
export interface TabLook {
  failed: boolean
  state: MarkState | null
  mark: TabMark
  /** Whether its Powerline segment covers what lies under it. */
  paints: boolean
}

/**
 * EVERY TAB'S STATE AND MARK, and the colours to draw them in: the one reading
 * both tab layouts share (#162), so the strip and the sidebar can never mark a
 * tab differently. Lifted out of TabStrip as it was.
 */
export function useTabLooks({
  tabs,
  activeId,
  workingIds,
  doneIds,
  questionIds,
  failedIds,
  agentIds,
  prompt
}: {
  tabs: Tab[]
  activeId: string | null
  workingIds: ReadonlySet<string>
  doneIds: ReadonlySet<string>
  questionIds: ReadonlySet<string>
  failedIds?: ReadonlySet<string>
  agentIds: ReadonlySet<string>
  prompt: boolean
}): {
  indicator: AgentIndicator
  palette: ReturnType<typeof markPalette>
  paint: (role: MarkColour | null, axis: 'x' | 'y') => string
  looks: TabLook[]
} {
  const indicator = useAgentIndicator()
  // The user's pick where there is one, else the theme's accent and green.
  const colours = useAgentColors()
  const doneOn = useAgentDoneOn()
  const questionOn = useAgentQuestionOn()
  const failedOn = useAgentFailedOn()
  const rainbow = useAgentRainbow()
  // EVERY MARK'S COLOUR (#143), from what the window paints NOW: App paints
  // the chrome synchronously on every look change, before this re-renders.
  // Held to 3:1 on every ground a mark can sit on: the strip, and under Powerline
  // both segment shades (composited, since on glass they are see-through).
  const root = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string): string =>
    root.getPropertyValue(name).trim() || fallback
  const solidGround = read('--p-bg-solid', '#0b0b0f')
  // Powerline's segments are the strip's own ground now (2026-10-10 rework: idle
  // paints nothing, the tab in front is --p-tab-active, exactly Classic's), so
  // every mark sits on the one ground in both styles.
  const grounds = [solidGround]
  // Whether the tab in front PAINTS: --p-tab-active is the ground on an opaque
  // window and fully transparent on glass (chromeTokens).
  const activePaints = !/^#[0-9a-f]{6}00$/i.test(read('--p-tab-active', solidGround))
  const text = read('--p-text', '#e7e7ee')
  // Worked out again only when what it is made of changes: the strip renders on
  // every pointer move of a tab drag, and flooring colours each time is work
  // the frame does not need.
  const paletteKey = `${colours.working}|${colours.finished}|${colours.question}|${colours.failed}|${grounds.join(',')}|${solidGround}|${text}|${rainbow}`
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the key IS every input, as text
  const palette = useMemo(() => markPalette({ colours, grounds, solidGround, text, rainbow }), [paletteKey])
  /** A mark's colour role as a CSS background: the rainbow runs along a line
   *  (`x`) or down a Powerline edge (`y`); the rule is the active rule's token. */
  const paint = (role: MarkColour | null, axis: 'x' | 'y'): string => {
    switch (role) {
      case 'working':
        return palette.line.working
      case 'rule':
        return 'var(--p-accent-hi)'
      case 'done':
        return palette.line.done
      case 'rainbow':
        return axis === 'x' ? palette.rainbowX : palette.rainbowY
      case 'question':
        return palette.line.question
      case 'failed':
        return palette.line.failed
      default:
        return 'transparent'
    }
  }
  // Every tab's state and mark, worked out before any is drawn: a Powerline edge
  // needs to know whether the NEXT segment paints.
  const looks = tabs.map((t) => {
    const on = t.id === activeId
    // The agent's state on this tab. A tab IS its shell here, so the tab's
    // id is the session's. Working shows on any tab, the one in front
    // included; the other three only on a tab nobody is looking at (App's
    // sets), each behind its own switch.
    const working = indicator !== 'off' && agentIds.has(t.id) && workingIds.has(t.id)
    // THE ATTENTION MARKS (2026-09-28; owner: a finished indicator, "a
    // static colour like a green border on the bottom ... until you click
    // the tab", and "a question indicator ... blue"): a question outranks
    // a plain finish.
    const question = questionOn && !working && questionIds.has(t.id)
    // FAILED (#131): a turn that ended on an error, said by Claude Code's
    // own hook. Under a question, over a plain finish.
    const failed = failedOn && !working && !question && !!failedIds?.has(t.id)
    const done = doneOn && !working && !question && !failed && doneIds.has(t.id)
    const state: MarkState | null = working
      ? 'working'
      : question
        ? 'question'
        : failed
          ? 'failed'
          : done
            ? 'done'
            : null
    // WHICH MARK, from the core's one rule (#143): the strip only draws it.
    const mark = resolveTabMark({
      indicator,
      tabStyle: prompt ? 'prompt' : 'flat',
      state,
      active: on,
      rainbow
    })
    // Whether its segment covers what lies under it: a Full fill, or the tab
    // in front on an opaque window. An idle segment paints nothing.
    const paints = mark.place === 'fill' || (on && activePaints)
    return { failed, state, mark, paints }
  })
  return { indicator, palette, paint, looks }
}
