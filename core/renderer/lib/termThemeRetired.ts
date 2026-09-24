// THEMES THAT WERE RETIRED, AND WHERE THEIR WEARERS GO (owner, 2026-09-23:
// "clean up the themes. there's too many similar themes"). A theme id is a
// saved-settings key, in both apps; a retired one must not drop somebody onto
// the host's default, which may look nothing like what they chose. Each maps
// to the kept theme nearest in ground and mood. Read where the id is read
// (`termThemeId`), so the wall shows the right card, and where it is resolved.

export const RETIRED_THEMES: Readonly<Record<string, string>> = {
  'bright-lights': 'pitch',
  molokai: 'graphite',
  jellybeans: 'graphite',
  wombat: 'pt-default',
  hybrid: 'graphite',
  'monokai-soda': 'graphite',
  'gruvbox-dark': 'umber',
  'jetbrains-darcula': 'graphite',
  afterglow: 'graphite',
  materialdark: 'graphite',
  onehalfdark: 'ink',
  espresso: 'umber',
  zenburn: 'moss',
  onehalflight: 'paper',
  'ayu-light': 'paper',
  github: 'paper',
  'tokyonight-day': 'mist',
  'rose-pine-dawn': 'blossom',
  'solarized-light': 'fawn',
  'solarized-dark': 'ink',
  'night-owl': 'ink',
  ayu: 'ink',
  denim: 'ink',
  spacegray: 'nord',
  argonaut: 'ink',
  iceberg: 'nord',
  'tokyonight-storm': 'nord',
  tokyonight: 'ink',
  adventuretime: 'ink',
  'rose-pine-moon': 'rosewood',
  'rose-pine': 'rosewood',
  ubuntu: 'rosewood'
}

/** The id to use for `id`: its replacement when it was retired, else itself. */
export const liveThemeId = (id: string): string => RETIRED_THEMES[id] ?? id
