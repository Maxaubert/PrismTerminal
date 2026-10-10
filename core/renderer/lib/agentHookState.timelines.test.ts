import { describe, expect, it } from 'vitest'
import { hookStep, screenDecides, type AttentionMark, type HookEvent, type HookSession } from './agentHookState'
import { TIMELINES, type TimelineStep } from './agentHookTimelines'

type Shown = 'working' | AttentionMark | null

/**
 * The measured timelines (#148) through the rules, the way `useAgentIndicator`
 * carries them out for a tab nobody is looking at: the screen is read when
 * `screenDecides` says so, a spinner held by the box is read again 250 ms
 * later, and a key that settles a box with the box gone after it answers the
 * question (#144). Returns what the tab shows at any moment.
 */
function replay(steps: readonly TimelineStep[]): (t: number) => Shown {
  let s: HookSession | undefined
  let working = false
  const marks = new Set<AttentionMark>()
  const shown: [number, Shown][] = []
  const show = (): Shown => (working ? 'working' : (['question', 'failed', 'finished'] as const).find((m) => marks.has(m)) ?? null)
  const apply = (ev: HookEvent, box: boolean): boolean => {
    const o = hookStep(s, ev, screenDecides(s, ev) ? { questionOnScreen: box } : undefined)
    if (!o) return false
    s = { phase: o.phase, kind: o.kind }
    working = o.working
    for (const m of o.raise) marks.add(m)
    for (const m of o.clear) if (!o.raise.includes(m)) marks.delete(m)
    return true
  }
  // The re-reads are events too, in time order with the measured ones.
  const queue: { t: number; run: () => void }[] = steps.map(([t, e, box, later]) => ({
    t,
    run: () => {
      if (e.startsWith('key:')) {
        if (e !== 'key:submit' && marks.has('question') && !later) queue.push({ t: t + 250, run: () => marks.delete('question') })
        return
      }
      const ev = { state: e } as HookEvent
      const held = !apply(ev, !!box) && e === 'working-title' && screenDecides(s, ev) && !!box
      if (held) queue.push({ t: t + 250, run: () => void apply(ev, !!later) })
    }
  }))
  for (let i = 0; i < queue.length; i++) {
    queue.sort((a, b) => a.t - b.t)
    queue[i].run()
    shown.push([queue[i].t, show()])
  }
  return (t) => {
    let at: Shown = null
    for (const [when, v] of shown) if (when <= t) at = v
    return at
  }
}

/** Every 100 ms from `from` up to (not including) `to`, the tab shows `want`. */
function holds(at: (t: number) => Shown, from: number, to: number, want: Shown): void {
  for (let t = from; t < to; t += 100) expect(at(t), `at ${t} ms`).toBe(want)
}

describe('the measured timelines (#148)', () => {
  it('A, a Yes: Question at the prompt, Working from the first spinner with the box gone, through the tool, Finished at Stop', () => {
    const at = replay(TIMELINES.A)
    holds(at, 13805, 22861, 'question')
    // The first spinner (22861) came 6 ms before the repaint: one re-read later.
    holds(at, 23111, 49815, 'working')
    holds(at, 49815, 52000, 'finished')
  })

  it('C, auto mode with an ask rule: the same', () => {
    const at = replay(TIMELINES.C)
    holds(at, 13120, 22174, 'question')
    holds(at, 22424, 49192, 'working')
    holds(at, 49192, 52000, 'finished')
  })

  it('E, auto mode with a hook that asks: the same, the spinner 2.7 s after Yes', () => {
    const at = replay(TIMELINES.E)
    holds(at, 10913, 22664, 'question')
    holds(at, 22914, 49660, 'working')
    holds(at, 49660, 52000, 'finished')
  })

  it('D, two prompts in a row: each a Question, then Working', () => {
    const at = replay(TIMELINES.D)
    holds(at, 12212, 15344, 'question')
    holds(at, 15594, 30212, 'working')
    holds(at, 30227, 33348, 'question')
    holds(at, 33598, 45424, 'working')
    holds(at, 45424, 48000, 'finished')
  })

  it('B, an Esc: the Question until the box goes, then nothing, and never Working', () => {
    const at = replay(TIMELINES.B)
    holds(at, 10848, 19939, 'question')
    holds(at, 20189, 43000, null)
  })

  it('G2, a subagent asks while its sibling works and the main turn stops: the Question stands until the answer', () => {
    const at = replay(TIMELINES.G2)
    holds(at, 22267, 36409, 'question')
    holds(at, 36659, 44731, 'working')
    // Decision 3 (#149): a main Stop with background agents running is still Finished.
    holds(at, 44731, 45500, 'finished')
  })

  it('C3, the classifier denies: Working, then Finished, and no Question', () => {
    const at = replay(TIMELINES.C3)
    holds(at, 10640, 19087, 'working')
    holds(at, 19087, 20000, 'finished')
    for (let t = 0; t < 54000; t += 100) expect(at(t)).not.toBe('question')
  })
})
