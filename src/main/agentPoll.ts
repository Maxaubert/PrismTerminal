import { execFile } from 'child_process'
import type { DetectedAgent } from '@shared/types'
import { parseProcLines, treeAgentKind } from './agentDetect'
import { livePids, ptyOutputTicks } from './terminal'

/* ------------------------------------------------------------------ *
 * The agent poll's shape. See the poll itself for why it is like this.
 * ------------------------------------------------------------------ */
export const AGENT_POLL_MIN = 2500
export const AGENT_POLL_MAX = 20000
/**
 * "pid ppid" for everything, plus the command line only where a cheap word
 * match hits. The full dump with every command line was megabytes; this is a
 * few KB. The prefilter is deliberately BROAD - the strict signatures live in
 * agentDetect, which sees whatever this lets through.
 */
const AGENT_QUERY =
  'Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CommandLine | ' +
  'ForEach-Object { if ($_.CommandLine -and $_.CommandLine -match ' +
  "'claude|codex|aider|gemini') " +
  '{ "$($_.ProcessId) $($_.ParentProcessId) $($_.CommandLine)" } ' +
  'else { "$($_.ProcessId) $($_.ParentProcessId)" } }'

/** Ask Windows. `null` for a query that did not answer. */
function queryProcesses(done: (stdout: string | null) => void): void {
  execFile(
    'powershell.exe',
    ['-NoProfile', '-Command', AGENT_QUERY],
    { windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
    (err, stdout) => done(err || !stdout ? null : stdout)
  )
}

export type AgentSend = (id: string, has: boolean, kind: DetectedAgent | null) => void

/** What the poll reads the world through. The defaults are the real thing;
 *  the test hands in its own so the rules can be checked without a process
 *  list or a pty. */
export interface AgentPollDeps {
  pids: () => Array<{ id: string; pid: number }>
  ticks: () => number
  query: (done: (stdout: string | null) => void) => void
  now: () => number
}

const REAL: AgentPollDeps = {
  pids: livePids,
  ticks: ptyOutputTicks,
  query: queryProcesses,
  now: () => Date.now()
}

/**
 * The agent poll behind the tab dots (rewritten 2026-08-28).
 *
 * It used to spawn a PowerShell and dump EVERY process on the machine,
 * with command lines, into a 32MB buffer, every 2.5 seconds, for as long
 * as a terminal existed. That is a process launch and a megabyte or two of
 * JSON a few times a minute, forever, to answer a question whose answer
 * almost never changes.
 *
 * Three things fix it without giving up the feature:
 *
 *  - ASK ONLY WHEN SOMETHING COULD HAVE CHANGED. An agent cannot start or
 *    finish in a shell that has printed nothing, so a poll is skipped
 *    entirely unless a pty has produced output since the last look.
 *  - BACK OFF WHILE THE ANSWER HOLDS. Same answer twice, look half as
 *    often, up to 20s; a changed answer goes back to 2.5s.
 *  - CARRY LESS. The query returns plain "pid ppid" lines, with the
 *    command line only on rows a cheap prefilter matched. The strict
 *    decision stays in agentDetect, on the few rows that reach it.
 *
 * One look, as a function of its own, so the rules above can be tested
 * without a timer: `createAgentPoll` holds the state, `startAgentPoll` is the
 * interval around it.
 */
export function createAgentPoll(send: AgentSend, deps: AgentPollDeps = REAL): () => void {
  const agentState = new Map<string, boolean>()
  let agentBusy = false
  let agentSeenTicks = -1
  let agentEvery = AGENT_POLL_MIN
  let agentNext = 0
  return (): void => {
    const pids = deps.pids()
    if (!pids.length || agentBusy) return
    const ticks = deps.ticks()
    const quiet = ticks === agentSeenTicks
    const known = pids.every((s) => agentState.has(s.id))
    // A shell that has said nothing since the last look, whose answer we
    // already have, cannot have changed its mind.
    if (quiet && known) return
    // The backoff is for an answer that keeps coming back the same; a
    // session nobody has asked about yet has no answer to hold, so it is
    // not made to wait 20 seconds for its first one (2026-08-28).
    const now = deps.now()
    if (known && now < agentNext) return
    agentBusy = true
    deps.query((stdout) => {
      agentBusy = false
      // Only a query that actually answered counts as having looked: a
      // failed one used to consume the activity tick, so a shell that then
      // fell quiet kept a stale dot until it printed again (2026-08-28).
      if (!stdout) return
      const rows = parseProcLines(stdout)
      if (!rows.length) return
      agentSeenTicks = ticks
      let changed = false
      for (const { id, pid } of deps.pids()) {
        const kind = treeAgentKind(rows, pid)
        const has = kind !== null
        if (agentState.get(id) !== has) {
          agentState.set(id, has)
          changed = true
          send(id, has, kind)
        }
      }
      // forget sessions that ended
      const live = new Set(deps.pids().map((s) => s.id))
      for (const id of [...agentState.keys()]) if (!live.has(id)) agentState.delete(id)
      agentEvery = changed ? AGENT_POLL_MIN : Math.min(AGENT_POLL_MAX, agentEvery * 2)
      agentNext = deps.now() + agentEvery
    })
  }
}

/** The running poll, so a spawn can ask for an early look. */
let running: (() => void) | null = null

/**
 * Start the poll; the function it returns stops it. `send` is how an answer
 * that CHANGED reaches the renderer (`term:agent`): nothing is sent for a
 * session whose answer is what it was.
 */
export function startAgentPoll(send: AgentSend): () => void {
  const poll = createAgentPoll(send)
  running = poll
  const timer = setInterval(poll, AGENT_POLL_MIN)
  return () => {
    clearInterval(timer)
    if (running === poll) running = null
  }
}

/**
 * Warm the agent-poll pipeline now: the first CIM query is the slow one
 * (cold WMI), and running it while the user is still typing their first
 * command means the dot can appear on the poll that actually matters.
 * term:spawn calls this after a shell that really started.
 */
export function pollAgentsSoon(ms = 300): void {
  setTimeout(() => running?.(), ms)
}
