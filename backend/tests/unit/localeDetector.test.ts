import { describe, expect, it } from 'vitest';
import { detectDocumentLocale, normalizeLocaleTag } from '../../src/utils/localeDetector.js';

describe('Locale Detector', () => {
  describe('normalizeLocaleTag', () => {
    it('normalizes valid BCP-47 language tags with region', () => {
      expect(normalizeLocaleTag('pt-br')).toBe('pt-BR');
      expect(normalizeLocaleTag('en-us')).toBe('en-US');
      expect(normalizeLocaleTag('en-gb')).toBe('en-GB');
      expect(normalizeLocaleTag('es-es')).toBe('es-ES');
    });

    it('converts underscores to hyphens (OpenGraph format)', () => {
      expect(normalizeLocaleTag('pt_BR')).toBe('pt-BR');
      expect(normalizeLocaleTag('en_US')).toBe('en-US');
      expect(normalizeLocaleTag('es_ES')).toBe('es-ES');
    });

    it('supplies regional defaults for single language codes', () => {
      expect(normalizeLocaleTag('pt')).toBe('pt-BR');
      expect(normalizeLocaleTag('en')).toBe('en-US');
      expect(normalizeLocaleTag('es')).toBe('es-ES');
      expect(normalizeLocaleTag('de')).toBe('de-DE');
      expect(normalizeLocaleTag('fr')).toBe('fr-FR');
    });

    it('returns undefined for invalid or empty inputs', () => {
      expect(normalizeLocaleTag('')).toBeUndefined();
      expect(normalizeLocaleTag('   ')).toBeUndefined();
      expect(normalizeLocaleTag(null)).toBeUndefined();
      expect(normalizeLocaleTag(undefined)).toBeUndefined();
      expect(normalizeLocaleTag('!@#$%')).toBeUndefined();
    });
  });

  describe('detectDocumentLocale', () => {
    it('extracts locale from <html lang="..."> tag', () => {
      const html = '<!DOCTYPE html><html lang="pt-BR"><head><title>Test</title></head><body>Hello</body></html>';
      expect(detectDocumentLocale({ html, url: 'https://example.com' })).toBe('pt-BR');
    });

    it('extracts locale from <html lang="en"> with default en-US', () => {
      const html = '<!DOCTYPE html><html lang="en"><head><title>Test</title></head><body>Hello</body></html>';
      expect(detectDocumentLocale({ html, url: 'https://example.com' })).toBe('en-US');
    });

    it('extracts locale from OpenGraph meta property', () => {
      const html = `<!DOCTYPE html><html><head><meta property="og:locale" content="pt_BR" /></head><body></body></html>`;
      expect(detectDocumentLocale({ html, url: 'https://example.com' })).toBe('pt-BR');
    });

    it('extracts locale from content-language meta tag', () => {
      const html = `<!DOCTYPE html><html><head><meta http-equiv="content-language" content="de-DE" /></head><body></body></html>`;
      expect(detectDocumentLocale({ html, url: 'https://example.com' })).toBe('de-DE');
    });

    it('detects Brazilian locale from R$ currency pattern when html lang is missing', () => {
      const html = `<!DOCTYPE html><html><body><div>Preço: R$ 160,07</div></body></html>`;
      expect(detectDocumentLocale({ html, url: 'https://example.com' })).toBe('pt-BR');
    });

    it('detects British locale from £ currency pattern', () => {
      const html = `<!DOCTYPE html><html><body><div>Price: £15.99</div></body></html>`;
      expect(detectDocumentLocale({ html, url: 'https://example.com' })).toBe('en-GB');
    });

    it('detects German/Euro locale from € currency pattern', () => {
      const html = `<!DOCTYPE html><html><body><div>Preis: 19,99 €</div></body></html>`;
      expect(detectDocumentLocale({ html, url: 'https://example.com' })).toBe('de-DE');
    });

    it('derives locale from URL ccTLD when HTML has no language markers', () => {
      expect(detectDocumentLocale({ html: '<html><body>Clean page</body></html>', url: 'https://lojamirante.com.br/produto/123' })).toBe('pt-BR');
      expect(detectDocumentLocale({ html: '<html><body>Clean page</body></html>', url: 'https://store.co.uk/item/1' })).toBe('en-GB');
      expect(detectDocumentLocale({ html: '<html><body>Clean page</body></html>', url: 'https://shop.de/item/1' })).toBe('de-DE');
    });

    it('falls back to en-US when no signals are found', () => {
      expect(detectDocumentLocale({ html: '<html><body>Clean page</body></html>', url: 'https://example.com' })).toBe('en-US');
      expect(detectDocumentLocale(null)).toBe('en-US');
      expect(detectDocumentLocale(undefined)).toBe('en-US');
    });
  });
});
