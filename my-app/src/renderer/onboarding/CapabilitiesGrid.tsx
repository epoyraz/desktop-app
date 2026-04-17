/**
 * CapabilitiesGrid — floating pastel capability pills shown on the Welcome screen.
 * Pill colors come from CSS variables (theme.onboarding.css) — no hardcoded hex.
 * Matches screenshot: Research (purple), Sourcing leads (yellow), Automation (green),
 * Emails (blue), Scraping (red), ...and much more (orange).
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Pill data
// ---------------------------------------------------------------------------

interface Pill {
  label: string;
  variant: 'research' | 'sourcing' | 'automation' | 'emails' | 'scraping' | 'more';
}

const CAPABILITY_PILLS: Pill[] = [
  { label: 'Research',         variant: 'research' },
  { label: 'Sourcing leads',   variant: 'sourcing' },
  { label: 'Automation',       variant: 'automation' },
  { label: 'Emails',           variant: 'emails' },
  { label: 'Scraping',         variant: 'scraping' },
  { label: '...and much more', variant: 'more' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CapabilitiesGrid(): React.ReactElement {
  return (
    <div className="capability-pills" role="list" aria-label="Agent capabilities">
      {CAPABILITY_PILLS.map((pill) => (
        <span
          key={pill.label}
          className="capability-pill"
          data-variant={pill.variant}
          role="listitem"
        >
          {pill.label}
        </span>
      ))}
    </div>
  );
}
