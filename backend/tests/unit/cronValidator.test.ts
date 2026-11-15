import { describe, expect, it } from 'vitest';
import { jobInputSchema } from '../../src/routes/schemas.js';
import { validateCronFrequency } from '../../src/utils/cronValidator.js';

describe('Cron Schedule Validation & 15-Minute Minimum Floor', () => {
  it('accepts valid cron expressions with intervals >= 15 minutes', () => {
    expect(validateCronFrequency('*/15 * * * *').valid).toBe(true);
    expect(validateCronFrequency('*/30 * * * *').valid).toBe(true);
    expect(validateCronFrequency('0 * * * *').valid).toBe(true);
    expect(validateCronFrequency('0 */6 * * *').valid).toBe(true);
    expect(validateCronFrequency('0 9 * * 1-5').valid).toBe(true);
  });

  it('rejects cron expressions with intervals < 15 minutes', () => {
    expect(validateCronFrequency('* * * * *').valid).toBe(false);
    expect(validateCronFrequency('*/5 * * * *').valid).toBe(false);
    expect(validateCronFrequency('*/10 * * * *').valid).toBe(false);
    expect(validateCronFrequency('*/14 * * * *').valid).toBe(false);
    // Irregular comma list with a 5-minute gap between :00 and :05
    expect(validateCronFrequency('0,5,30 * * * *').valid).toBe(false);
  });

  it('rejects malformed or non-5-field cron expressions', () => {
    expect(validateCronFrequency('invalid cron').valid).toBe(false);
    expect(validateCronFrequency('* * *').valid).toBe(false);
    expect(validateCronFrequency('*/15 * * * * *').valid).toBe(false);
  });

  it('enforces the 15-minute floor inside jobInputSchema Zod validation', () => {
    const validJob = jobInputSchema.safeParse({
      url: 'https://example.com/pricing',
      userPrompt: 'Extract Pro plan pricing',
      notificationEmail: 'user@example.com',
      cronExpression: '*/15 * * * *',
    });
    expect(validJob.success).toBe(true);

    const tooFrequentJob = jobInputSchema.safeParse({
      url: 'https://example.com/pricing',
      userPrompt: 'Extract Pro plan pricing',
      notificationEmail: 'user@example.com',
      cronExpression: '*/5 * * * *',
    });
    expect(tooFrequentJob.success).toBe(false);
  });
});
