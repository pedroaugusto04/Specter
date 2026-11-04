import { describe, expect, it } from 'vitest';
import {
  buildDiffSummary,
  computeExtractionHash,
  sanitizeVolatileString,
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

    expect(computeExtractionHash(payloadA)).toBe(computeExtractionHash(payloadB));
  });

  it('normalizes volatile text only when explicitly requested', () => {
    expect(sanitizeVolatileString('Posted 2 minutes ago - Remote')).toBe(
      sanitizeVolatileString('Posted 45 minutes ago - Remote')
    );
    expect(sanitizeVolatileString('Publicado há 2 minutos - Remoto')).toBe(
      sanitizeVolatileString('Publicado há 45 minutos - Remoto')
    );
    expect(computeExtractionHash({ timestamp: '2026-01-01' })).not.toBe(
      computeExtractionHash({ timestamp: '2026-01-02' })
    );
  });

  it('produces a different hash when genuine business content changes', () => {
    const before = { title: 'PlayStation 5', price: '$ 499.00' };
    const after = { title: 'PlayStation 5', price: '$ 449.00' };

    expect(computeExtractionHash(before)).not.toBe(computeExtractionHash(after));
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
