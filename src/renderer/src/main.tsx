import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { configurePrismTerminalHost } from './termHost'
import './index.css'

// Before anything renders: the core asks its host who it is.
configurePrismTerminalHost()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
