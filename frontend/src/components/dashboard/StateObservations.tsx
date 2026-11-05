import type { Observation } from '@/lib/chartUtils';
export function StateObservations({
  observations,
  formatTime,
  boolean = false,
}: {
  observations: Observation[];
  formatTime: (date: string) => string;
  boolean?: boolean;
}) {
  const valid = observations.filter((p) => p.value !== null);
  const categories = boolean
    ? [false, true]
    : [...new Set(valid.map((p) => p.value))].sort((a, b) => String(a).localeCompare(String(b)));
  const times = observations.map((p) => p.timestamp).filter(Number.isFinite);
  if (!valid.length) return <p>No valid states.</p>;
  const start = Math.min(...times),
    end = Math.max(...times);
  return (
    <div className="max-h-80 overflow-auto">
      <p>States observed at collection times; duration between collections is unknown.</p>
      {categories.map((category) => (
        <div key={String(category)} className="grid grid-cols-[10rem_1fr] items-center gap-2 py-2">
          <span className="break-words">{String(category)}</span>
          <svg
            viewBox="0 0 500 24"
            className="w-full min-w-48"
            role="img"
            aria-label={`Observations for ${String(category)}`}
          >
            <line x1="8" x2="492" y1="12" y2="12" stroke="currentColor" opacity="0.15" />
            {valid
              .filter((p) => p.value === category)
              .map((p) => (
                <circle
                  key={p.run.id}
                  cx={start === end ? 250 : 8 + ((p.timestamp - start) / (end - start)) * 484}
                  cy="12"
                  r="4"
                  fill="currentColor"
                >
                  <title>
                    {formatTime(p.run.executedAt)}: {String(category)}
                  </title>
                </circle>
              ))}
          </svg>
        </div>
      ))}
    </div>
  );
}
