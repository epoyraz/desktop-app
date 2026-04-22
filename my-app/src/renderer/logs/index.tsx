import React from 'react';
import { createRoot } from 'react-dom/client';
import { LogsApp } from './LogsApp';
import './logs.css';

document.documentElement.dataset.theme = 'shell';

const rootEl = document.getElementById('logs-root');
if (!rootEl) throw new Error('[logs] #logs-root not found');

createRoot(rootEl).render(
  <React.StrictMode>
    <LogsApp />
  </React.StrictMode>,
);
