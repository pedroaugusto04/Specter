export interface FieldExtractor {
  selector: string;
  attribute?: 'text' | 'href' | 'src' | string;
  type?: 'string' | 'number' | 'boolean';
}

export type ExtractorFieldDefinition = string | FieldExtractor;

export interface ExtractorSchema {
  containerSelector?: string;
  fields: Record<string, ExtractorFieldDefinition>;
  paginationSelector?: string;
}

/**
 * Alias matching the implementation guide naming (`ExtractorConfig`)
 * while preserving the `ExtractorSchema` contract in AGENTS.md.
 */
export type ExtractorConfig = ExtractorSchema;

export type ExtractedRecord = Record<string, string | number | boolean | null>;

export type ExtractedPayload =
  | ExtractedRecord
  | {
      items: ExtractedRecord[];
      count: number;
    };
