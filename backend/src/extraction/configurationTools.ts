import { ConfigurationToolKind } from './configurationConstants.js';
import {
  fitEvidenceText,
  truncateEvidence,
  EvidenceTruncationMarker,
} from './evidenceBudget.js';
import { env } from '../config/env.js';
import { extractJsonLdBlocks, shouldStripAttribute } from '../utils/htmlSanitizer.js';
import * as cheerio from 'cheerio';
import type { DocumentSession, DocumentSnapshot } from './contracts.js';
import type { ConfigurationTool } from './model.js';
import { discoverWithCapabilities } from './capabilities.js';
import { redactObject, redactText } from './evidence.js';
import { buildCompilerEvidence } from '../utils/compilerEvidence.js';

export function observationPacket(snapshot: DocumentSnapshot, limit: number) {
  const rawResponses = JSON.stringify(redactObject(snapshot.responses));
  const boundedResponses = truncateEvidence(
    rawResponses,
    Math.max(200, Math.floor(limit * 0.25)),
    ''
  );
  const content =
    'Observed responses: ' +
    boundedResponses +
    '\n' +
    buildCompilerEvidence(snapshot.html, limit);
  const buildRecord = (text: string) => ({
    url: redactText(snapshot.url),
    httpStatus: snapshot.httpStatus,
    transport: snapshot.transport,
    content: text,
    truncated: text.includes(EvidenceTruncationMarker),
  });
  const fitted = fitEvidenceText(content, limit, (text) => JSON.stringify(buildRecord(text)));
  return buildRecord(fitted);
}

export function observation(snapshot: DocumentSnapshot, limit: number): string {
  return JSON.stringify(observationPacket(snapshot, limit));
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
    const limit = Math.min(env.EXTRACTION_MAX_EVIDENCE, 25);
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
                  : ($(node).attr(tool.attribute) ?? ''),
              500
            ),
            attributes: redactObject(
              node.type === 'tag'
                ? Object.fromEntries(
                    Object.entries(node.attribs).filter(
                      ([key, value]) => !shouldStripAttribute(key, value)
                    )
                  )
                : {},
              0,
              500
            ),
          })),
      },
    };
  }
  if (tool.kind === ConfigurationToolKind.Structured) {
    return { snapshot, result: redactObject(extractJsonLdBlocks($)) };
  }
  return {
    snapshot,
    result: redactObject(
      snapshot.responses.filter((response) => response.url.includes(tool.urlPattern))
    ),
  };
}
