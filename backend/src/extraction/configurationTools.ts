import { ConfigurationToolKind } from './configurationConstants.js';
import { fitEvidenceText, EvidenceTruncationMarker } from './evidenceBudget.js';
import { env } from '../config/env.js';
import { shouldStripAttribute } from '../utils/htmlSanitizer.js';
import * as cheerio from 'cheerio';
import type { DocumentSession, DocumentSnapshot } from './contracts.js';
import type { ConfigurationTool } from './model.js';
import { discoverWithCapabilities } from './capabilities.js';
import { redactObject, redactText } from './evidence.js';
import { buildCompilerEvidence } from '../utils/compilerEvidence.js';

export function observation(snapshot: DocumentSnapshot, limit: number): string {
  const content =
    buildCompilerEvidence(snapshot.html, limit) +
    '\nObserved responses: ' +
    JSON.stringify(redactObject(snapshot.responses));
  const serialize = (text: string) =>
    JSON.stringify({
      url: redactText(snapshot.url),
      httpStatus: snapshot.httpStatus,
      transport: snapshot.transport,
      content: text,
      truncated: text.includes(EvidenceTruncationMarker),
    });
  return serialize(fitEvidenceText(content, limit, serialize));
}

export async function executeConfigurationTool(session: DocumentSession, tool: ConfigurationTool) {
  if (tool.kind === ConfigurationToolKind.Interact) {
    if (tool.action.kind === 'wait' && tool.action.condition.kind === 'field')
      throw new Error('Field waits require a compiled plan.');
    return {
      snapshot: await discoverWithCapabilities(session, tool.action),
      result: { interacted: true },
    };
  }
  if (tool.kind === ConfigurationToolKind.Inspect)
    return {
      snapshot: await discoverWithCapabilities(session, {
        kind: 'inspect',
        selector: tool.selector,
      }),
      result: { inspected: tool.selector },
    };
  const snapshot = await session.snapshot();
  const $ = cheerio.load(snapshot.html);
  if (tool.kind === ConfigurationToolKind.Query) {
    const nodes = $(tool.selector);
    const limit = env.EXTRACTION_MAX_EVIDENCE;
    return {
      snapshot,
      result: {
        count: nodes.length,
        truncated: nodes.length > limit,
        samples: nodes
          .slice(0, limit)
          .toArray()
          .map((node) => ({
            value: redactText(
              tool.attribute === 'text'
                ? $(node).text()
                : shouldStripAttribute(tool.attribute, $(node).attr(tool.attribute) ?? '')
                  ? '[REMOVED]'
                  : ($(node).attr(tool.attribute) ?? '')
            ),
            attributes: redactObject(
              node.type === 'tag'
                ? Object.fromEntries(
                    Object.entries(node.attribs).filter(
                      ([key, value]) => !shouldStripAttribute(key, value)
                    )
                  )
                : {}
            ),
          })),
      },
    };
  }
  if (tool.kind === ConfigurationToolKind.Structured) {
    const blocks: unknown[] = [];
    $('script[type="application/ld+json"]').each((_, node) => {
      try {
        blocks.push(JSON.parse($(node).html() ?? ''));
      } catch {
        /* malformed data is not evidence */
      }
    });
    return { snapshot, result: redactObject(blocks) };
  }
  return {
    snapshot,
    result: redactObject(
      snapshot.responses.filter((response) => response.url.includes(tool.urlPattern))
    ),
  };
}
