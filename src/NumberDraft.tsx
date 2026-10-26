import { useEffect, useState } from "react";
export function NumberDraft({
  value,
  min,
  max,
  label,
  change,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  change: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      aria-label={label}
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const number = Number(raw);
        if (
          raw.trim() &&
          Number.isFinite(number) &&
          number >= min &&
          number <= max
        )
          change(number);
      }}
      onBlur={() => setDraft(String(value))}
    />
  );
}
