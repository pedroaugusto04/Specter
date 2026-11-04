'use client';

import { getApiBaseUrl } from '@/lib/api';
import * as React from 'react';

import type { RealtimeEventDto as RealtimeEventPayload } from '@specter/contracts';
export type {
  RealtimeEventDto as RealtimeEventPayload,
  RealtimeEventType,
} from '@specter/contracts';

export type ConnectionMode = 'realtime' | 'polling' | 'connecting' | 'disconnected';

export interface UseRealtimeEventsOptions {
  enabled?: boolean;
  onJobEvent?: (event: RealtimeEventPayload) => void;
  onReconnect?: () => void;
  fallbackPollIntervalMs?: number;
}

export interface UseRealtimeEventsResult {
  connectionMode: ConnectionMode;
  lastEventAt: Date | null;
  reconnectCount: number;
}

export function useRealtimeEvents({
  enabled = true,
  onJobEvent,
  onReconnect,
  fallbackPollIntervalMs = 45_000,
}: UseRealtimeEventsOptions): UseRealtimeEventsResult {
  const [connectionMode, setConnectionMode] = React.useState<ConnectionMode>('connecting');
  const [lastEventAt, setLastEventAt] = React.useState<Date | null>(null);
  const [reconnectCount, setReconnectCount] = React.useState(0);

  const onJobEventRef = React.useRef(onJobEvent);
  const onReconnectRef = React.useRef(onReconnect);

  React.useEffect(() => {
    onJobEventRef.current = onJobEvent;
  }, [onJobEvent]);

  React.useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setConnectionMode('disconnected');
      return;
    }

    // Check if browser supports EventSource
    if (typeof EventSource === 'undefined') {
      setConnectionMode('polling');
      return;
    }

    let eventSource: EventSource | null = null;
    let fallbackTimer: NodeJS.Timeout | null = null;
    let isDisposed = false;

    const startFallbackPolling = () => {
      if (fallbackTimer) clearInterval(fallbackTimer);
      fallbackTimer = setInterval(() => {
        // Only poll if window/tab is visible
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          return;
        }
        onReconnectRef.current?.();
      }, fallbackPollIntervalMs);
    };

    const stopFallbackPolling = () => {
      if (fallbackTimer) {
        clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
    };

    const handleIncomingEvent = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as RealtimeEventPayload;
        setLastEventAt(new Date());
        onJobEventRef.current?.(payload);
      } catch {
        // ignore malformed event payload
      }
    };

    const connectSse = () => {
      try {
        const baseUrl = getApiBaseUrl();
        const url = `${baseUrl}/api/events`;

        eventSource = new EventSource(url, { withCredentials: true });

        eventSource.onopen = () => {
          if (isDisposed) return;
          setConnectionMode('realtime');
          stopFallbackPolling();
          setReconnectCount((prev) => {
            const next = prev + 1;
            // On successful reconnection after a drop, refetch state
            if (next > 1) {
              onReconnectRef.current?.();
            }
            return next;
          });
        };

        // Listen for specific domain event types
        eventSource.addEventListener('JOB_CREATED', handleIncomingEvent);
        eventSource.addEventListener('JOB_UPDATED', handleIncomingEvent);
        eventSource.addEventListener('JOB_DELETED', handleIncomingEvent);
        eventSource.addEventListener('JOB_RUN_COMPLETED', handleIncomingEvent);

        eventSource.onerror = () => {
          if (isDisposed) return;
          // EventSource will automatically retry with backoff;
          // reflect degraded status and enable fallback polling
          setConnectionMode('polling');
          startFallbackPolling();
        };
      } catch {
        setConnectionMode('polling');
        startFallbackPolling();
      }
    };

    connectSse();

    // Page Visibility API handler: when user returns to tab, refresh data
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        onReconnectRef.current?.();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isDisposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopFallbackPolling();
      if (eventSource) {
        eventSource.removeEventListener('JOB_CREATED', handleIncomingEvent);
        eventSource.removeEventListener('JOB_UPDATED', handleIncomingEvent);
        eventSource.removeEventListener('JOB_DELETED', handleIncomingEvent);
        eventSource.removeEventListener('JOB_RUN_COMPLETED', handleIncomingEvent);
        eventSource.close();
        eventSource = null;
      }
    };
  }, [enabled, fallbackPollIntervalMs]);

  return {
    connectionMode,
    lastEventAt,
    reconnectCount,
  };
}
