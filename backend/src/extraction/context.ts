import { NavigationTimeoutError } from '../errors/domainErrors.js';
import { randomUUID } from 'node:crypto';
import type { ExecutionContext, ExecutionPolicy } from './contracts.js';

export function createExecutionContext(timeoutMs: number, signal?: AbortSignal): ExecutionContext {
  const deadline = Date.now() + timeoutMs;
  const timeout = AbortSignal.timeout(Math.max(1, Math.ceil(timeoutMs)));
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  return {
    runId: randomUUID(),
    deadline,
    signal: combined,
    remaining: () => Math.max(0, deadline - Date.now()),
    check() {
      if (combined.aborted)
        throw new NavigationTimeoutError(
          combined.reason instanceof Error ? combined.reason.message : 'Execution cancelled.',
          combined.reason
        );
      if (Date.now() >= deadline) throw new NavigationTimeoutError('Execution deadline exhausted.');
    },
  };
}
export async function waitForPoll(
  context: ExecutionContext,
  policy: ExecutionPolicy
): Promise<void> {
  context.check();
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      context.signal.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(finish, Math.min(policy.pollIntervalMs, context.remaining()));
    const abort = () => {
      clearTimeout(timer);
      reject(context.signal.reason);
    };
    context.signal.addEventListener('abort', abort, { once: true });
  });
}
