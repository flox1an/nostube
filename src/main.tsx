import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import './index.css'

// FIXME: a custom font should be used. Eg:
// import '@fontsource-variable/inter';

createRoot(document.getElementById("root")!).render(<App />);
