import type { MouseEvent } from 'react'
import { failedLabel } from '@core/renderer/lib/agentHookSignal'
import type { Tab } from '../lib/tabs'
import type { DetectedAgent } from '@core/shared/types'

/** What both tab layouts are handed: the strip and the sidebar take the same
 *  props, so App builds them once (audit 2026-10-12: two copies of this type). */
export interface TabListProps {
  tabs: Tab[]
  activeId: string | null
  /** Sessions with SUSTAINED recent output: with an agent present, this IS
   *  the indicator. Idle looks default - only working paints. */
  workingIds: ReadonlySet<string>
  /** Sessions whose agent finished while their tab was in the background;
   *  they wear the finished colour until the tab is visited. */
  doneIds: ReadonlySet<string>
  /** Sessions whose agent waits for your answer, unseen (2026-09-28). */
  questionIds: ReadonlySet<string>
  /** Sessions whose turn ended on an error, unseen (#131), and the error's
   *  kind where Claude Code named one. */
  failedIds?: ReadonlySet<string>
  failedKinds?: { readonly current: ReadonlyMap<string, string> }
  /** Sessions whose shell currently hosts an AI CLI (Claude Code, codex). */
  agentIds: ReadonlySet<string>
  /** Which agent each of those runs, for its tab's icon (2026-10-12). */
  agentKinds?: { readonly current: ReadonlyMap<string, DetectedAgent> }
  /** Tabs still coming back to an agent (#106): a ring before the name,
   *  until the agent has drawn itself. */
  loadingIds?: ReadonlySet<string>
  onPick: (id: string) => void
  onClose: (id: string) => void
  /** New tab ADDS a tab. Where it opens is App's to decide (a chooser, or the
   *  one fixed folder Settings names). */
  onNew: () => void
  /** Something dragged in from Explorer and dropped on the tabs: a new tab
   *  there. The path is handed over AS DROPPED, folder or file, because the
   *  renderer cannot stat; whoever owns the handler resolves a file to the
   *  folder holding it. */
  onDropFolder: (path: string) => void
  /** A tab carried along the tabs lands in front of `toIndex` (#70). */
  onReorder: (id: string, toIndex: number) => void
  /** Open a folder from New tab's list of places a tab has been opened. */
  onOpenRecent: (path: string) => void
}

/** A tab's tooltip: the whole path (the label is its last segment), and while
 *  the Failed line shows, what failed under it (#131): "Failed: rate limit". */
export function tabTitle(t: Tab, failed: boolean, kinds?: { readonly current: ReadonlyMap<string, string> }): string | undefined {
  if (t.kind === 'settings') return undefined
  return failed ? `${t.cwd}\n${failedLabel(kinds?.current.get(t.id))}` : t.cwd
}

/** A folder dropped from Explorer onto the tabs: a new tab there for each. The
 *  stopPropagation keeps a window-level drop handler from hearing it too; tabs
 *  themselves reorder by pointer, not by this. */
export function folderDrop(onDropFolder: (path: string) => void): {
  onDragOver: (e: { preventDefault: () => void; stopPropagation: () => void }) => void
  onDrop: (e: { preventDefault: () => void; stopPropagation: () => void; dataTransfer: DataTransfer }) => void
} {
  return {
    onDragOver: (e) => {
      e.preventDefault()
      e.stopPropagation()
    },
    onDrop: (e) => {
      e.preventDefault()
      e.stopPropagation()
      for (const f of e.dataTransfer.files ?? []) {
        // Empty for a File that did not come off the disk (an image dragged
        // out of a browser): there is no folder to open a shell in.
        const path = window.prism.getDroppedPath(f)
        if (path) onDropFolder(path)
      }
    }
  }
}

/** Middle-click closes, the way every tab strip does. `auxclick` rather than
 *  mousedown so a stray middle press while scrolling does not lose a tab. */
export function auxClose(e: MouseEvent, close: () => void): void {
  if (e.button === 1) {
    e.preventDefault()
    close()
  }
}
