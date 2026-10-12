/**
 * THE WINDOW'S CLOSE QUESTION, AS STATE (regression rule 7: closing the window
 * QUITS; an agent that is WORKING holds every way out until the user answers).
 * Moved out of index.ts (audit 2026-10-12) so the flags it keeps are one
 * object with tests, not four loose variables.
 *
 * Every route out of the window ends at `close`: the title bar's X, Alt+F4,
 * the taskbar, a quit. With an agent working and no go-ahead it is VETOED and
 * the renderer asks; its go-ahead (`confirm`) closes the window, or finishes
 * the quit the veto interrupted.
 */
export interface CloseFlow {
  /** The renderer's word: an agent is working (or no longer is). */
  setBusy: (busy: boolean) => void
  /** app.quit() is under way (before-quit, or the page's own quit). */
  quitStarted: () => void
  /** The window is closing: 'ask' vetoes it and asks; 'close' lets it go. */
  onClose: () => 'ask' | 'close'
  /** The renderer said go ahead: finish the quit the veto interrupted, or
   *  close the window. */
  confirm: () => 'quit' | 'close'
  /** Answered in advance (an update install whose question was settled before
   *  it began): the next close goes through. */
  agree: () => void
}

export function createCloseFlow(): CloseFlow {
  let quitting = false // app.quit() is under way
  let quitWanted = false // a quit the close question interrupted; confirm resumes it
  let agentBusy = false // mirrored from the renderer: an agent is WORKING
  let closeAgreed = false // the renderer's "go ahead" for the close in flight
  return {
    setBusy: (busy) => {
      agentBusy = busy
    },
    quitStarted: () => {
      quitting = true
    },
    onClose: () => {
      if (agentBusy && !closeAgreed) {
        // The veto cancels an app.quit() too. Remember that this was one, so
        // the go-ahead finishes the quit, and drop the flag, so that "Cancel"
        // leaves an ordinary window behind.
        quitWanted = quitting
        quitting = false
        return 'ask'
      }
      closeAgreed = false
      agentBusy = false
      return 'close'
    },
    confirm: () => {
      closeAgreed = true
      if (quitWanted) {
        quitWanted = false
        return 'quit'
      }
      return 'close'
    },
    agree: () => {
      closeAgreed = true
    }
  }
}
