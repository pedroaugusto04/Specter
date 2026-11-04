export {
  JobStatus,
  RunStatus,
  ChangeStatus,
  TriggerMatchMode,
  ExtractionQuality,
  TriggerOperator,
  isAcceptedExtractionQuality,
} from '@specter/contracts';

export function parseEnumValue<const T extends Record<string, string>>(
  enumValues: T,
  value: string,
  fieldName: string
): T[keyof T] {
  if (!Object.values(enumValues).includes(value)) {
    throw new Error(`Unexpected ${fieldName} value: ${value}`);
  }
  return value as T[keyof T];
}
