import { useEffect, useRef, type JSX } from 'react'
import { ROW_BUTTON } from '../settings/fields'

/**
 * ONE LINE BEFORE A MODEL WITH A CATCH IS DOWNLOADED (#121; owner, 2026-10-04:
 * "say ... this model doesn't support all languages when downloading", and
 * "don't make the pop-up obnoxious, don't have extra text, just have it be
 * simple"). The line, Cancel and Download, and nothing else: no title, no
 * vendor, no reason. Both buttons are the neutral row button, since only Save
 * wears the accent (#42). Escape and a press outside are Cancel, as in
 * ThemeSwitchAsk, whose frame this is. Props only.
 */
export default function ModelDownloadAsk({
  text,
  onDownload,
  onCancel
}: {
  text: string
  onDownload: () => void
  onCancel: () => void
}): JSX.Element {
  const go = useRef<HTMLButtonElement>(null)
  // Registered once, the latest onCancel read through a ref (ThemeSwitchAsk's
  // lesson, #22: a listener keyed on an inline callback is re-added each render).
  const cancel = useRef(onCancel)
  useEffect(() => {
    cancel.current = onCancel
  })
  useEffect(() => {
    go.current?.focus()
    const key = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      cancel.current()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  return (
    <div
      data-model-download-ask
      data-owns-escape
      className="no-drag fixed inset-0 z-50 grid place-items-center bg-black/45 p-6 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-describedby="model-download-ask-text"
        className="w-full max-w-[360px] rounded-[var(--p-radius)] border border-[color:var(--p-divider)] bg-[var(--p-side-flat)] p-5"
      >
        <p id="model-download-ask-text" className="text-[13px] leading-relaxed text-[var(--p-text)]">
          {text}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button data-ask-cancel className={ROW_BUTTON} onClick={onCancel}>
            Cancel
          </button>
          <button ref={go} data-ask-download className={ROW_BUTTON} onClick={onDownload}>
            Download
          </button>
        </div>
      </div>
    </div>
  )
}
