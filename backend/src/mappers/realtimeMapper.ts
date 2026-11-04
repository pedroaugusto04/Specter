import type { RealtimeEventDto } from '@specter/contracts';
export function toRealtimeDto(event: RealtimeEventDto): RealtimeEventDto {
  return {
    type: event.type,
    userId: event.userId,
    jobId: event.jobId,
    status: event.status,
    runId: event.runId,
    hasChanges: event.hasChanges,
    timestamp: event.timestamp,
  };
}
