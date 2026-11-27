import type { RealtimeEventDto } from '@specter/contracts';

export function toRealtimeDto(event: RealtimeEventDto): RealtimeEventDto {
  return {
    type: event.type,
    userId: event.userId,
    jobId: event.jobId,
    ...(event.status !== undefined ? { status: event.status } : {}),
    ...(event.runId !== undefined ? { runId: event.runId } : {}),
    ...(event.hasChanges !== undefined ? { hasChanges: event.hasChanges } : {}),
    ...(event.message !== undefined ? { message: event.message } : {}),
    ...(event.fallbackToPrevious !== undefined
      ? { fallbackToPrevious: event.fallbackToPrevious }
      : {}),
    timestamp: event.timestamp,
  };
}

export function formatSseEvent(eventName: string, payload: unknown): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function buildConnectedEvent(userId: string) {
  return {
    type: 'CONNECTED' as const,
    userId,
    timestamp: new Date().toISOString(),
  };
}
