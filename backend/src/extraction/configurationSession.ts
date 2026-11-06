import type {
  DocumentAdapter,
  DocumentSession,
  DiscoveryAction,
  ExecutionContext,
  DocumentSnapshot,
} from './contracts.js';
import type { ConfigurationRequest } from './configuration.js';
import type { ConfigurationTool } from './configurationSchemas.js';
import { ConfigurationStage, ConfigurationToolKind } from './configurationConstants.js';
import { discoverWithCapabilities } from './capabilities.js';
import { executeConfigurationTool } from './configurationTools.js';

export type RunConfigurationOperation = <T>(stage: string, action: () => Promise<T>) => Promise<T>;

/** Owns acquisition, replay and browser lifecycle; candidates always execute elsewhere. */
export class ConfigurationSession {
  private session?: DocumentSession;
  private readonly actions: DiscoveryAction[] = [];
  constructor(
    private readonly adapter: DocumentAdapter,
    private readonly request: ConfigurationRequest,
    private readonly context: ExecutionContext,
    private readonly run: RunConfigurationOperation
  ) {}

  private async open(): Promise<DocumentSession> {
    if (!this.session) {
      this.session = await this.run(ConfigurationStage.Acquisition, () =>
        this.adapter.open(this.request.url, {}, this.context, {
          storageState: this.request.storageState,
        })
      );
      for (const action of this.actions) {
        this.context.check();
        await discoverWithCapabilities(this.session, action);
      }
    }
    return this.session;
  }
  async snapshot(): Promise<DocumentSnapshot> {
    return (await this.open()).snapshot();
  }
  async execute(tool: ConfigurationTool) {
    const session = await this.open();
    const result = await executeConfigurationTool(session, tool);
    if (tool.kind === ConfigurationToolKind.Interact) this.actions.push(tool.action);
    return result;
  }
  async close(): Promise<void> {
    const session = this.session;
    this.session = undefined;
    await session?.close();
  }
}
