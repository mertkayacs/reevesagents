// Named design primitives. Screens reference tokens, not raw hex.
// Bluish ReevesAgents brand. Anthropic Orange (#d97757) is reserved for the
// cc provider color only; it is the one warm color in the palette.

export const colors = {
  text: {
    primary: '#ece7dc',  // body text
    dim:     '#b8b0a3',  // labels, secondary text
    muted:   '#817b70',  // tertiary text, divider labels
    faint:   '#55504a',  // disabled, dashed border edges
    subtle:  '#292622',  // near-background tints
  },
  accent: {
    bright:  '#7eb8f5',  // selection cursor, focused text, current breadcrumb
    primary: '#5a96e0',  // panel titles, links, emphasis
    deep:    '#4a6fa5',  // inactive panel borders
    ink:     '#1e2d3e',  // selected button fill
  },
  surface: {
    selected: '#1e2d3e',  // selected action fill
    rail:     '#314253',  // card rails and active separators
    border:   '#3a4b5f',  // card border strokes
    quiet:    '#36383d',  // outer rules
  },
  status: {
    ok:    '#83a36f',  // running, ok, approved
    warn:  '#d7a84f',  // stale, blocked, warn
    error: '#d56a60',  // failed, denied, fail
    info:  '#7fb4d6',  // neutral info
  },
  brand: {
    blue:  '#3a7ad8',  // wordmark base
    pale:  '#a5cdf7',  // wordmark highlight
    gradient: ['#a5cdf7', '#7eb8f5', '#5a96e0', '#3a7ad8', '#2457a7'],  // breath cycle
  },
  // Provider colors are deliberately distinct from accent.bright so a focused
  // provider row does not collide visually with the selection cursor.
  provider: {
    cc:       '#d97757',  // Anthropic Orange (Claude brand); the one warm color
    codex:    '#7aa8c4',  // cool teal-blue
    opencode: '#a890d1',  // muted purple
    hermes:   '#c97b9b',  // muted rose
  },
} as const

export type ColorToken = string

// Separator glyphs used in breadcrumbs and inline runs.
export const sep = {
  dot:  ' · ',
  pipe: ' │ ',
  arr:  ' → ',
} as const

// Spacing in character rows or columns. Ink works in character units.
export const space = {
  none: 0,
  sm:   1,
  md:   2,
  lg:   3,
} as const
