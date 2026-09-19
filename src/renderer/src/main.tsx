// The terminal core asks its host who it is; this runs before App's module
// graph is evaluated (see termHost.ts).
import './termHost'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
