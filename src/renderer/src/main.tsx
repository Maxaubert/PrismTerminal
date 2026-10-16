// The terminal core asks its host who it is; this runs before App's module
// graph is evaluated (see termHost.ts).
import './termHost'
import { StrictMode } from 'react'
import { startDiag } from '@core/renderer/lib/diag'
import { createRoot } from 'react-dom/client'
import App from './App'
import { watchMarksPause } from './lib/marksPause'
import { migrateOpacity } from './lib/opacityMigration'
import { migrateSeeThrough } from './lib/seeThroughMigration'
import './index.css'

// The Opacity slider became the Background colour's alpha (#114): what it
// left in storage is moved before the first paint, so the window a user had
// is the window they get.
migrateOpacity()
// Then the switch and that alpha became the see-through slider (2026-10-13).
migrateSeeThrough()

// THE PAGE'S HALF OF THE DIAGNOSTICS LOG (#140): long frames, errors, the
// heartbeat main watches, and the crumbs the app says. Before the first
// render, so a stall or an error while App mounts is caught too.
startDiag(window.prism)

// The tab marks hold still while the window is minimised (lib/marksPause).
watchMarksPause(window.prism.onMinimized, document.documentElement)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
