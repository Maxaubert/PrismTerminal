/**
 * THE TAB MARKS HOLD STILL WHILE THE WINDOW IS MINIMISED (perf review
 * 2026-10-16). The window is never throttled (`backgroundThrottling: false`,
 * for the agent clocks), so a working bar or a finished rainbow went on being
 * drawn at the display's rate for hours with nobody looking. Main says when
 * the window is minimised and restored; `data-marks-paused` on the root is
 * what the core's marks.css pauses every mark on.
 */
export function watchMarksPause(
  onMinimized: (cb: (minimized: boolean) => void) => () => void,
  root: Pick<HTMLElement, 'toggleAttribute'>
): () => void {
  return onMinimized((minimized) => root.toggleAttribute('data-marks-paused', minimized === true))
}
