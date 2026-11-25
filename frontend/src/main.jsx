import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const legacyPaths = new Map([
  ['#home', '/'],
  ['#login', '/login'],
  ['#signup', '/signup'],
])
function redirectLegacyRoute() {
  const { pathname, search, hash } = window.location
  const legacyPath = pathname === '/' ? legacyPaths.get(hash) : undefined
  if (!legacyPath) return false

  window.location.replace(legacyPath + search)
  return true
}

if (!redirectLegacyRoute()) {
  window.addEventListener('hashchange', redirectLegacyRoute)
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
