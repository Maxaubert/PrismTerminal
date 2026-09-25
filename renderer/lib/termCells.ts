/**
 * CELLS ARE NOT CHARACTERS (code review 2026-09-24, #20 and #25). The screen
 * counts cells: a wide character is two (the second a spacer of width 0), an
 * emoji is one character but two UTF-16 units, a combining sequence is one
 * cell holding several. The text a link search or a rewrite works on is a
 * string, indexed in UTF-16 units. Mixing the two put the cursor one cell
 * left of the shell's after every resize (a prompt ending in a space) and
 * moved a link's edges by one after an emoji. So the text is built HERE, cell
 * by cell, with the index where each cell's text starts, and every caller
 * converts through that index rather than by counting.
 */
export interface CellInfo {
  /** What the cell holds; '' for an empty cell and for a wide character's spacer. */
  chars: string
  /** 1, 2 for a wide character, 0 for its spacer. */
  width: number
}

export interface CellText {
  /** Empty cells as spaces, spacers as nothing: what translateToString gives. */
  text: string
  /** index[i] is where cell i's text starts in `text`; a spacer shares its
   *  character's. index[cells.length] is text.length. */
  index: number[]
  /** The cell just past the last one holding anything. */
  textEnd: number
}

export function cellText(cells: readonly CellInfo[]): CellText {
  let text = ''
  let textEnd = 0
  const index: number[] = []
  cells.forEach((cell, i) => {
    if (cell.width === 0) {
      index.push(i > 0 ? index[i - 1] : text.length)
      return
    }
    index.push(text.length)
    text += cell.chars || ' '
    if (cell.chars !== '') textEnd = i + Math.max(1, cell.width)
  })
  index.push(text.length)
  return { text, index, textEnd }
}

/**
 * Where a cursor `back` cells before (or, negative, after) the position
 * (`row`, `col`) lands on a screen `cols` wide, following the wrap. Rows are
 * never walked above 0.
 */
export function cellFrom(row: number, col: number, back: number, cols: number): { row: number; col: number } {
  let r = row
  let c = col - back
  while (c < 0 && r > 0) {
    c += cols
    r -= 1
  }
  while (c >= cols) {
    c -= cols
    r += 1
  }
  return { row: r, col: Math.max(0, c) }
}
