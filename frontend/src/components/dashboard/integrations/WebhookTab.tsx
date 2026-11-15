'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { AlertCircle, Check, Loader2, Webhook } from 'lucide-react';

export interface WebhookTabProps {
  webhookEnabled: boolean;
  onWebhookEnabledChange: (enabled: boolean) => void;
  webhookUrl: string;
  onWebhookUrlChange: (url: string) => void;
  webhookSecret: string;
  onWebhookSecretChange: (secret: string) => void;
  clearWebhookSecret: boolean;
  onClearWebhookSecretChange: (clear: boolean) => void;
  hasConfiguredSecret?: boolean;
  onTestWebhook: () => Promise<void>;
  isTestingWebhook: boolean;
  webhookTestStatus: { ok: boolean; msg: string } | null;
}

export function WebhookTab({
  webhookEnabled,
  onWebhookEnabledChange,
  webhookUrl,
  onWebhookUrlChange,
  webhookSecret,
  onWebhookSecretChange,
  clearWebhookSecret,
  onClearWebhookSecretChange,
  hasConfiguredSecret = false,
  onTestWebhook,
  isTestingWebhook,
  webhookTestStatus,
}: WebhookTabProps) {
  return (
    <div className="space-y-5">
      {/* Enable Switch */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card/60 p-4">
        <div className="space-y-0.5">
          <label
            htmlFor="webhook-toggle"
            className="text-sm font-semibold text-foreground cursor-pointer"
          >
            Enable Global Webhook
          </label>
          <p className="text-xs text-muted-foreground">
            Dispatches HTTP POST payloads to your endpoint for all monitor changes.
          </p>
        </div>
        <input
          id="webhook-toggle"
          type="checkbox"
          checked={webhookEnabled}
          onChange={(e) => onWebhookEnabledChange(e.target.checked)}
          className="h-5 w-5 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
        />
      </div>

      {/* Webhook URL Field */}
      <FormField
        label="Webhook Endpoint URL"
        hint="Public HTTPS URL that accepts POST requests (e.g. n8n, Make, Zapier, or custom API)."
        required={webhookEnabled}
      >
        <Input
          placeholder="https://your-domain.com/api/webhook"
          value={webhookUrl}
          onChange={(e) => onWebhookUrlChange(e.target.value)}
          className="font-mono text-xs sm:text-sm"
        />
      </FormField>

      {/* Secret Signature Field */}
      <FormField
        label="Signing Secret (Optional HMAC-SHA256)"
        hint="When configured, payloads are signed with header X-Specter-Signature-256 for integrity verification."
      >
        <div className="relative">
          <Input
            type="password"
            placeholder={
              hasConfiguredSecret
                ? 'Secret configured; leave blank to keep it'
                : 'whsec_xxxxxxxxxxxxxxxx'
            }
            value={webhookSecret}
            onChange={(e) => onWebhookSecretChange(e.target.value)}
            className="font-mono text-xs sm:text-sm"
          />
        </div>
      </FormField>

      {hasConfiguredSecret && (
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={clearWebhookSecret}
            onChange={(event) => onClearWebhookSecretChange(event.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
          />
          Remove the configured signing secret
        </label>
      )}

      {/* Webhook Test Button & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-border/60">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onTestWebhook}
          disabled={isTestingWebhook || !webhookUrl.trim()}
          className="text-xs h-8"
        >
          {isTestingWebhook ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              <span>Pinging Endpoint...</span>
            </>
          ) : (
            <>
              <Webhook className="h-3.5 w-3.5 mr-1.5 text-violet-500" />
              <span>Send Test Event</span>
            </>
          )}
        </Button>

        {webhookTestStatus && (
          <div
            className={cn(
              'text-xs font-medium flex items-center gap-1.5',
              webhookTestStatus.ok ? 'text-emerald-500' : 'text-destructive'
            )}
          >
            {webhookTestStatus.ok ? (
              <Check className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>{webhookTestStatus.msg}</span>
          </div>
        )}
      </div>
    </div>
  );
}
