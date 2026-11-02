import type { DiffSummary } from '../../types/domain.js';
import type { ExtractedPayload } from '../../types/extractor.js';

export interface AlertPayload {
  to: string;
  subject: string;
  jobId: string;
  targetUrl: string;
  userPrompt?: string;
  detectedAt?: Date;
  diffSummary: DiffSummary;
  data: ExtractedPayload;
}

export interface INotificationProvider {
  readonly name: string;
  sendAlert(payload: AlertPayload): Promise<void>;
}
