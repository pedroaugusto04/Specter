const NetworkErrorName = { Abort: 'AbortError', Timeout: 'TimeoutError' } as const;
export function isTimeoutError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error.name === NetworkErrorName.Abort || error.name === NetworkErrorName.Timeout)
  );
}
