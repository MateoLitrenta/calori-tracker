import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './components/ThemeProvider'
import { AppStoreProvider } from './hooks/useAppStore'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="calori-theme">
      <AppStoreProvider>
        <App />
      </AppStoreProvider>
    </ThemeProvider>
  </StrictMode>,
)
