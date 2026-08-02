import React from 'react';
import type { ActiveStain } from '../utils/paperSoul';

interface PaperLayerProps {
  active: ActiveStain[];
  grainUrl: string;
  /** Show shared grain tile (layer 1). */
  showGrain?: boolean;
  /** Discover cards need denser grain so cream parchment does not glare. */
  grainOpacity?: number;
  className?: string;
}

/**
 * Layers behind page content when Paper theme is on.
 * L1 grain (shared) · L2 per-book stains (multiply).
 */
export function PaperLayer({
  active,
  grainUrl,
  showGrain = true,
  grainOpacity = 0.18,
  className = '',
}: PaperLayerProps) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] ${className}`}
      aria-hidden
    >
      {showGrain && (
        <div
          className="absolute inset-0"
          style={{
            opacity: grainOpacity,
            backgroundImage: `url(${grainUrl})`,
            backgroundRepeat: 'repeat',
            backgroundSize: '256px 256px',
            mixBlendMode: 'multiply',
          }}
        />
      )}
      {active.map(({ stain, opacity }) => (
        <img
          key={stain.id}
          src={stain.src}
          alt=""
          className="absolute"
          style={{
            left: `${stain.x * 100}%`,
            top: `${stain.y * 100}%`,
            width: stain.r_px * 2,
            height: stain.r_px * 2,
            transform: 'translate(-50%, -50%)',
            opacity,
            mixBlendMode: 'multiply',
          }}
        />
      ))}
    </div>
  );
}
