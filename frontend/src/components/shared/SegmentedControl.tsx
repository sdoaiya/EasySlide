import { useRef, type KeyboardEvent } from 'react';

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  ariaLabel?: string;
  disabled?: boolean;
};

type SegmentedControlProps<T extends string> = {
  ariaLabel: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
};

export function SegmentedControl<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
  disabled = false,
  className = '',
}: SegmentedControlProps<T>) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!direction || disabled) return;

    event.preventDefault();
    for (let offset = 1; offset <= options.length; offset += 1) {
      const nextIndex = (index + direction * offset + options.length) % options.length;
      const next = options[nextIndex];
      if (!next.disabled) {
        onChange(next.value);
        optionRefs.current[nextIndex]?.focus();
        return;
      }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={`inline-flex rounded-md border border-border-primary bg-background-secondary p-1 ${className}`}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const optionDisabled = disabled || option.disabled;

        return (
          <button
            key={option.value}
            ref={(element) => { optionRefs.current[index] = element; }}
            type="button"
            role="radio"
            aria-label={option.ariaLabel ?? option.label}
            aria-checked={selected}
            disabled={optionDisabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, index)}
            className={`min-h-9 rounded px-3 text-sm transition-colors ${
              selected
                ? 'bg-background-elevated font-medium text-foreground-primary shadow-sm'
                : 'text-foreground-secondary hover:text-foreground-primary'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
