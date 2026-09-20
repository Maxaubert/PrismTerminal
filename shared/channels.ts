/**
 * The terminal's IPC channel names, ONCE. The preload half (`core/preload/api`)
 * and the main half (`core/main/ipc`) both read this table, so a channel cannot
 * be renamed on one side of the bridge and not the other, in either app.
 */
export const CH = {
  shells: 'term:shells',
  spawn: 'term:spawn',
  input: 'term:input',
  resize: 'term:resize',
  kill: 'term:kill',
  prewarm: 'term:prewarm',
  cd: 'term:cd',
  data: 'term:data',
  agent: 'term:agent',
  exit: 'term:exit',
  clipboardRead: 'clipboard:read',
  clipboardWrite: 'clipboard:write',
  openExternal: 'shell:open-external'
} as const

/** Dictation's channels (#13). A table of its own: dictation is optional, and
 *  a host wires it with a separate call on each side of the bridge. */
export const DCH = {
  info: 'dictation:info',
  status: 'dictation:status',
  download: 'dictation:download',
  cancel: 'dictation:cancel',
  remove: 'dictation:remove',
  progress: 'dictation:progress',
  transcribe: 'dictation:transcribe',
  stop: 'dictation:stop',
  mediaPause: 'dictation:media-pause',
  mediaResume: 'dictation:media-resume'
} as const
