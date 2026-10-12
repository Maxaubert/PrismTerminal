import { useEffect, useState } from 'react'

/**
 * FACTS ABOUT THE MACHINE THAT DO NOT CHANGE WHILE THE APP RUNS: the running
 * version and the user's own folder. Asked of main ONCE and kept (audit
 * 2026-10-12: five components each asked again, some guarding against an
 * answer that came after they had gone, some not).
 */
function once(ask: () => Promise<string>): { get: () => Promise<string>; use: () => string } {
  let answer: string | null = null
  let asking: Promise<string> | null = null
  const get = (): Promise<string> =>
    (asking ??= ask().then((v) => {
      answer = v
      return v
    }))
  const use = (): string => {
    const [v, setV] = useState(answer ?? '')
    useEffect(() => {
      if (answer !== null) return
      let live = true
      void get().then((x) => {
        if (live) setV(x)
      })
      return () => {
        live = false
      }
    }, [])
    return v
  }
  return { get, use }
}

const version = once(() => window.prism.appVersion())
const home = once(() => window.prism.homeDir())

/** The running version ('' until main has said). */
export const useAppVersion = version.use
/** The user's own folder ('' until main has said). */
export const useHomeDir = home.use
/** The user's own folder, for code outside a component. */
export const homeDir = home.get
