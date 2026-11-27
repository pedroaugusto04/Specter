'use client';

import { getApiBaseUrl } from '@/lib/api';
import type {
  RealtimeEventDto as RealtimeEventPayload,
  RealtimeEventType,
} from '@specter/contracts';
import * as React from 'react';

export type { RealtimeEventPayload, RealtimeEventType };

export type ConnectionMode = 'realtime' | 'polling' | 'connecting' | 'disconnected';

export interface UseRealtimeEventsOptions {
  enabled?: boolean;
  onJobEvent?: (event: RealtimeEventPayload) => void;
  onReconnect?: () => void;
  fallbackPollIntervalMs?: number;
}

export interface UseRealtimeEventsResult {
  connectionMode: ConnectionMode;
}

const REALTIME_EVENT_TYPES: readonly RealtimeEventType[] = [
  'JOB_CREATED',
  'JOB_UPDATED',
  'JOB_DELETED',
  'JOB_RUN_COMPLETED',
  'JOB_COMPILATION_FAILED',
];

export function useRealtimeEvents({
  enabled = true,
  onJobEvent,
  onReconnect,
  fallbackPollIntervalMs = 45_000,
}: UseRealtimeEventsOptions): UseRealtimeEventsResult {
  const [connectionMode, setConnectionMode] = React.useState<ConnectionMode>('connecting');

  const onJobEventRef = React.useRef(onJobEvent);
  const onReconnectRef = React.useRef(onReconnect);

  React.useEffect(() => {
    onJobEventRef.current = onJobEvent;
  }, [onJobEvent]);

  React.useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  React.useEffect(() => {
    if (!enabled) {
      setConnectionMode('disconnected');
      return;
    }

    let eventSource: EventSource | null = null;
    let fallbackTimer: NodeJS.Timeout | null = null;
    let isDisposed = false;

    const startFallbackPolling = () => {
      if (fallbackTimer) return;
      fallbackTimer = setInterval(() => {
        if (document.visibilityState === 'hidden') return;
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
        onJobEventRef.current?.(payload);
      } catch {
        // Ignore malformed event payload
      }
    };

    const connectSse = () => {
      try {
        const url = `${getApiBaseUrl()}/api/events`;
        eventSource = new EventSource(url, { withCredentials: true });

        eventSource.onopen = () => {
          if (isDisposed) return;
          setConnectionMode('realtime');
          stopFallbackPolling();
          onReconnectRef.current?.();
        };

        for (const eventType of REALTIME_EVENT_TYPES) {
          eventSource.addEventListener(eventType, handleIncomingEvent);
        }

        eventSource.onerror = () => {
          if (isDisposed) return;
          setConnectionMode('polling');
          startFallbackPolling();
        };
      } catch {
        setConnectionMode('polling');
        startFallbackPolling();
      }
    };

    if (typeof EventSource === 'undefined') {
      setConnectionMode('polling');
      startFallbackPolling();
    } else {
      connectSse();
    }

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
        for (const eventType of REALTIME_EVENT_TYPES) {
          eventSource.removeEventListener(eventType, handleIncomingEvent);
        }
        eventSource.close();
        eventSource = null;
      }
    };
  }, [enabled, fallbackPollIntervalMs]);

  return { connectionMode };
}
