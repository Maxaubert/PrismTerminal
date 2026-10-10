import type { MarkMotion } from '../lib/tabMark'

/** The class in `styles/marks.css` that moves each motion. `flow` has one per
 *  axis (a line flows along x, a Prompt edge down y); `still` moves nothing. */
export const MOTION_CLASS: Record<MarkMotion, string> = {
  run: 'p-agent-run',
  grow: 'p-mark-grow',
  breathe: 'p-mark-breathe',
  flow: 'p-mark-flow-x p-mark-flow-y',
  ride: 'p-mark-ride',
  spin: 'p-mark-spin',
  still: ''
}

/** The class for a motion on a mark running along `axis`. */
export function motionClass(motion: MarkMotion | null, axis: 'x' | 'y' = 'x'): string {
  if (!motion) return ''
  if (motion === 'flow') return axis === 'x' ? 'p-mark-flow-x' : 'p-mark-flow-y'
  return MOTION_CLASS[motion]
}

/** The icon's dark ground (#143, the mockup's `#383c44`): Full's finished fill,
 *  with the rainbow along its foot. */
export const MARK_BADGE = '#383c44'
