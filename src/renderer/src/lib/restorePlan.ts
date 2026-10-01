import type { Restored, SavedTabs } from '@shared/types'
import type { Tab, TabState } from './tabs'

/**
 * TABS FROM THE FIRST FRAME (#106; spec
 * docs/superpowers/specs/2026-09-30-launch-skeleton-design.md). The owner saw
 * the start screen ("no tabs open") for as long as main took to settle the
 * restore: stat every folder, scan Claude's session files. Now the page draws
 * the SAVED list at once (`peekTabs`, a synchronous read of tabs.json) as
 * placeholders, and settles each one when the restore answers: the restored
 * tab takes over the placeholder at its saved place, a folder that has gone
 * loses its placeholder, and the folders the launch was handed come after.
 * Pure: the page spawns what this says to.
 */
export interface Boot {
  state: TabState
  /** Saved index -> the placeholder's id. */
  slots: string[]
}

export function peekState(saved: SavedTabs, newId: () => string): Boot {
  const slots: string[] = []
  const tabs: Tab[] = saved.tabs.map((t) => {
    const id = newId()
    slots.push(id)
    // An agent tab wears the skeleton from its first frame; a plain one the
    // bare ground, its prompt being well under a second away.
    return { id, cwd: t.cwd, pending: t.agent === 'claude' || t.agent === 'codex' ? 'agent' : 'shell' }
  })
  const front = slots[Math.min(Math.max(0, saved.active), slots.length - 1)] ?? null
  return { state: { tabs, activeId: front }, slots }
}

export interface Settled {
  state: TabState
  /** The shells to start now, in strip order. */
  spawn: Array<{ id: string; cwd: string; resume?: string }>
}

export function settleRestore(s: TabState, slots: string[], r: Restored, newId: () => string): Settled {
  const claim = new Map<string, { cwd: string; resume?: string }>()
  const spawn: Settled['spawn'] = []
  const extra: Tab[] = []
  const restoredIds: string[] = []
  for (const t of r.tabs) {
    const slot = t.from !== undefined ? slots[t.from] : undefined
    // A placeholder the user closed before the restore answered stays closed.
    if (slot && !s.tabs.some((x) => x.id === slot)) continue
    const id = slot ?? newId()
    restoredIds.push(id)
    if (slot === id) claim.set(id, { cwd: t.cwd, resume: t.resume })
    else extra.push({ id, cwd: t.cwd })
    spawn.push(t.resume ? { id, cwd: t.cwd, resume: t.resume } : { id, cwd: t.cwd })
  }
  // Placeholders keep their places; one nobody claimed (its folder has gone) goes.
  const tabs: Tab[] = []
  for (const t of s.tabs) {
    if (!t.pending) tabs.push(t)
    else if (claim.has(t.id)) tabs.push({ id: t.id, cwd: claim.get(t.id)!.cwd })
  }
  tabs.push(...extra)
  // The restore's front tab, unless the user has already picked one that stays.
  const picked = s.activeId && tabs.some((t) => t.id === s.activeId && !s.tabs.find((x) => x.id === t.id)?.pending)
  const front = picked ? s.activeId : (restoredIds[r.active] ?? tabs[tabs.length - 1]?.id ?? null)
  return { state: { tabs, activeId: front }, spawn }
}
