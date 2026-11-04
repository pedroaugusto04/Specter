'use client';
import type { SemanticPolicy } from '@/lib/extractionPlan';
export function SemanticReviewSettings({
  value,
  onChange,
}: {
  value: SemanticPolicy | null;
  onChange(value: SemanticPolicy | null): void;
}) {
  const mode = value?.enabled === undefined ? 'inherit' : value.enabled ? 'enabled' : 'disabled';
  return (
    <fieldset className="rounded-lg border border-border p-4 space-y-3">
      <legend className="px-1 text-sm font-medium">Review extracted data with AI</legend>
      <select
        aria-label="AI review policy"
        className="w-full rounded border border-border bg-background p-2 text-sm"
        value={mode}
        onChange={(event) =>
          onChange(
            event.target.value === 'inherit'
              ? null
              : { ...value, enabled: event.target.value === 'enabled' }
          )
        }
      >
        <option value="inherit">Use application default</option>
        <option value="enabled">Enabled</option>
        <option value="disabled">Disabled</option>
      </select>
      {mode !== 'disabled' && (
        <label className="flex items-center justify-between gap-3 text-sm">
          Minimum review score (0-10)
          <input
            aria-label="Minimum AI review score"
            type="number"
            min={0}
            max={10}
            step={1}
            placeholder="Default"
            className="w-24 rounded border border-border bg-background p-2"
            value={value?.threshold ?? ''}
            onChange={(event) => {
              const threshold =
                event.target.value === ''
                  ? undefined
                  : Math.min(10, Math.max(0, Math.trunc(Number(event.target.value))));
              onChange({ ...value, threshold });
            }}
          />
        </label>
      )}
      <p className="text-xs text-muted-foreground">
        Applies during setup and recovery. Disabled review is skipped and never blocks activation.
        Data validation remains required.
      </p>
    </fieldset>
  );
}
