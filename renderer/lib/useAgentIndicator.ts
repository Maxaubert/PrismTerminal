import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { DetectedAgent } from '../../shared/types'
import { activitySuppressed, inputEcho, markBorn, startupOutput } from './termActivity'
import { forgetAgentTitle, readAgentTitle } from './agentTitle'
import { noteWorking } from './agentClock'
import { onTitle } from './termBus'
import { termApi } from '../host'

/**
 * Which tabs host an agent, which are mid-answer, and which finished while
 * you were looking elsewhere. Lifted out of Prism's App unchanged in its
 * rules; a tab here IS its session, so one id serves for both.
 *
 * Tab activity, Tabby-style: a pty is SILENT at an idle prompt and streams
 * continuously while an AI CLI works (its spinner repaints). The marks are
 * AGENT-SCOPED: main polls each shell's process tree for Claude Code and
 * kin, and a plain terminal never shows one (the bell was tried and
 * abandoned - PSReadLine dings on every invalid key).
 */
export interface AgentIndicator {
  agentIds: ReadonlySet<string>
  workingIds: ReadonlySet<string>
  doneIds: ReadonlySet<string>
  /** Which agent each session hosts. A ref: read at the moment of asking. */
  agentKinds: RefObject<Map<string, DetectedAgent>>
  /** The session ended: every mark it carried goes with it. */
  forget: (id: string) => void
}

const without = (prev: ReadonlySet<string>, id: string): ReadonlySet<string> => {
  if (!prev.has(id)) return prev
  const next = new Set(prev)
  next.delete(id)
  return next
}

