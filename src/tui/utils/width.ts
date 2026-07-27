// Display-width helpers: count terminal cells, not code units, so emoji flags and
// CJK text size and pad correctly. Naive String.length miscounts wide (CJK, emoji)
// and zero-width characters, which throws off column padding and box-border math.
import stringWidth from 'string-width'

export function displayWidth(text: string): number {
  return stringWidth(text)
}

export function padEndDisplay(text: string, targetWidth: number): string {
  const gap = targetWidth - stringWidth(text)
  return gap > 0 ? text + ' '.repeat(gap) : text
}
