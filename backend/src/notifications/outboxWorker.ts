import { logger } from '../utils/logger.js';
import type { IAlertSender, IOutboxRepository } from './contracts.js';
import { redactText } from '../extraction/evidence.js';
export class OutboxWorker {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  constructor(
    private readonly repository: IOutboxRepository,
    private readonly sender: IAlertSender,
    private readonly maxAttempts: number,
    private readonly deliveryTimeoutMs = 30000
  ) {}
  start(): void {
    this.timer = setInterval(() => {
      void this.tick().catch((error) =>
        logger.error('Outbox processing failed', {
          error: redactText(error instanceof Error ? error.message : String(error)),
        })
      );
    }, 5000);
    void this.tick().catch((error) =>
      logger.error('Outbox processing failed', {
        error: redactText(error instanceof Error ? error.message : String(error)),
      })
    );
  }
  async tick(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.process().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  private async process(): Promise<void> {
    const batch = await this.repository.claim(10, this.maxAttempts);
    await Promise.all(
      batch.map(async (delivery) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            this.sender.deliver(delivery, delivery.id),
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(
                () => reject(new Error('Notification delivery timed out.')),
                this.deliveryTimeoutMs
              );
            }),
          ]);
          await this.repository.complete(delivery.id, delivery.claimToken);
        } catch (error) {
          await this.repository.fail(
            delivery.id,
            delivery.claimToken,
            redactText(error instanceof Error ? error.message : String(error)),
            this.maxAttempts
          );
        } finally {
          clearTimeout(timer);
        }
      })
    );
  }
  async close(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }
}
