import { z } from 'zod';
import { discoveryActionSchema, extractionPlanSchema } from '../types/extractionPlan.js';
import {
  ConfigurationDecisionKind as Decision,
  ConfigurationToolKind as Tool,
} from './configurationConstants.js';
const text = z.string().trim().min(1);
export const configurationToolSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal(Tool.Inspect), selector: text }).strict(),
  z.object({ kind: z.literal(Tool.Query), selector: text, attribute: text }).strict(),
  z.object({ kind: z.literal(Tool.Structured) }).strict(),
  z.object({ kind: z.literal(Tool.Responses), urlPattern: text }).strict(),
  z.object({ kind: z.literal(Tool.Interact), action: discoveryActionSchema }).strict(),
]);
// Envelope validation leaves candidate parsing to the pipeline, where even invalid
// plans must consume candidate budget. Model guidance uses the same domain schema.
const toolDecisionSchema = z
  .object({ kind: z.literal(Decision.Tool), tool: configurationToolSchema })
  .strict();
export const configurationDecisionSchema = z.discriminatedUnion('kind', [
  toolDecisionSchema,
  z.object({ kind: z.literal(Decision.Candidate), plan: z.unknown() }).strict(),
]);
export const modelConfigurationDecisionSchema = z.discriminatedUnion('kind', [
  toolDecisionSchema,
  z.object({ kind: z.literal(Decision.Candidate), plan: extractionPlanSchema }).strict(),
]);
export const semanticVerdictSchema = z
  .object({
    score: z.number().int().min(0).max(10),
    reasons: z.array(text).min(1),
    evidenceRefs: z.array(text).min(1),
  })
  .strict();
export type ConfigurationTool = z.infer<typeof configurationToolSchema>;
export type ConfigurationDecision = z.infer<typeof configurationDecisionSchema>;
export type SemanticVerdict = z.infer<typeof semanticVerdictSchema>;
