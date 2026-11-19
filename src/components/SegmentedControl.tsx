import type { CSSProperties } from 'react';
import './SegmentedControl.css';

interface SegmentedControlProps<T extends string> {
  label: string;
  className: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export default function SegmentedControl<T extends string>({ label, className, options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div className={`segmented-control ${className}`} role="group" aria-label={label}
      style={{ '--option-count': options.length, '--active-index': options.findIndex(option => option.value === value) } as CSSProperties}>
      <span className="segmented-control-indicator" aria-hidden="true" />
      {options.map(option => (
        <button key={option.value} type="button" aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}>{option.label}</button>
      ))}
    </div>
  );
}
