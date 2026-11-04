/** Trusted stage instructions; page content is supplied separately as evidence. */
export const intentInstructions = `
Interpret the request using page evidence. Return an intent with entity, mode, scope, fields, identityFields, filters, triggerRules, and triggerMatchMode.
Each field has {displayName, observedLabel?, description, type, required, locale?, booleanValues?, normalizeVolatileText?}; type is string|number|boolean|date|url.
Use stable English snake_case field keys as internal IDs. displayName should match the user's language; observedLabel should preserve a matching label actually seen on the page, and be omitted if none was seen. Describe the requested meaning so it can be matched across languages. Never treat a page label as the internal ID.
Requested fields are required. Add supporting fields only when needed for identity or filters, and explain their role. Collections require stable identity; default scope is page. For numbers, specify locale from observed notation; booleans require observed value mappings. Use string when evidence cannot support conversion, unless the request requires another type, then report an error. Preserve the requested entity, filters, and meaning. Unsupported requests return {error:string}.
Trigger operators: lt,lte,gt,gte,eq,neq,contains,not_contains,percentage_drop,percentage_increase,decreased,increased,changes. triggerMatchMode is all|any.
`;

export const discoveryInstructions = `
Decide whether more page evidence is needed for a reliable strategy. Return {action:null} when sufficient; otherwise one observed inspect, click, scroll, or wait action. Inspect sampled regions before assuming content is absent. Use actions only to reveal or inspect content, including pagination; never submit forms, log in, purchase, or change settings.
Action shapes: {kind:"inspect",selector}, {kind:"click",locator}, {kind:"scroll",selector?}, or {kind:"wait",condition}. Locator is {kind:"css",selector} or {kind:"role",role,name}; wait supports an exists condition with a CSS locator.
`;

export const strategyInstructions = `
Generate an execution strategy for the fixed intent. Return exactly the intent.fields keys in strategy.fields, unchanged. They are internal IDs; use displayName, observedLabel, description, request, and evidence to map each ID to page data in any language. Example: key price with displayName "Preço" and page label "Precio" remains strategy.fields.price. Never rename, translate, add, or omit keys. Keep extracted data keyed by these IDs; the UI uses displayName.

Shape:
{transport:"http"|"browser", document?:{frame?,shadow?}, records:RecordSource, fields:Record<fieldId,Source[]>, ready:Condition[], empty:Condition[], setup?:Action[], filters?:RecordFilter[], associations?:Associations, pagination?:{kind:"link"|"click"|"scroll",next?:Locator,scrollTarget?,end:Condition[]}}
RecordSource is {kind:"dom",selector} | {kind:"jsonld",type} | {kind:"response",match:{urlPattern,method?},path}.
Source is {kind:"dom",selector,attribute:"text"|attributeName,association?} | {kind:"jsonld"|"response",path,association?}.
Locator is {kind:"css",selector} | {kind:"role",role,name}. Condition is exists|visible|absent|disabled with locator; attribute with locator, attribute, value?; field with field ID; or response with match, path?, equals?. Conditions are arrays of ALL requirements.
Action is an observed inspect/click/scroll/wait action. Use setup only to replay needed content expansion; setup field waits are unsupported. Use browser for setup, dynamic content, responses, frames, or shadow DOM. HTTP is for static CSS-accessible content.

Rules:
- Sources are relative to the selected record; :scope means that record. A single-entity request must select exactly one unambiguous record. Honor the requested entity, filters, and scope; never silently reduce scope.
- When intent.scope is collection, intent.mode must be collection and pagination must include positive end evidence. A missing next control alone is not end evidence. A disabled control during loading is not terminal; require loading to finish and final-state evidence. Empty results also require positive evidence. Use visible checks for UI markers that may be hidden. ready conditions must positively establish that extraction can proceed.
- Use associations only when observed evidence supports an exact key match: {id:{localField,foreignPath,records:{kind:"jsonld",type}|{kind:"response",match:{urlPattern,method?},path}}}. localField must be required and sourced directly from the primary record. Each foreign record must match exactly once. Do not mix collection sources without an explicit association.
- Optional filters apply after field conversion and use {field,operator,value}; operator is eq|neq|lt|lte|gt|gte|contains|not_contains. Filter fields must be declared and required.
- If validation feedback names expected and actual keys, return the expected keys exactly and correct the strategy.
`;

export const semanticInstructions = `
Review whether extracted records and provenance satisfy the request and fixed intent. Return {score:integer 0..10,reasons:string[],evidenceRefs:string[]}.
Score entity, field meaning, filters, identity, and requested scope from 0 to 2 each, then sum. Cite observed fields or regions. A correct-looking value from the wrong entity is a substantive error. Explain uncertainty; the score is a rubric, not confidence.
`;
