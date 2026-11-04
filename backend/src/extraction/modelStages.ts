import { z } from 'zod';
import type { ConfigurationStages, IModelProvider, StageInput } from './model.js';
import {
  conditionSchema,
  executionStrategySchema,
  extractionIntentSchema,
  locatorSchema,
} from '../types/extractionPlan.js';
import { redactObject, redactText } from './evidence.js';
const discoverySchema = z
  .object({
    action: z
      .discriminatedUnion('kind', [
        z.object({ kind: z.literal('inspect'), selector: z.string().min(1) }).strict(),
        z.object({ kind: z.literal('click'), locator: locatorSchema }).strict(),
        z.object({ kind: z.literal('scroll'), selector: z.string().optional() }).strict(),
        z.object({ kind: z.literal('wait'), condition: conditionSchema }).strict(),
      ])
      .nullable(),
  })
  .strict();
const reviewSchema = z
  .object({
    score: z.number().int().min(0).max(10),
    reasons: z.array(z.string().min(1)).min(1),
    evidenceRefs: z.array(z.string().min(1)).min(1),
  })
  .strict();
const intentInstructions =
  'Interpret the request using observed evidence for field types and locale. Return {entity:string,mode:"single"|"collection",scope:"page"|"collection",fields:{english_snake_case:{description:string,type:"string"|"number"|"boolean"|"date"|"url",required:boolean,locale?:string,booleanValues?:{lowercase:boolean},normalizeVolatileText?:boolean}},identityFields:string[],filters:string[],triggerRules:[{field,operator,value}],triggerMatchMode:"all"|"any"}. Requested fields required. For numeric fields specify the locale supported by observed numeric notation; booleans need observed value mapping. When evidence does not support numeric/date/boolean conversion use string unless the request requires that type, in which case report an error. Include required supporting fields needed for identity and record filters, with descriptions explaining their role. Collections require stable identity. Default scope page. Operators: lt,lte,gt,gte,eq,neq,contains,not_contains,percentage_drop,percentage_increase,decreased,increased,changes. Preserve exact entity, filters and meaning. Unsupported requests return {error:string}.';
const discoveryInstructions =
  'Determine whether more evidence is needed to generate a stable execution strategy. Return {action:null} when sufficient. Otherwise {action:{kind:"inspect",selector:string}} or {action:{kind:"click",locator:{kind:"css",selector:string}|{kind:"role",role:string,name:string}}} or {action:{kind:"scroll",selector?:string}} or {action:{kind:"wait",condition:{kind:"exists",locator:{kind:"css",selector:string}}}}. Only observed content expansion and pagination. No submission, login, purchases or settings changes. Inspect missing sampled regions instead of assuming absence.';
const strategyInstructions =
  'Generate an execution strategy for the fixed intent. Optional setup:DiscoveryAction[] replays observed expansion/scroll/wait actions needed before extraction. Each DiscoveryAction uses the same click/scroll/inspect/wait shape as discovery; setup field waits are unsupported. Select browser transport if setup is necessary. Return {transport:"http"|"browser",document?:{frame?:CSS,shadow?:CSS},records:{kind:"dom",selector:CSS}|{kind:"jsonld",type:string}|{kind:"response",match:{urlPattern:literalUrlFragment,method?:string},path:(string|number)[]},fields:{fieldName:[{kind:"dom",selector:CSS,attribute:"text"|attributeName}|{kind:"jsonld"|"response",path:(string|number)[]}]},ready:Condition[],empty:Condition[],pagination?:{kind:"link"|"click"|"scroll",next?:Locator,scrollTarget?:CSS,end:Condition[]}}. Locator is {kind:"css",selector:CSS} or {kind:"role",role:string,name:string}. Condition is {kind:"exists"|"visible"|"absent"|"disabled",locator:Locator} or {kind:"attribute",locator:Locator,attribute:string,value?:string} or {kind:"field",field:string} or {kind:"response",match:{urlPattern:string,method?:string},path?:(string|number)[],equals?:string|number|boolean}. Full collection scope requires pagination and positive end conditions. Missing next alone is insufficient. A disabled control during loading is not terminal evidence; require loading to have ended and evidence of the final state. For UI empty/end markers that may remain hidden, require visibility, not mere DOM existence. Lists of conditions use ALL. Empty requires positive evidence. HTTP supports CSS/static data only. Dynamic content, responses, frames, shadow and interactions require browser. Sources relative to record; :scope refers to the DOM record itself. An optional associations object maps an id to {localField:string,foreignPath:(string|number)[],records:{kind:"jsonld",type:string}|{kind:"response",match:{urlPattern:string},path:(string|number)[]}}. A source may reference it through association:id. The required localField must come directly from the primary record source. Use only observed exact-key associations; zero or multiple foreign matches invalidate extraction. Do not mix collection sources without an explicit key association. A single entity must be unambiguous. Select exactly requested entities and honor filters. Optional filters:[{field,operator:"eq"|"neq"|"lt"|"lte"|"gt"|"gte"|"contains"|"not_contains",value:string|number|boolean}] applies declared intent filters deterministically after conversion. Filter fields must be declared and required in intent. No unsupported scope reduction.';
const semanticInstructions =
  'Review whether extracted records and their provenance satisfy the original request and fixed intent. Return {score:integer0to10,reasons:string[],evidenceRefs:string[]}. Score entity, field meaning, filters, identity and requested scope from 0 to 2 each, then sum. Reference observed field names or regions. A type-correct value from the wrong entity is a substantive error. Explain uncertainty. The score is a review rubric, not probabilistic confidence.';
function task(
  model: IModelProvider,
  input: StageInput,
  kind: 'intent' | 'discovery' | 'plan' | 'semantic',
  instructions: string,
  extra: unknown = {}
) {
  return model.generate({
    jobId: input.jobId,
    task: kind,
    timeoutMs: input.timeoutMs,
    instructions,
    evidence: JSON.stringify({
      userRequest: redactText(input.prompt, 10000),
      url: redactText(input.url),
      pageEvidence: redactText(input.evidence, input.evidence.length),
      context: redactObject(extra),
    }),
  });
}
/** Each stage can be replaced separately, even when they share the same model transport. */
export function createModelStages(model: IModelProvider): ConfigurationStages {
  return {
    interpreter: {
      interpret: async (input) =>
        extractionIntentSchema.parse(await task(model, input, 'intent', intentInstructions)),
    },
    discovery: {
      next: async (input, intent) =>
        discoverySchema.parse(
          await task(model, input, 'discovery', discoveryInstructions, { intent })
        ).action,
    },
    generator: {
      generate: async (input, intent, feedback) =>
        executionStrategySchema.parse(
          await task(model, input, 'plan', strategyInstructions, {
            intent,
            validationFeedback: feedback,
          })
        ),
    },
    reviewer: {
      review: async (input, intent, result) =>
        reviewSchema.parse(
          await task(model, input, 'semantic', semanticInstructions, { intent, result })
        ),
    },
  };
}
