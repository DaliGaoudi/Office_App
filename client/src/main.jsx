import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { makeServer } from './mockServer';

if (import.meta.env.VITE_DEMO_MODE === 'true') {
  makeServer({ environment: "development" });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
