import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './components/ThemeProvider'
import { AppStoreProvider } from './hooks/useAppStore'

declare const __CALORI_PREVIEW_COMMIT__: string;
if (typeof __CALORI_PREVIEW_COMMIT__ !== 'undefined' && __CALORI_PREVIEW_COMMIT__ && new URLSearchParams(location.search).get('diagnostico') === 'teclado') {
  document.documentElement.dataset.keyboardDiagnostics = 'active';
  void import('./previewKeyboardGeometry').then(m => m.captureKeyboardGeometry(__CALORI_PREVIEW_COMMIT__));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="calori-theme">
      <AppStoreProvider>
        <App />
      </AppStoreProvider>
    </ThemeProvider>
  </StrictMode>,
)
