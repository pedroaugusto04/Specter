import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { DocumentSnapshot, ExecutionStrategy, Source } from './contracts.js';
import { matchingResponses, readPath } from './conditions.js';
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
    if (selector.kind !== 'dom') throw new Error('DOM reader requires a DOM record selector.');
    const $ = cheerio.load(snapshot.html);
    return $(selector.selector)
      .toArray()
      .map((element) => ({ kind: 'dom', value: $(element) }));
  }
  read(_snapshot: DocumentSnapshot, source: Source, record: SourceRecord): unknown {
    if (source.kind !== 'dom' || record.kind !== 'dom')
      throw new Error('DOM source requires a matching record context.');
    const scope = record.value as cheerio.Cheerio<AnyNode>;
    const target = source.selector === ':scope' ? scope : scope.find(source.selector);
    if (target.length > 1) throw new Error('Ambiguous DOM field source.');
    return source.attribute === 'text' ? target.text() : target.attr(source.attribute);
  }
}
function typeName(type: string): string {
  return type.replace(/^https?:\/\/schema\.org\//, '').replace(/^schema:/, '');
}
export class JsonLdSourceReader implements ISourceReader {
  select(snapshot: DocumentSnapshot, selector: RecordSelector): SourceRecord[] {
    if (selector.kind !== 'jsonld') throw new Error('JSON-LD reader requires an entity type.');
    const $ = cheerio.load(snapshot.html);
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
        entities.push({ kind: 'jsonld', value: node });
      for (const key of ['@graph', '@included', 'mainEntity', 'itemListElement', 'item'])
        if (node[key]) visit(node[key], depth + 1);
    };
    $('script[type="application/ld+json"]').each((_, element) => {
      let data: unknown;
      try {
        data = JSON.parse($(element).html() ?? '');
      } catch {
        return;
      }
      visit(data);
    });
    return entities;
  }
  read(_snapshot: DocumentSnapshot, source: Source, record: SourceRecord): unknown {
    if (source.kind !== 'jsonld' || record.kind !== 'jsonld')
      throw new Error('JSON-LD source requires a matching entity.');
    return readPath(record.value, source.path);
  }
}
export class ResponseSourceReader implements ISourceReader {
  select(snapshot: DocumentSnapshot, selector: RecordSelector): SourceRecord[] {
    if (selector.kind !== 'response')
      throw new Error('Response reader requires a response selector.');
    const response = matchingResponses(snapshot, selector.match).at(-1);
    const found = response ? readPath(response.body, selector.path) : undefined;
    return found === null || found === undefined
      ? []
      : (Array.isArray(found) ? found : [found]).map((value) => ({ kind: 'response', value }));
  }
  read(_snapshot: DocumentSnapshot, source: Source, record: SourceRecord): unknown {
    if (source.kind !== 'response' || record.kind !== 'response')
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
