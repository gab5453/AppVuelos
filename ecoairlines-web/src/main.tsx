import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initObservability } from './lib/observability';

// Observabilidad del navegador (solo localStorage); el administrador la consulta en /admin/observabilidad.
initObservability();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
