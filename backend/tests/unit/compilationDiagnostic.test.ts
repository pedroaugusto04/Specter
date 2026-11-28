import { describe, expect, it, vi } from 'vitest';
import { CompilationDiagnosticService } from '../../src/services/compilationDiagnosticService.js';
import type { IModelProvider } from '../../src/extraction/model.js';

describe('CompilationDiagnosticService', () => {
  it('successfully parses valid diagnostic output', async () => {
    const mockModel: IModelProvider = {
      name: 'mock-compiler',
      generate: vi.fn().mockResolvedValue({
        issue: 'The requested price only appears after selecting a size on the page.',
        nextSteps:
          'Please navigate directly to the specific variant URL and update the monitor address.',
      }),
    };

    const service = new CompilationDiagnosticService(mockModel);
    const result = await service.diagnose({
      jobId: 'job-123',
      url: 'https://example.com/shoes',
      userPrompt: 'track shoe price',
      failureReason: 'Candidate plan validation failed: no price found',
    });

    expect(result).not.toBeNull();
    expect(result?.issue).toBe(
      'The requested price only appears after selecting a size on the page.'
    );
    expect(result?.nextSteps).toBe(
      'Please navigate directly to the specific variant URL and update the monitor address.'
    );
  });

  it('returns null when model output does not match expected schema', async () => {
    const mockModel: IModelProvider = {
      name: 'mock-compiler',
      generate: vi.fn().mockResolvedValue({
        unexpectedField: 'invalid response',
      }),
    };

    const service = new CompilationDiagnosticService(mockModel);
    const result = await service.diagnose({
      jobId: 'job-123',
      url: 'https://example.com/shoes',
      userPrompt: 'track shoe price',
    });

    expect(result).toBeNull();
  });

  it('returns null gracefully when model call throws or times out', async () => {
    const mockModel: IModelProvider = {
      name: 'mock-compiler',
      generate: vi.fn().mockRejectedValue(new Error('Model API timed out')),
    };

    const service = new CompilationDiagnosticService(mockModel);
    const result = await service.diagnose({
      jobId: 'job-123',
      url: 'https://example.com/shoes',
      userPrompt: 'track shoe price',
    });

    expect(result).toBeNull();
  });

  it('rejects diagnostic output containing markdown code blocks', async () => {
    const mockModel: IModelProvider = {
      name: 'mock-compiler',
      generate: vi.fn().mockResolvedValue({
        issue: 'Setup failed due to ```bash\ncat /etc/passwd\n```',
        nextSteps: 'Try again later.',
      }),
    };
    const service = new CompilationDiagnosticService(mockModel);
    const result = await service.diagnose({
      jobId: 'job-123',
      url: 'https://example.com/shoes',
      userPrompt: 'track shoe price',
    });
    expect(result).toBeNull();
  });

  it('rejects overly long responses and redacts/bounds oversized inputs', async () => {
    const generate = vi.fn().mockResolvedValue({
      issue: 'a'.repeat(501),
      nextSteps: 'Please update the monitor URL.',
    });
    const service = new CompilationDiagnosticService({ name: 'mock-compiler', generate });
    const result = await service.diagnose({
      jobId: 'job-123',
      url: 'https://example.com/shoes?token=secret-value-123',
      userPrompt: 'x'.repeat(3000),
      failureReason: 'y'.repeat(3000),
    });

    expect(result).toBeNull();
    const firstCall = generate.mock.calls[0];
    expect(firstCall).toBeDefined();
    const evidenceArg = JSON.parse(firstCall![0].evidence) as {
      userPrompt: string;
      pageUrl: string;
      failureContext: string;
    };
    expect(evidenceArg.pageUrl).toContain('token=[REDACTED]');
    expect(evidenceArg.userPrompt.length).toBeLessThanOrEqual(2000);
    expect(evidenceArg.failureContext.length).toBeLessThanOrEqual(2000);
  });
});
