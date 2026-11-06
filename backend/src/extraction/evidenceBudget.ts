import { CompilerValidationError } from '../errors/domainErrors.js';
export const EvidenceTruncationMarker = '[EVIDENCE TRUNCATED]';
/** Fits escaped JSON/text exactly; metadata owned by serialize is never truncated. */
export function fitEvidenceText(
  value: string,
  limit: number,
  serialize: (text: string) => string
): string {
  if (serialize(value).length <= limit) return value;
  if (serialize(EvidenceTruncationMarker).length > limit)
    throw new CompilerValidationError(
      'Request and contract exceed the configuration input budget.'
    );
  let low = 0,
    high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (serialize(value.slice(0, mid) + EvidenceTruncationMarker).length <= limit) low = mid;
    else high = mid - 1;
  }
  return value.slice(0, low) + EvidenceTruncationMarker;
}
