/**
 * RUNS OF NEIGHBOURING WORKING TABS (2026-09-28; owner: "when tabs 1, 2 and 3
 * are all working, but not when tab 1 and 3 is working ... there should be one
 * single working indicator that moves across all the tabs and not 3
 * separate"). Given which tabs work, in strip order, the runs of TWO OR MORE
 * side by side, as inclusive index ranges. A tab working alone is no run: it
 * keeps its own bar. Pure.
 */
export function workingRuns(working: readonly boolean[]): Array<{ start: number; end: number }> {
  const runs: Array<{ start: number; end: number }> = []
  let start = -1
  for (let i = 0; i <= working.length; i += 1) {
    if (i < working.length && working[i]) {
      if (start < 0) start = i
    } else if (start >= 0) {
      if (i - 1 > start) runs.push({ start, end: i - 1 })
      start = -1
    }
  }
  return runs
}
