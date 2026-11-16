import type { JobRunDto } from '@/lib/api';
import { RunPhase } from '@specter/contracts';

export function runProgressLabel(run: JobRunDto): string {
  if (run.phase === RunPhase.Recovering) return 'Recovering monitor…';
  if (run.phase === RunPhase.Retrying || run.phase === RunPhase.Confirming) return 'Retrying…';
  return 'Checking…';
}
