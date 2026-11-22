import { createRoot } from 'react-dom/client'
import { App } from './App'
import { CloudJournal } from './services/cloud'
import { watchJournal } from './services/realtime'
import './routine.css'
import './branding.css'
import './components/refinement.css'

const url = new URL(window.location.href)
if (url.searchParams.has('utm_source', 'chatgpt.com')) {
  url.searchParams.delete('utm_source', 'chatgpt.com')
  window.history.replaceState(window.history.state, '', url)
}

const root = document.getElementById('root')
if (!root) throw Error('Missing application root')
const cloud = new CloudJournal(localStorage, sessionStorage, message => window.confirm(message), window.fetch.bind(window), watchJournal)
createRoot(root).render(<App cloud={cloud} />)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { updateViaCache: 'none' })
      .catch(error => console.error('Could not register the My Routine service worker', error))
  }, { once: true })
}
