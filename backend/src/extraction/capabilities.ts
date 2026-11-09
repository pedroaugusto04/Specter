import { UnsupportedCapabilityError } from '../errors/domainErrors.js';
import type {
  DocumentCapabilities,
  DocumentSession,
  DiscoveryAction,
  ExecutionStrategy,
} from './contracts.js';
/** Single capability rule shared by schema validation and acquisition selection. */
export function requiresBrowser(strategy: Partial<ExecutionStrategy>): boolean {
  const conditions = [
    ...(strategy.ready ?? []),
    ...(strategy.empty ?? []),
    ...(strategy.pagination?.end ?? []),
  ];
  return Boolean(
    strategy.setup?.length ||
    strategy.document ||
    strategy.records?.kind === 'response' ||
    Object.values(strategy.fields ?? {})
      .flat()
      .some((source) => source?.kind === 'response') ||
    Object.values(strategy.associations ?? {}).some((item) => item?.records?.kind === 'response') ||
    strategy.pagination?.kind === 'click' ||
    strategy.pagination?.kind === 'scroll' ||
    conditions.some(
      (item) =>
        item?.kind === 'visible' ||
        item?.kind === 'response' ||
        ('locator' in item && item.locator?.kind === 'role')
    )
  );
}

export const passiveCapabilities: DocumentCapabilities = Object.freeze({
  interactions: false,
  networkResponses: false,
  scopedDocuments: false,
});
export const browserCapabilities: DocumentCapabilities = Object.freeze({
  interactions: true,
  networkResponses: true,
  scopedDocuments: true,
});
export async function discoverWithCapabilities(session: DocumentSession, action: DiscoveryAction) {
  if (session.capabilities && !session.capabilities.interactions)
    throw new UnsupportedCapabilityError('The acquired document cannot perform discovery actions.');
  return session.discover(action);
}
