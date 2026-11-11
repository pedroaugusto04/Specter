import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMEZONE,
  formatEmailDateTime,
  formatNotificationDateTime,
  resolveTimezone,
} from '../src/utils/dateFormatter.js';

describe('dateFormatter utility', () => {
  const sampleUtcDate = new Date('2026-11-02T15:30:00Z');

  describe('resolveTimezone', () => {
    it('returns valid IANA timezones intact', () => {
      expect(resolveTimezone('America/Sao_Paulo')).toBe('America/Sao_Paulo');
      expect(resolveTimezone('America/New_York')).toBe('America/New_York');
      expect(resolveTimezone('UTC')).toBe('UTC');
      expect(resolveTimezone('Europe/London')).toBe('Europe/London');
    });

    it('falls back to America/Sao_Paulo for empty, null, or undefined values', () => {
      expect(resolveTimezone(undefined)).toBe(DEFAULT_TIMEZONE);
      expect(resolveTimezone(null)).toBe(DEFAULT_TIMEZONE);
      expect(resolveTimezone('')).toBe(DEFAULT_TIMEZONE);
      expect(resolveTimezone('   ')).toBe(DEFAULT_TIMEZONE);
    });

    it('falls back to America/Sao_Paulo for invalid timezone identifiers', () => {
      expect(resolveTimezone('Not/A_Real_Timezone')).toBe(DEFAULT_TIMEZONE);
      expect(resolveTimezone('foobar')).toBe(DEFAULT_TIMEZONE);
    });
  });

  describe('formatNotificationDateTime', () => {
    it('formats date and time in America/Sao_Paulo by default (UTC-3)', () => {
      const formatted = formatNotificationDateTime(sampleUtcDate);
      expect(formatted).toContain('(America/Sao_Paulo)');
      // 15:30 UTC is 12:30 in America/Sao_Paulo
      expect(formatted).toMatch(/12:30:00/);
    });

    it('formats date and time in a specified custom timezone', () => {
      const formattedNy = formatNotificationDateTime(sampleUtcDate, 'America/New_York');
      expect(formattedNy).toContain('(America/New_York)');
      // 15:30 UTC is 10:30 in America/New_York (EST, UTC-5 in November)
      expect(formattedNy).toMatch(/10:30:00/);
    });

    it('falls back to America/Sao_Paulo when an invalid timezone is provided', () => {
      const formatted = formatNotificationDateTime(sampleUtcDate, 'Invalid/Zone');
      expect(formatted).toContain('(America/Sao_Paulo)');
      expect(formatted).toMatch(/12:30:00/);
    });

    it('handles ISO strings and Date instances identically', () => {
      const fromDate = formatNotificationDateTime(sampleUtcDate, 'UTC');
      const fromIso = formatNotificationDateTime(sampleUtcDate.toISOString(), 'UTC');
      expect(fromDate).toBe(fromIso);
    });
  });

  describe('formatEmailDateTime', () => {
    it('formats long date with time in the target timezone with fallback', () => {
      const formatted = formatEmailDateTime(sampleUtcDate, 'America/Sao_Paulo');
      expect(formatted).toContain('November 2, 2026');
      expect(formatted).toContain('12:30:00');
      expect(formatted).toContain('(America/Sao_Paulo)');
    });

    it('formats long date in custom timezone if provided', () => {
      const formatted = formatEmailDateTime(sampleUtcDate, 'Europe/London');
      expect(formatted).toContain('November 2, 2026');
      // 15:30 UTC is 15:30 GMT in November
      expect(formatted).toContain('3:30:00');
      expect(formatted).toContain('(Europe/London)');
    });

    it('falls back to America/Sao_Paulo when timezone is omitted', () => {
      const formatted = formatEmailDateTime(sampleUtcDate);
      expect(formatted).toContain('(America/Sao_Paulo)');
    });
  });
});
