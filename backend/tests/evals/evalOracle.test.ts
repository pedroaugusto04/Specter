import { describe, expect, it } from 'vitest';
import { checkInvariants, pickField, type InvariantOracle } from '../../src/evals/oracle.js';
import { EvalOutcome } from '../../src/evals/types.js';

describe('pickField', () => {
  it('resolves an exact alias (case-insensitive)', () => {
    expect(pickField({ Price: 42 }, 'price')).toBe(42);
  });

  it('resolves a partial alias match', () => {
    expect(pickField({ product_price: 99 }, 'price')).toBe(99);
  });

  it('returns undefined when nothing matches', () => {
    expect(pickField({ name: 'test' }, 'price', 'cost')).toBeUndefined();
  });

  it('returns undefined for undefined record', () => {
    expect(pickField(undefined, 'name')).toBeUndefined();
  });
});

describe('checkInvariants', () => {
  const oracle: InvariantOracle = {
    minRecords: 2,
    maxRecords: 5,
    fields: {
      title: { aliases: ['title', 'name'], kind: 'text' },
      price: { aliases: ['price', 'preco'], kind: 'number' },
      link: { aliases: ['link', 'url'], kind: 'url', optional: true },
    },
  };

  it('rejects unconverted numeric strings and error messages containing digits', () => {
    for (const price of ['error 404', '12.50', Infinity, NaN]) {
      expect(
        checkInvariants(
          [
            { title: 'A', price },
            { title: 'B', price },
          ],
          oracle
        ).outcome
      ).toBe(EvalOutcome.WrongValue);
    }
  });

  it('passes when all invariants hold', () => {
    const records = [
      { title: 'Widget A', price: 29.9, link: 'https://example.com/a' },
      { name: 'Widget B', preco: 49.9 },
    ];
    expect(checkInvariants(records, oracle)).toEqual({ outcome: EvalOutcome.Correct });
  });

  it('returns FALSE_EMPTY for zero records', () => {
    expect(checkInvariants([], oracle).outcome).toBe(EvalOutcome.FalseEmpty);
  });

  it('returns PARTIAL when below minRecords', () => {
    const records = [{ title: 'Only one', price: 10 }];
    expect(checkInvariants(records, oracle).outcome).toBe(EvalOutcome.Partial);
  });

  it('returns WRONG_VALUE when above maxRecords', () => {
    const records = Array.from({ length: 6 }, (_, i) => ({ title: `Item ${i}`, price: i }));
    expect(checkInvariants(records, oracle).outcome).toBe(EvalOutcome.WrongValue);
  });

  it('returns PARTIAL when a required field is missing from all records', () => {
    const records = [{ price: 10 }, { price: 20 }];
    // Neither has "title" or "name"
    expect(checkInvariants(records, oracle).outcome).toBe(EvalOutcome.Partial);
  });

  it('returns WRONG_VALUE when minValidRatio is not met', () => {
    const strictOracle: InvariantOracle = {
      minRecords: 2,
      fields: {
        name: { aliases: ['name'], kind: 'text' },
        value: { aliases: ['value'], kind: 'number' },
      },
      minValidRatio: 1.0,
    };
    const records = [
      { name: 'Valid', value: 42 },
      { name: 'Invalid', value: '' }, // empty string → invalid for 'number'
    ];
    expect(checkInvariants(records, strictOracle).outcome).toBe(EvalOutcome.WrongValue);
  });

  it('ignores optional fields when missing', () => {
    const records = [
      { title: 'No link', price: 10 },
      { title: 'Also no link', price: 20 },
    ];
    expect(checkInvariants(records, oracle).outcome).toBe(EvalOutcome.Correct);
  });
});
