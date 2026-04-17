/**
 * CharacterMascot — renders the mascot SVG with idle float animation.
 * Imports the SVG from assets/character/mascot.default.svg via Vite's
 * ?raw query (string) so it renders inline. Falls back to a placeholder
 * div if the SVG file isn't available (dev without assets).
 *
 * data-state="loading" on .mascot-wrapper accelerates the float animation
 * (see theme.onboarding.css .mascot-wrapper[data-state="loading"]).
 */

import React from 'react';
import mascotSrc from '../../../assets/character/mascot.default.svg';

interface CharacterMascotProps {
  /** 'idle' (default) or 'loading' — controls animation speed */
  state?: 'idle' | 'loading';
  /** Accessible label for screen readers */
  ariaLabel?: string;
  width?: number;
  height?: number;
}

export function CharacterMascot({
  state = 'idle',
  ariaLabel = 'Companion mascot',
  width = 160,
  height = 180,
}: CharacterMascotProps): React.ReactElement {
  return (
    <div className="mascot-stage">
      <div className="mascot-wrapper" data-state={state}>
        {mascotSrc ? (
          <img
            src={mascotSrc}
            alt={ariaLabel}
            width={width}
            height={height}
            aria-label={ariaLabel}
            draggable={false}
          />
        ) : (
          // Fallback placeholder when SVG asset is missing
          <div
            aria-label={ariaLabel}
            role="img"
            style={{
              width,
              height,
              borderRadius: '50% 50% 40% 40%',
              backgroundColor: 'var(--color-mascot-body)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 40,
            }}
          >
            {'🤖'}
          </div>
        )}
      </div>
    </div>
  );
}
