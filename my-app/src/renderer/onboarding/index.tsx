import React from 'react';
import { createRoot } from 'react-dom/client';
import { OnboardingApp } from './OnboardingApp';
import '@/renderer/design/theme.global.css';
import './onboarding.css';

document.documentElement.dataset.theme = 'shell';

window.addEventListener('error', (e) => {
  console.error('[onboarding] renderer.error', { message: e.message, file: e.filename, line: e.lineno });
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[onboarding] renderer.unhandledrejection', { reason: String(e.reason) });
});

const rootEl = document.getElementById('onboarding-root');
if (!rootEl) throw new Error('[onboarding] #onboarding-root element not found');

createRoot(rootEl).render(
  <React.StrictMode>
    <OnboardingApp />
  </React.StrictMode>,
);
