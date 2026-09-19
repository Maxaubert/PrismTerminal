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
  openExternal: 'shell:open-external'
} as const
