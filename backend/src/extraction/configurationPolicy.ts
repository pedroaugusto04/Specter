import type { ExtractionIntent } from './contracts.js';
import { canonicalJson } from '../utils/diffHasher.js';
import { MaxConsecutiveOperationRepeats } from './configurationConstants.js';

export function sameIntent(a: ExtractionIntent, b: ExtractionIntent): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
/** Tracks meaningful tool results, rather than unrelated document mutations. */
export class ConfigurationProgress {
  private operation = '';
  private state = '';
  private repeats = 0;
  observe(operation: unknown, state: unknown): boolean {
    const key = canonicalJson(operation);
    const value = canonicalJson(state);
    this.repeats = key === this.operation && value === this.state ? this.repeats + 1 : 0;
    this.operation = key;
    this.state = value;
    return this.repeats < MaxConsecutiveOperationRepeats;
  }
  reset(): void {
    this.operation = '';
    this.state = '';
    this.repeats = 0;
  }
}
