import type { JSX } from 'react'

// A GLYPH ON EVERY MENU ROW, AS IN PRISM'S EXPLORER (owner, 2026-09-28: "the
// items should have icons like in prism explorer"). The paths, stroke and
// size are Prism's `FileMenuIcon` where Prism has the action (open, copy,
// paste, the link, the folder), so a row reads the same in both apps; find,
// help and close are drawn to match.
const paths = {
  open: 'M14 4h6v6M20 4l-9 9M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6',
  copy: 'M8 8h12v12H8zM16 8V4H4v12h4',
  paste: 'M9 3.5h6v3H9zM7 5H4.5v15.5h15V5H17',
  link: 'M9 15l6-6M7.5 10.5l-2 2a3.5 3.5 0 0 0 5 5l2-2M16.5 13.5l2-2a3.5 3.5 0 0 0-5-5l-2 2',
  folder: 'M2.5 5.5h6.2l2 2.6h10.8v10.4H2.5z',
  find: 'M10.5 4.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15 15l5 5',
  help: 'M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4zM9.6 9.4a2.5 2.5 0 1 1 3.7 2.2c-.8.5-1.3 1-1.3 1.9M12 16.6v.01',
  close: 'M7 7l10 10M17 7L7 17'
}

export type MenuIconName = keyof typeof paths

export function MenuIcon({ name }: { name: MenuIconName }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={13}
      height={13}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 opacity-80"
      aria-hidden
      data-menu-icon={name}
    >
      <path d={paths[name]} />
    </svg>
  )
}
