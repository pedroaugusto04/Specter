import type { JobRunDto } from '@/lib/api';
import { RunPhase } from '@specter/contracts';

export function runProgressPill(run: JobRunDto): string {
  if (run.phase === RunPhase.Recovering) return 'RECOVERING';
  if (run.phase === RunPhase.Retrying) return 'RETRYING';
  if (run.phase === RunPhase.Confirming) return 'CONFIRMING';
  if (run.phase === RunPhase.Checking) return 'CHECKING';
  return 'RUNNING';
}
