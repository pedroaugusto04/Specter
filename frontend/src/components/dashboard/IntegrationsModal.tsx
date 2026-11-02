'use client';

import * as React from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Key,
  Layers,
  Loader2,
  MessageSquare,
  Radio,
  Send,
  Webhook,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { api, type UserIntegrationsDto } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface IntegrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (integrations: UserIntegrationsDto) => void;
}

export function IntegrationsModal({ isOpen, onClose, onSaved }: IntegrationsModalProps) {
  const [activeTab, setActiveTab] = React.useState<'telegram' | 'webhook'>('telegram');
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  // Telegram state
  const [telegramEnabled, setTelegramEnabled] = React.useState(false);
  const [telegramChatId, setTelegramChatId] = React.useState('');
  const [telegramBotUsername, setTelegramBotUsername] = React.useState<string | null>(null);
  const [isTestingTelegram, setIsTestingTelegram] = React.useState(false);
  const [telegramTestStatus, setTelegramTestStatus] = React.useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  // Webhook state
  const [webhookEnabled, setWebhookEnabled] = React.useState(false);
  const [webhookUrl, setWebhookUrl] = React.useState('');
  const [webhookSecret, setWebhookSecret] = React.useState('');
  const [isTestingWebhook, setIsTestingWebhook] = React.useState(false);
  const [webhookTestStatus, setWebhookTestStatus] = React.useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  // Initial pristine snapshot for isDirty check
  const [initialData, setInitialData] = React.useState<UserIntegrationsDto | null>(null);

  const fetchIntegrations = React.useCallback(async () => {
    setIsLoading(true);
    setGlobalError(null);
    setSaveSuccess(false);
    setTelegramTestStatus(null);
    setWebhookTestStatus(null);

    try {
      const data = await api.getIntegrations();
      setInitialData(data);
      setTelegramEnabled(Boolean(data.telegramEnabled));
      setTelegramChatId(data.telegramChatId || '');
      setTelegramBotUsername(
        data.botUsername || process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || null
      );
      setWebhookEnabled(Boolean(data.webhookEnabled));
      setWebhookUrl(data.webhookUrl || '');
      setWebhookSecret(data.webhookSecret || '');
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to load integration settings.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (isOpen) {
      void fetchIntegrations();
    }
  }, [isOpen, fetchIntegrations]);

  const isDirty = React.useMemo(() => {
    if (!initialData) return false;
    return (
      telegramEnabled !== Boolean(initialData.telegramEnabled) ||
      telegramChatId !== (initialData.telegramChatId || '') ||
      webhookEnabled !== Boolean(initialData.webhookEnabled) ||
      webhookUrl !== (initialData.webhookUrl || '') ||
      webhookSecret !== (initialData.webhookSecret || '')
    );
  }, [
    initialData,
    telegramEnabled,
    telegramChatId,
    webhookEnabled,
    webhookUrl,
    webhookSecret,
  ]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setGlobalError(null);
    setSaveSuccess(false);

    try {
      const payload: Partial<UserIntegrationsDto> = {
        telegramEnabled,
        telegramChatId: telegramChatId.trim() || null,
        webhookEnabled,
        webhookUrl: webhookUrl.trim() || null,
        webhookSecret: webhookSecret.trim() || null,
      };

      const updated = await api.updateIntegrations(payload as any);
      setInitialData(updated);
      setSaveSuccess(true);
      onSaved?.(updated);
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to save integrations.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestTelegram = async () => {
    if (!telegramChatId.trim()) {
      setTelegramTestStatus({ ok: false, msg: 'Please provide a Telegram Chat ID first.' });
      return;
    }

    setIsTestingTelegram(true);
    setTelegramTestStatus(null);
    try {
      const res = await api.testTelegram({
        chatId: telegramChatId.trim(),
      });
      setTelegramTestStatus({ ok: true, msg: res?.message || 'Test message sent successfully!' });
    } catch (err) {
      setTelegramTestStatus({
        ok: false,
        msg: err instanceof Error ? err.message : 'Telegram test failed.',
      });
    } finally {
      setIsTestingTelegram(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl.trim()) {
      setWebhookTestStatus({ ok: false, msg: 'Please provide a Webhook URL first.' });
      return;
    }

    setIsTestingWebhook(true);
    setWebhookTestStatus(null);
    try {
      const res = await api.testWebhook({
        webhookUrl: webhookUrl.trim(),
        secret: webhookSecret.trim() || null,
      });
      setWebhookTestStatus({ ok: true, msg: res?.message || 'Webhook test event delivered!' });
    } catch (err) {
      setWebhookTestStatus({
        ok: false,
        msg: err instanceof Error ? err.message : 'Webhook delivery failed.',
      });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      isDirty={isDirty}
      maxWidthClass="max-w-xl sm:max-w-2xl"
      title={
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Radio className="h-4 w-4" />
          </div>
          <div>
            <span className="text-base font-semibold">Integrations & Webhooks</span>
          </div>
        </div>
      }
      description="Configure real-time delivery channels for scraping change alerts and self-healing events."
      confirmTitle="Discard Unsaved Changes?"
      confirmMessage="You have modified integration settings that have not been saved. Close without saving?"
    >
      <div className="space-y-6 pt-2">
        {/* Navigation Tabs */}
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/60 p-1 border border-border">
          <button
            type="button"
            onClick={() => setActiveTab('telegram')}
            className={cn(
              'flex items-center justify-center gap-2 rounded-md py-2 text-xs sm:text-sm font-medium transition-all duration-150',
              activeTab === 'telegram'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Send className="h-4 w-4 text-sky-500" />
            <span>Telegram Bot</span>
            {telegramEnabled && (
              <span className="h-2 w-2 rounded-full bg-emerald-500" title="Active" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('webhook')}
            className={cn(
              'flex items-center justify-center gap-2 rounded-md py-2 text-xs sm:text-sm font-medium transition-all duration-150',
              activeTab === 'webhook'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Webhook className="h-4 w-4 text-violet-500" />
            <span>Generic Webhook</span>
            {webhookEnabled && (
              <span className="h-2 w-2 rounded-full bg-emerald-500" title="Active" />
            )}
          </button>
        </div>

        {globalError && (
          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{globalError}</div>
          </div>
        )}

        {saveSuccess && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="font-medium">Integration settings saved successfully!</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mb-2" />
            <span className="text-xs">Loading integration settings...</span>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            {/* Telegram Tab */}
            {activeTab === 'telegram' && (
              <div className="space-y-5">
                {/* Enable Switch */}
                <div className="flex items-center justify-between rounded-lg border border-border bg-card/60 p-4">
                  <div className="space-y-0.5">
                    <label
                      htmlFor="telegram-toggle"
                      className="text-sm font-semibold text-foreground cursor-pointer"
                    >
                      Enable Telegram Alerts
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Receive formatted alerts with diff summaries directly on Telegram.
                    </p>
                  </div>
                  <input
                    id="telegram-toggle"
                    type="checkbox"
                    checked={telegramEnabled}
                    onChange={(e) => setTelegramEnabled(e.target.checked)}
                    className="h-5 w-5 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                  />
                </div>

                {/* Telegram Bot Instructions & Quick Link */}
                <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-sky-500 shrink-0" />
                      <span className="text-xs font-semibold text-foreground">
                        Como conectar o bot do Telegram
                      </span>
                    </div>
                    {telegramBotUsername && (
                      <a
                        href={`https://t.me/${telegramBotUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-500 hover:text-sky-400 hover:underline transition-colors"
                      >
                        <span>@{telegramBotUsername}</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside leading-relaxed">
                    <li>
                      {telegramBotUsername ? (
                        <span>
                          Abra o bot{' '}
                          <a
                            href={`https://t.me/${telegramBotUsername}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-foreground underline decoration-sky-500 underline-offset-2 hover:text-sky-400"
                          >
                            @{telegramBotUsername}
                          </a>{' '}
                          e clique em <strong className="text-foreground">Iniciar (/start)</strong>. O Telegram exige que você inicie a conversa antes de ele permitir que o bot envie mensagens.
                        </span>
                      ) : (
                        <span>
                          Abra o bot do Specter no Telegram e envie <strong className="text-foreground">/start</strong>. O Telegram proíbe bots de enviarem mensagens para quem nunca interagiu com eles.
                        </span>
                      )}
                    </li>
                    <li>
                      Descubra o seu <strong className="text-foreground">Chat ID</strong> (você pode verificar seu ID enviando uma mensagem para o{' '}
                      <a
                        href="https://t.me/userinfobot"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-foreground hover:underline inline-flex items-center gap-0.5"
                      >
                        @userinfobot
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                      ).
                    </li>
                    <li>
                      Cole o Chat ID no campo abaixo e clique em <strong className="text-foreground">Send Test Message</strong>.
                    </li>
                  </ol>

                  {telegramBotUsername && (
                    <div className="pt-1">
                      <a
                        href={`https://t.me/${telegramBotUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 w-full rounded-md border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 px-3 py-1.5 text-xs font-medium text-sky-500 transition-colors"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>Iniciar conversa com @{telegramBotUsername} no Telegram</span>
                        <ExternalLink className="h-3 w-3 ml-0.5" />
                      </a>
                    </div>
                  )}
                </div>

                {/* Chat ID Field */}
                <FormField
                  label="Telegram Chat ID"
                  hint="Your personal numeric Chat ID or channel username (e.g. 123456789 or @mychannel)."
                  required={telegramEnabled}
                >
                  <div className="relative">
                    <Input
                      placeholder="123456789"
                      value={telegramChatId}
                      onChange={(e) => {
                        setTelegramChatId(e.target.value);
                        setTelegramTestStatus(null);
                      }}
                      className="font-mono text-xs sm:text-sm pr-9"
                    />
                    <div
                      className="absolute right-3 top-2.5 text-muted-foreground"
                      title="Send /start to @userinfobot on Telegram to discover your Chat ID"
                    >
                      <HelpCircle className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {telegramBotUsername ? (
                      <>
                        Dica: Inicie em{' '}
                        <a
                          href={`https://t.me/${telegramBotUsername}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-foreground hover:underline"
                        >
                          @{telegramBotUsername}
                        </a>{' '}
                        e descubra seu Chat ID com{' '}
                        <a
                          href="https://t.me/userinfobot"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-foreground hover:underline"
                        >
                          @userinfobot
                        </a>.
                      </>
                    ) : (
                      <>
                        Dica: Envie <span className="font-mono text-foreground">/start</span> para o bot e descubra seu Chat ID com{' '}
                        <a
                          href="https://t.me/userinfobot"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-foreground hover:underline"
                        >
                          @userinfobot
                        </a>.
                      </>
                    )}
                  </p>
                </FormField>

                {/* Telegram Test Button & Status */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-border/60">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestTelegram}
                    disabled={isTestingTelegram || !telegramChatId.trim()}
                    className="text-xs h-8"
                  >
                    {isTestingTelegram ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        <span>Sending Test...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5 mr-1.5 text-sky-500" />
                        <span>Send Test Message</span>
                      </>
                    )}
                  </Button>

                  {telegramTestStatus && (
                    <div
                      className={cn(
                        'text-xs font-medium flex items-center gap-1.5',
                        telegramTestStatus.ok ? 'text-emerald-500' : 'text-destructive'
                      )}
                    >
                      {telegramTestStatus.ok ? (
                        <Check className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>{telegramTestStatus.msg}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Webhook Tab */}
            {activeTab === 'webhook' && (
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
                    onChange={(e) => setWebhookEnabled(e.target.checked)}
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
                    onChange={(e) => {
                      setWebhookUrl(e.target.value);
                      setWebhookTestStatus(null);
                    }}
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
                      placeholder="whsec_xxxxxxxxxxxxxxxx"
                      value={webhookSecret}
                      onChange={(e) => {
                        setWebhookSecret(e.target.value);
                        setWebhookTestStatus(null);
                      }}
                      className="font-mono text-xs sm:text-sm"
                    />
                  </div>
                </FormField>

                {/* Webhook Test Button & Status */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-border/60">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestWebhook}
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
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border">
              <Button type="button" variant="outline" onClick={onClose} className="h-9 text-xs">
                Close
              </Button>
              <Button
                type="submit"
                disabled={isSaving || !isDirty}
                className="h-9 px-4 text-xs font-medium"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
