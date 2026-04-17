/**
 * Track B — Pill renderer entry point.
 * Mounts the Pill React tree into #pill-root.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { Pill } from './Pill';
import './pill.css';

// Apply shell theme (dark Linear+Obsidian) — pill uses same palette
document.documentElement.dataset.theme = 'shell';

const rootEl = document.getElementById('pill-root');
if (!rootEl) throw new Error('[pill] #pill-root element not found');

createRoot(rootEl).render(
  <React.StrictMode>
    <Pill />
  </React.StrictMode>,
);
