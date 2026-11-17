import { ResponseTooLargeError } from '../errors/domainErrors.js';

/** Enforces the limit on decoded bytes while reading, including chunked/compressed responses. */
export async function readBoundedResponseText(
  response: Response,
  maxBytes: number
): Promise<string> {
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel();
    throw new ResponseTooLargeError();
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new ResponseTooLargeError();
      chunks.push(value);
    }
    return Buffer.concat(chunks, size).toString('utf8');
  } finally {
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
}
