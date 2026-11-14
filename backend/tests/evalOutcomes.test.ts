import { describe, expect, it } from 'vitest';
import {
  classifyEvalError,
  verdictFromQuality,
} from '../src/evals/outcomes.js';
import { EvalOutcome } from '../src/evals/types.js';
import {
  AntiBotBlockedError,
  BrowserCapacityError,
  CompilerApiRequestError,
  CompilerTimeoutError,
  CompilerValidationError,
  NavigationTimeoutError,
} from '../src/errors/domainErrors.js';
import { ConfigurationFailure } from '../src/extraction/configurationFailure.js';

describe('classifyEvalError', () => {
  it('classifies AntiBotBlockedError as BLOCKED', () => {
    const verdict = classifyEvalError(new AntiBotBlockedError('WAF detected'));
    expect(verdict.outcome).toBe(EvalOutcome.Blocked);
    expect(verdict.errorCode).toBe('ANTI_BOT_BLOCKED');
  });

  it('classifies NavigationTimeoutError as TIMEOUT', () => {
    const verdict = classifyEvalError(new NavigationTimeoutError('30s exceeded'));
    expect(verdict.outcome).toBe(EvalOutcome.Timeout);
  });

  it('classifies CompilerTimeoutError as MODEL_ERROR', () => {
    const verdict = classifyEvalError(new CompilerTimeoutError('CLI hung'));
    expect(verdict.outcome).toBe(EvalOutcome.ModelError);
  });

  it('classifies CompilerApiRequestError as MODEL_ERROR', () => {
    const verdict = classifyEvalError(new CompilerApiRequestError(500));
    expect(verdict.outcome).toBe(EvalOutcome.ModelError);
  });

  it('classifies CompilerValidationError as MODEL_ERROR', () => {
    const verdict = classifyEvalError(new CompilerValidationError('Invalid schema'));
    expect(verdict.outcome).toBe(EvalOutcome.ModelError);
  });

  it('classifies BrowserCapacityError as INFRA', () => {
    const verdict = classifyEvalError(new BrowserCapacityError());
    expect(verdict.outcome).toBe(EvalOutcome.Infra);
  });

  it('classifies ConfigurationFailure without semantic rejection as NO_VALID_PLAN', () => {
    const verdict = classifyEvalError(
      new ConfigurationFailure('Budget exceeded', [])
    );
    expect(verdict.outcome).toBe(EvalOutcome.NoValidPlan);
  });

  it('classifies ConfigurationFailure with semantic rejection', () => {
    const verdict = classifyEvalError(
      new ConfigurationFailure('Rejected by semantic review', [], {
        status: 'REJECTED',
        score: 2,
        reasons: ['bad'],
        evidenceRefs: [],
      })
    );
    expect(verdict.outcome).toBe(EvalOutcome.SemanticRejected);
  });

  it('classifies unknown Error as ERROR', () => {
    const verdict = classifyEvalError(new Error('something unexpected'));
    expect(verdict.outcome).toBe(EvalOutcome.Error);
  });
});

describe('verdictFromQuality', () => {
  it('returns undefined for COMPLETE', () => {
    expect(verdictFromQuality('COMPLETE')).toBeUndefined();
  });

  it('returns BLOCKED for BLOCKED quality', () => {
    expect(verdictFromQuality('BLOCKED')?.outcome).toBe(EvalOutcome.Blocked);
  });

  it('returns FALSE_EMPTY for EMPTY quality', () => {
    expect(verdictFromQuality('EMPTY')?.outcome).toBe(EvalOutcome.FalseEmpty);
  });

  it('returns PARTIAL for PARTIAL quality', () => {
    expect(verdictFromQuality('PARTIAL')?.outcome).toBe(EvalOutcome.Partial);
  });
});
