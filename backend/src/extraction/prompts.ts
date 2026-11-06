/** Stage-specific rules; providers supply shared safety and output instructions. */
const sharedContract = `
Follow the exact JSON schema and use only its property names and kind values. Omit properties that do not apply to the chosen kind; do not invent aliases.
Use response, never network, for a response condition. A CSS locator has shape {"kind":"css","selector":".item"}. Choose selectors and URLs from observed evidence.
`;
const actionContract = `
Actions: inspect requires selector; click requires locator; scroll may have selector; wait requires condition.
Locators use css with selector, or role with role and name (optionally exact). Conditions exists, visible, absent and disabled require locator; attribute requires locator and attribute (optionally value); response requires match.urlPattern (optionally method, path, equals).
`;
export const intentInstructions = `
Interpret the request using page evidence. Preserve entity, field meanings, filters, and scope.
Use English snake_case field IDs and displayName in the user's language. observedLabel must be an exact observed page label; omit it when unknown. Requested fields are required; add supporting fields only for identity or filtering.
Use collection mode for multiple records, collection scope only for all records across pages, and stable identityFields for collections. Put requested filter descriptions in filters.
Choose field types by meaning and evidence. Numbers require an observed locale; booleans require observed true/false mappings. Use string when the evidence cannot establish the type.
`;

export const discoveryInstructions = `
Return a null action when evidence is sufficient; otherwise choose one observed inspect/click/scroll/wait action. Inspect sampled regions before concluding content is absent. Reveal or inspect content only, including pagination; never submit forms, log in, purchase, or change settings.
${sharedContract}${actionContract}
`;

export const strategyInstructions = `
Generate a strategy for the fixed intent. Keep exactly intent.fields keys; map them to observed data by meaning and entity context, regardless of page language or label wording. Preserve filters and scope.
${sharedContract}${actionContract}
Readiness, empty and pagination end conditions may also use field with a field name; setup waits cannot.
Records use kind dom with selector, jsonld with type, or response with match and path. Field sources use kind dom with selector and attribute, jsonld with path, or response with path; any source may include association. Never use css or locator as a source or records kind.
Example DOM record: {"kind":"dom","selector":".item"}; example DOM field source: {"kind":"dom","selector":".price","attribute":"text"}.
Use setup only to replay necessary content expansion; setup field waits are unsupported. Use browser for dynamic content, setup, responses, frames, or shadow DOM; use HTTP for static CSS-accessible content.
Sources are relative to their record (:scope). A single-entity request must select one unambiguous record; each DOM field selector must match at most one element per record. Read DOM text with attribute: "text". Paths are segment arrays; condition arrays require ALL entries.
For collection scope, paginate with positive end evidence. A missing next control or a control disabled during loading is insufficient. Empty results also need positive evidence. ready must establish that extraction can proceed; use visible checks for markers that may be hidden.
Associations require observed exact key matches: localField must be required and directly sourced from the primary record; match exactly one foreign record. Never mix collections without an explicit association.
Apply filters after conversion; declare their fields as required.
Use validation feedback to correct failed sources or readiness based on observed raw values and reasons. Preserve expected field keys and do not repeat a rejected strategy unchanged.
`;

export const semanticInstructions = `
Check data and provenance against the request and fixed intent. Score entity, field meaning, filters, identity, and scope from 0 to 2 each. Cite evidence in reasons and evidenceRefs; explain uncertainty. A value from the wrong entity is a substantive error.
`;