export function useAgentIndicator(activeId: string | null): AgentIndicator {
  const [agentIds, setAgentIds] = useState<ReadonlySet<string>>(new Set())
  const [workingIds, setWorkingIds] = useState<ReadonlySet<string>>(new Set())
  const [doneIds, setDoneIds] = useState<ReadonlySet<string>>(new Set())
  const agentKinds = useRef(new Map<string, DetectedAgent>())
  const outputRuns = useRef(new Map<string, { start: number; last: number }>())
  /** Sessions whose agent reports its state through the title (Claude). */
  const titled = useRef(new Set<string>())
  /** The one clearing timer per fallback-scored session. */
  const fallbackTimers = useRef(new Map<string, number>())
  const stopFallback = useCallback((id: string): void => {
    const t = fallbackTimers.current.get(id)
    if (t !== undefined) {
      clearTimeout(t)
      fallbackTimers.current.delete(id)
    }
  }, [])

  useEffect(
    () =>
      termApi().onTermAgent((id, present, kind) => {
        if (present && kind) agentKinds.current.set(id, kind)
        else if (!present) {
          agentKinds.current.delete(id)
          // The agent left: its title state and any working mark go with it,
          // and the next agent in this shell starts on the fallback again.
          titled.current.delete(id)
          forgetAgentTitle(id)
          stopFallback(id)
          setWorkingIds((prev) => without(prev, id))
        }
        if (present) {
          // An agent's BIRTH state is idle: its startup paint (banner, welcome
          // box, the loading spinners after it) is a stream, but it is not the
          // agent answering anything. Wipe the run, and score nothing until
          // the FIRST SILENCE after the agent appeared (2026-09-04): the 4s
          // clock this replaced guessed at how late the poll noticed the
          // agent and how long the machine took to boot it, and at app start
          // with several tabs resuming at once the paint outlasted it - so
          // the tail of a startup lit the tab as an answer underway.
          outputRuns.current.delete(id)
          markBorn(id)
          setWorkingIds((prev) => without(prev, id))
        }
        setAgentIds((prev) => {
          if (present === prev.has(id)) return prev
          const next = new Set(prev)
          if (present) next.add(id)
          else next.delete(id)
          return next
        })
      }),
    [stopFallback]
  )

  useEffect(
    () =>
      termApi().onTermData((id) => {
        // A session whose agent SAYS what it is doing (through the title,
        // see onTitle below) is never scored from its output: the agent's
        // own word is exact, and its repaints would only second-guess it.
        if (titled.current.has(id)) return
        // Output on the heels of a keystroke is that keystroke's echo (the TUI
        // repainting its input box), so typing at an idle agent never scores.
        // Every chunk is shown to the birth rule (it tracks the gaps), and
        // only then is the rest of the scoring asked.
        const startup = startupOutput(id)
        if (startup || activitySuppressed(id) || inputEcho(id)) return
        if (!agentKinds.current.has(id)) return
        const now = Date.now()
        const run = outputRuns.current.get(id)
        if (!run || now - run.last > 1500) outputRuns.current.set(id, { start: now, last: now })
        else run.last = now
        const r = outputRuns.current.get(id)!
        // EVENT-DRIVEN, no loop (owner, 2026-09-04): the chunk that carries
        // the run past the sustain sets working right then, and ONE timer
        // armed on the latest chunk clears it after the silence.
        if (r.last - r.start > 1200) {
          setWorkingIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
          stopFallback(id)
          fallbackTimers.current.set(
            id,
            window.setTimeout(() => {
              fallbackTimers.current.delete(id)
              setWorkingIds((prev) => without(prev, id))
            }, 2000)
          )
        }
      }),
    [stopFallback]
  )

  /**
   * The agent's OWN word (2026-09-04, owner: "instant, and event-driven").
   * Claude Code writes its state into the terminal title - a spinner glyph
   * while working, MEASURED at 30ms after Enter and at the instant an answer
   * lands - so the indicator follows the title and nothing else for such a
   * session. Codex has a dialect of its own (a braille spinner before the
   * folder name, the bare name at rest) and the reader knows both. A Claude
   * title is also the agent being present, NOW, ahead of the process poll
   * that would have said so up to 2.5s later. A braille spinner is common
   * currency (ora, and every CLI built on it), so the Codex dialect is acted
   * on only once the poll has found an agent in the shell; the poll notices
   * either leaving. Sessions with no title state keep the output fallback.
   */
  useEffect(
    () =>
      onTitle((id, title) => {
        const r = readAgentTitle(id, title)
        if (!r) return
        if (r.kind === 'codex' && !agentKinds.current.has(id)) return
        if (!titled.current.has(id)) {
          titled.current.add(id)
          outputRuns.current.delete(id)
          stopFallback(id)
        }
        if (!agentKinds.current.has(id)) agentKinds.current.set(id, r.kind)
        setAgentIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
        const working = r.state === 'working'
        setWorkingIds((prev) => {
          if (prev.has(id) === working) return prev
          const next = new Set(prev)
          if (working) next.add(id)
          else next.delete(id)
          return next
        })
      }),
    [stopFallback]
  )

  // Finished-while-away: an agent that STOPS working on a background tab
  // leaves a mark that stays until the tab is visited (or work restarts).
  const prevWorking = useRef<ReadonlySet<string>>(new Set())
  useEffect(() => {
    // The one place that sees the transition, so the one place that can time
    // it: `outputRuns.start` is a burst length, not a work duration.
    noteWorking(workingIds)
    const was = prevWorking.current
    prevWorking.current = workingIds
    setDoneIds((prev) => {
      let next: Set<string> | null = null
      const mut = (): Set<string> => (next ??= new Set(prev))
      for (const id of was) {
        // Stopped, still an agent session, and its tab is in the background.
        if (!workingIds.has(id) && agentIds.has(id) && id !== activeId) mut().add(id)
      }
      for (const id of prev) {
        if (workingIds.has(id) || id === activeId || !agentIds.has(id)) mut().delete(id)
      }
      return next ?? prev
    })
  }, [workingIds, activeId, agentIds])

  // STABLE: a host subscribes to the pty's exit ONCE and calls this from there.
  const forget = useCallback((id: string): void => {
    outputRuns.current.delete(id)
    titled.current.delete(id)
    agentKinds.current.delete(id)
    forgetAgentTitle(id)
    stopFallback(id)
    setAgentIds((prev) => without(prev, id))
    setWorkingIds((prev) => without(prev, id))
    setDoneIds((prev) => without(prev, id))
  }, [stopFallback])

  return { agentIds, workingIds, doneIds, agentKinds, forget }
}
