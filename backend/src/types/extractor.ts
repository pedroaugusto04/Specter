export type ExtractedRecord = Record<string, string | number | boolean | null>;

export type ExtractedPayload =
  | ExtractedRecord
  | {
      items: ExtractedRecord[];
      count: number;
    };
