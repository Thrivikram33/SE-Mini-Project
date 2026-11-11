import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { getFrontendTransportStatus } from '../scripts/transportSecurity.js'

const rootElement = document.getElementById('root')

if (getFrontendTransportStatus(import.meta.env.PROD, window.location.protocol) === 'https-required') {
  const notice = document.createElement('p')
  notice.textContent = 'This application requires a secure HTTPS connection.'
  notice.setAttribute('role', 'alert')
  rootElement.replaceChildren(notice)
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
