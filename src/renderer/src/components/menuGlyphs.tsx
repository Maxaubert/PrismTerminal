import type { JSX } from 'react'

/** A folder, at menu size: the + menu lists PLACES. */
export const FolderGlyph = (): JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    width={13}
    height={13}
    fill="var(--p-tree-folder)"
    className="shrink-0"
    aria-hidden
  >
    <path d="M2.5 5.5h6.2l2 2.6h10.8v10.4H2.5z" />
  </svg>
)

/** The pin on a + menu row (#99): outlined while the folder is only history,
 *  filled once it is pinned. One path, two fills, so the two states line up. */
export const PinGlyph = ({ filled }: { filled: boolean }): JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    width={12}
    height={12}
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinejoin="round"
    className="shrink-0"
    data-pin={filled ? 'on' : 'off'}
    aria-hidden
  >
    <path d="M15 3l6 6-3 1-4 4 .5 4.5L10 14l-6 6-1-1 6-6-4.5-4.5L9 8l4-4z" />
  </svg>
)
