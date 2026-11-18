import { SourceKind } from './constants.js';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { DocumentSnapshot, ExecutionStrategy, Source } from './contracts.js';
import { getCheerioRoot, matchingResponses, readPath } from './conditions.js';
import { extractJsonLdBlocks } from '../utils/htmlSanitizer.js';
type RecordSelector = ExecutionStrategy['records'];

export interface SourceRecord {
  kind: Source['kind'];
  value: unknown;
}

export interface ISourceReader {
  select(snapshot: DocumentSnapshot, selector: RecordSelector): SourceRecord[];
  read(snapshot: DocumentSnapshot, source: Source, record: SourceRecord): unknown;
}

export class DomSourceReader implements ISourceReader {
  select(snapshot: DocumentSnapshot, selector: RecordSelector): SourceRecord[] {
    if (selector.kind !== SourceKind.Dom)
      throw new Error('DOM reader requires a DOM record selector.');
    const $ = getCheerioRoot(snapshot);
    return $(selector.selector)
      .toArray()
      .map((element) => ({ kind: SourceKind.Dom, value: $(element) }));
  }
  read(_snapshot: DocumentSnapshot, source: Source, record: SourceRecord): unknown {
    if (source.kind !== SourceKind.Dom || record.kind !== SourceKind.Dom)
      throw new Error('DOM source requires a matching record context.');
    const scope = record.value as cheerio.Cheerio<AnyNode>;
    let target = source.selector === ':scope' ? scope : scope.find(source.selector);
    if (target.length === 0 && (source.selector.startsWith('meta') || source.selector.startsWith('head'))) {
      const root = scope.parents().length ? scope.parents().last() : scope;
      target = root.find(source.selector);
    }
    const readSingle = (el: cheerio.Cheerio<AnyNode>) =>
      source.attribute === 'text' ? el.text() : el.attr(source.attribute);
    let raw: unknown;
    if (target.length <= 1) raw = readSingle(target);
    else {
      if (source.pattern) {
        try {
          const regex = new RegExp(source.pattern, 'u');
          const patternMatches = new Set<string>();
          for (let i = 0; i < target.length; i++) {
            const val = readSingle(target.eq(i))?.trim();
            if (val) {
              const m = val.match(regex);
              if (m) patternMatches.add(m[1] !== undefined ? m[1] : m[0]);
            }
          }
          if (patternMatches.size === 1) {
            return patternMatches.values().next().value;
          }
        } catch {
          // invalid regex falls through to standard ambiguity check
        }
      }
      const distinctValues = new Set<string>();
      for (let i = 0; i < target.length; i++) {
        const val = readSingle(target.eq(i))?.trim();
        if (val) distinctValues.add(val);
      }
      if (distinctValues.size > 1)
        throw new Error(
          `Ambiguous DOM field source: selector '${source.selector}' matched ${target.length} elements with ${distinctValues.size} distinct values. Scope the record or field selector to match a single element.`
        );
      raw = distinctValues.values().next().value;
    }
    if (typeof raw === 'string' && source.pattern) {
      try {
        const regex = new RegExp(source.pattern, 'u');
        const match = raw.match(regex);
        if (!match) return null;
        return match[1] !== undefined ? match[1] : match[0];
      } catch {
        return null;
      }
    }
    return raw;
  }
}
function typeName(type: string): string {
  return type.replace(/^https?:\/\/schema\.org\//, '').replace(/^schema:/, '');
}

export class JsonLdSourceReader implements ISourceReader {
  select(snapshot: DocumentSnapshot, selector: RecordSelector): SourceRecord[] {
    if (selector.kind !== SourceKind.JsonLd)
      throw new Error('JSON-LD reader requires an entity type.');
    const entities: SourceRecord[] = [];
    const visit = (value: unknown, depth = 0) => {
      if (depth > 32) throw new Error('Structured-data nesting limit exceeded.');
      if (Array.isArray(value)) {
        value.forEach((item) => visit(item, depth + 1));
        return;
      }
      if (!value || typeof value !== 'object') return;
      const node = value as Record<string, unknown>;
      if (
        [node['@type']]
          .flat()
          .some((type) => typeof type === 'string' && typeName(type) === typeName(selector.type))
      )
        entities.push({ kind: SourceKind.JsonLd, value: node });
      for (const key of ['@graph', '@included', 'mainEntity', 'itemListElement', 'item'])
        if (node[key]) visit(node[key], depth + 1);
    };
    for (const block of extractJsonLdBlocks(snapshot.html)) {
      visit(block);
    }
    const idMap = new Map<string, Record<string, unknown>>();
    const mergedEntities: SourceRecord[] = [];
    for (const entity of entities) {
      const node = entity.value as Record<string, unknown>;
      const id = typeof node['@id'] === 'string' && node['@id'].trim() ? node['@id'].trim() : null;
      if (id) {
        const existing = idMap.get(id);
        if (existing) {
          Object.assign(existing, node);
          continue;
        }
        idMap.set(id, node);
      }
      mergedEntities.push(entity);
    }
    return mergedEntities;
  }
  read(_snapshot: DocumentSnapshot, source: Source, record: SourceRecord): unknown {
    if (source.kind !== SourceKind.JsonLd || record.kind !== SourceKind.JsonLd)
      throw new Error('JSON-LD source requires a matching entity.');
    return readPath(record.value, source.path);
  }
}

export class ResponseSourceReader implements ISourceReader {
  select(snapshot: DocumentSnapshot, selector: RecordSelector): SourceRecord[] {
    if (selector.kind !== SourceKind.Response)
      throw new Error('Response reader requires a response selector.');
    const response = matchingResponses(snapshot, selector.match).at(-1);
    const found = response ? readPath(response.body, selector.path) : undefined;
    return found === null || found === undefined
      ? []
      : (Array.isArray(found) ? found : [found]).map((value) => ({
          kind: SourceKind.Response,
          value,
        }));
  }
  read(_snapshot: DocumentSnapshot, source: Source, record: SourceRecord): unknown {
    if (source.kind !== SourceKind.Response || record.kind !== SourceKind.Response)
      throw new Error('Response source requires a matching record.');
    return readPath(record.value, source.path);
  }
}

export type SourceReaders = Record<Source['kind'], ISourceReader>;

export function standardSourceReaders(): SourceReaders {
  return {
    dom: new DomSourceReader(),
    jsonld: new JsonLdSourceReader(),
    response: new ResponseSourceReader(),
  };
}
