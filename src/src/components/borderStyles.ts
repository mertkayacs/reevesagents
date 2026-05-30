// Custom Ink border style objects. The Ink `borderStyle` prop accepts either
// a preset name or an object of edge/corner glyphs; we use the object form
// for the dashed style so secondary chrome reads as visually lighter.

export const DASHED_BORDER = {
  topLeft: '┌',
  top: '┄',
  topRight: '┐',
  left: '┆',
  right: '┆',
  bottomLeft: '└',
  bottom: '┄',
  bottomRight: '┘',
} as const
