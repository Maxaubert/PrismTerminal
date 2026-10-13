import type { JSX } from 'react'

/**
 * THE APP'S MARK IN ONE COLOUR, the accent's (owner, 2026-10-12: "use this for
 * the sidebar logo. it has svgs white black, use the best one, it should
 * adapt to the accent color. use also this on that startup page"). The two
 * shapes of the app icon, exactly as `build/icon-mark.svg` draws them (the
 * owner's own file, white and black in one colour, the rainbow ones fixed in
 * theirs), filled with `currentColor`. The viewBox is the shapes' square
 * around their middle, so the mark sits centred in its box.
 */
export function AppMark({ size, className }: { size: number; className?: string }): JSX.Element {
  return (
    <svg
      data-app-mark
      viewBox="116 115 800 800"
      width={size}
      height={size}
      fill="currentColor"
      fillRule="evenodd"
      className={className}
      aria-hidden
    >
      <path d="M452 212 H601 Q626 212 642 239 L711 351 Q724 373 711 395 L439 795 Q423 818 401 818 H249 Q227 818 213 797 L142 686 Q128 665 140 644 L410 238 Q426 212 452 212 Z M610 265 L353 649 Q343 663 351 677 L411 770 Q419 782 428 768 L684 389 Q695 373 685 357 L629 266 Q620 251 610 265 Z" />
      <path d="M702 507 H788 Q810 507 824 531 L891 643 Q901 660 891 678 L803 799 Q789 818 770 818 H613 Q590 818 576 797 L544 744 Q532 725 543 707 L664 529 Q679 507 702 507 Z M790 553 L723 650 Q714 663 722 676 L780 770 Q789 782 798 767 L865 672 Q874 660 866 646 L807 550 Q798 540 790 553 Z" />
    </svg>
  )
}

/**
 * THE TITLE BAR'S MARK, THE QUIET ONE, in both layouts (#205; owner,
 * 2026-10-14, of six looks in a mockup: "try quiet mark for both"). The mark
 * alone, no name, in the buttons' own ink: there, not shouting, so the tabs
 * keep their room and the window, not the logo, is the point. Part of the
 * handle the window moves by. Before: the accent mark and "Prism Terminal",
 * with vertical tabs only ("i also dont love it. it needs to be on both").
 */
export function TitleMark({ className = '' }: { className?: string }): JSX.Element {
  return (
    <div
      data-app-brand
      role="img"
      aria-label="Prism Terminal"
      className={`flex shrink-0 items-center select-none ${className}`}
    >
      <AppMark size={17} className="text-[var(--p-icon)]" />
    </div>
  )
}
