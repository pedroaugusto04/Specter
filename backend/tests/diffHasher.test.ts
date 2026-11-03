import { describe, expect, it } from 'vitest';
import {
  buildDiffSummary,
  computeNormalizedHash,
  normalizeForDiff,
} from '../src/utils/diffHasher.js';

describe('Normalized Diff Hashing & Diff Summary', () => {
  it('produces identical SHA-256 hashes regardless of object key ordering', () => {
    const payloadA = {
      price: '$ 199.90',
      title: 'Bluetooth Headphones',
      nested: {
        stock: true,
        category: 'Audio',
      },
    };

    const payloadB = {
      nested: {
        category: 'Audio',
        stock: true,
      },
      title: 'Bluetooth Headphones',
      price: '$ 199.90',
    };

    expect(computeNormalizedHash(payloadA)).toBe(computeNormalizedHash(payloadB));
  });

  it('strips volatile relative timestamps (EN & PT) and tracking query params before hashing', () => {
    const snapshot1 = {
      title: 'Software Engineer Role',
      subtitle: 'Posted 2 minutes ago - Remote',
      portugueseNote: 'Publicado há 2 minutos - Remoto',
      link: 'https://jobs.example.com/123?utm_source=feed&session_id=abc111',
      sessionId: 'volatile-session-1',
    };

    const snapshot2 = {
      title: 'Software Engineer Role',
      subtitle: 'Posted 45 minutes ago - Remote',
      portugueseNote: 'Publicado há 45 minutos - Remoto',
      link: 'https://jobs.example.com/123?utm_source=email&session_id=xyz999',
      sessionId: 'volatile-session-2',
    };

    expect(normalizeForDiff(snapshot1)).toEqual(normalizeForDiff(snapshot2));
    expect(computeNormalizedHash(snapshot1)).toBe(computeNormalizedHash(snapshot2));
  });

  it('normalizes SEO site branding suffixes and text casing to prevent false positive diffs', () => {
    const runA = {
      price: 944.1,
      title: 'smartphone samsung galaxy a07 256gb 8gb ram verde',
    };

    const runB = {
      price: 944.1,
      title: 'Smartphone Samsung Galaxy A07 256GB 8GB RAM Verde | Americanas',
    };

    expect(computeNormalizedHash(runA)).toBe(computeNormalizedHash(runB));

    const diff = buildDiffSummary(runA, runB);
    expect(diff.hasChanges).toBe(false);
    expect(diff.totalChanges).toBe(0);
    expect(diff.modified).toHaveLength(0);
  });

  it('produces a different hash when genuine business content changes', () => {
    const before = { title: 'PlayStation 5', price: '$ 499.00' };
    const after = { title: 'PlayStation 5', price: '$ 449.00' };

    expect(computeNormalizedHash(before)).not.toBe(computeNormalizedHash(after));
  });

  it('builds a structured diff summary identifying added, modified, and removed fields', () => {
    const previousData = {
      title: '27-inch Monitor',
      price: '$ 299.00',
      promoTag: 'Black Friday',
    };

    const currentData = {
      title: '27-inch Monitor',
      price: '$ 249.00',
      shipping: 'Free Shipping',
    };

    const diff = buildDiffSummary(previousData, currentData);

    expect(diff.hasChanges).toBe(true);
    expect(diff.totalChanges).toBe(3);
    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0]).toMatchObject({
      field: 'price',
      previousValue: '$ 299.00',
      currentValue: '$ 249.00',
    });
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]?.field).toBe('shipping');
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0]?.field).toBe('promoTag');
    expect(diff.summaryText).toContain('price');
    expect(diff.summaryHtml).toContain('<table');
  });
});
