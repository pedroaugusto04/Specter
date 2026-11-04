import { DecryptionError } from '../src/errors/domainErrors.js';
import { describe, expect, it } from 'vitest';
import { extractDomainCandidates, normalizeDomain } from '../src/utils/urlNormalizer.js';
import { resolveSessionStorageState } from '../src/utils/sessionHelper.js';
import type { ISessionRepository } from '../src/repositories/sessionRepository.js';
import type { UserWebSessionEntity } from '../src/types/domain.js';

describe('Session domain behavior', () => {
  describe('normalizeDomain', () => {
    it('normalizes domains by removing protocols, paths, and ports', () => {
      expect(normalizeDomain('https://sub.domain.com:8080/path/test')).toBe('sub.domain.com');
      expect(normalizeDomain('http://example.org/')).toBe('example.org');
      expect(normalizeDomain('MYSTORE.COM')).toBe('mystore.com');
    });

    it('throws ValidationError for invalid or empty domains', () => {
      expect(() => normalizeDomain('')).toThrow();
      expect(() => normalizeDomain('invalid domain with space')).toThrow();
    });
  });

  describe('extractDomainCandidates', () => {
    it('extracts host and root domain candidates', () => {
      expect(extractDomainCandidates('https://app.dashboard.example.com/login')).toEqual([
        'app.dashboard.example.com',
        'example.com',
      ]);
      expect(extractDomainCandidates('example.com')).toEqual(['example.com']);
    });
  });

  describe('resolveSessionStorageState', () => {
    it('resolves storage state using candidate domain matching', async () => {
      const mockStorageState = {
        cookies: [
          {
            name: 'auth',
            value: '123',
            domain: 'example.com',
            path: '/',
            expires: -1,
            httpOnly: true,
            secure: true,
            sameSite: 'Lax' as const,
          },
        ],
        origins: [],
      };
      const mockRepo: ISessionRepository = {
        findByUserAndDomain: async (_userId, domain) => {
          if (domain === 'example.com') {
            return {
              id: 'sess-1',
              userId: 'user-1',
              domain: 'example.com',
              name: 'Example Session',
              storageState: mockStorageState,
              cookieCount: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          }
          return null;
        },
        listByUserId: async () => [],
        findById: async () => null,
        upsert: async () => ({}) as UserWebSessionEntity,
        delete: async () => true,
      };

      const resolved = await resolveSessionStorageState(
        mockRepo,
        'user-1',
        'https://example.com/products'
      );
      expect(resolved).toEqual(mockStorageState);

      const notFound = await resolveSessionStorageState(mockRepo, 'user-1', 'https://another.com');
      expect(notFound).toBeUndefined();
    });
  });
});

it('does not silently discard an undecryptable saved session', async () => {
  const repository = {
    findByUserAndDomain: async () => {
      throw new DecryptionError();
    },
  } as unknown as ISessionRepository;
  await expect(
    resolveSessionStorageState(repository, 'user', 'https://example.com')
  ).rejects.toBeInstanceOf(DecryptionError);
});
