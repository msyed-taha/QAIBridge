import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// Fonts are bundled and served by QAIbridge itself (not Google Fonts), so a
// visitor's browser never contacts a third party just to render the page.
import '@fontsource/inter/300.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/fira-code/400.css'
import '@fontsource/fira-code/500.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
