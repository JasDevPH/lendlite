'use client';

import { useId, type CSSProperties } from 'react';

interface RangeFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  // How the value is shown/announced, e.g. 1000000 → "$10,000"
  format: (value: number) => string;
  minLabel?: string;
  maxLabel?: string;
}

// Labelled slider. Uses a native <input type="range">, so keyboard (arrows,
// Home/End, PageUp/Down) and screen readers work out of the box.
export function RangeField({ label, value, min, max, step, onChange, format, minLabel, maxLabel }: RangeFieldProps) {
  const id = useId();
  // Fill the track up to the thumb (purely visual)
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-sm font-medium text-muted">
          {label}
        </label>
        <output htmlFor={id} className="money text-lg font-semibold text-ink">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        // Screen readers announce "$10,000" instead of "1000000"
        aria-valuetext={format(value)}
        className="range-slider mt-3 w-full"
        style={{ '--fill': `${percent}%` } as CSSProperties}
      />
      <div className="money mt-1 flex justify-between text-xs text-subtle">
        <span>{minLabel ?? format(min)}</span>
        <span>{maxLabel ?? format(max)}</span>
      </div>
    </div>
  );
}
