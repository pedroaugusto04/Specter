'use client';

import * as React from 'react';
import {
  emptyIntegrationForm,
  formToIntegrations,
  formToWebhookTest,
  integrationsToForm,
  isIntegrationFormDirty,
  type IntegrationFormValues,
} from '@/forms/integrationForm';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useModal } from '@/components/ui/modal-dialog';
import {
  useDeleteSessionMutation,
  useIntegrationsQuery,
  useSessionsQuery,
  useTestTelegramMutation,
  useTestWebhookMutation,
  useUpdateIntegrationsMutation,
} from '@/hooks/useDashboardQueries';
import type { SessionDto } from '@/lib/api';
import { PAGINATION_DEFAULT_PAGE_SIZE } from '@specter/contracts';
import { cn, DEFAULT_TIMEZONE } from '@/lib/utils';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Radio,
  Send,
  ShieldCheck,
  Webhook,
} from 'lucide-react';
import { TelegramTab } from './integrations/TelegramTab';
import { WebhookTab } from './integrations/WebhookTab';
import { WebSessionsTab } from './integrations/WebSessionsTab';

export interface IntegrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  timeZone?: string;
}

export function IntegrationsModal({
  isOpen,
  onClose,
  timeZone = DEFAULT_TIMEZONE,
}: IntegrationsModalProps) {
  const [activeTab, setActiveTab] = React.useState<'telegram' | 'webhook' | 'sessions'>('telegram');
  const [form, setForm] = React.useState<IntegrationFormValues>(emptyIntegrationForm);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  const extensionUrl =
    process.env.NEXT_PUBLIC_EXTENSION_URL ||
    `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/specter-companion.zip`;
  const isExternalExtensionUrl = Boolean(
    process.env.NEXT_PUBLIC_EXTENSION_URL &&
      /^https?:\/\//i.test(process.env.NEXT_PUBLIC_EXTENSION_URL)
  );
  const [sessionsPage, setSessionsPage] = React.useState(1);
  const [sessionsPageSize, setSessionsPageSize] = React.useState<number>(
    PAGINATION_DEFAULT_PAGE_SIZE
  );
  const [deletingSessionId, setDeletingSessionId] = React.useState<string | null>(null);
  const [telegramTestStatus, setTelegramTestStatus] = React.useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const [webhookTestStatus, setWebhookTestStatus] = React.useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  const modal = useModal();
  const integrationsQuery = useIntegrationsQuery(isOpen);
  const sessionsQuery = useSessionsQuery(isOpen, sessionsPage, sessionsPageSize);
  const updateIntegrationsMutation = useUpdateIntegrationsMutation();
  const deleteSessionMutation = useDeleteSessionMutation();
  const testTelegramMutation = useTestTelegramMutation();
  const testWebhookMutation = useTestWebhookMutation();

  const initialData = integrationsQuery.data ?? null;
  const sessions = sessionsQuery.data?.items ?? [];
  const sessionsPagination = sessionsQuery.data?.pagination;
  const telegramBotUsername =
    initialData?.botUsername || process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || null;

  React.useEffect(() => {
    if (!isOpen) return;
    setGlobalError(null);
    setSaveSuccess(false);
    setTelegramTestStatus(null);
    setWebhookTestStatus(null);
  }, [isOpen]);

  React.useEffect(() => {
    if (isOpen && initialData) {
      setForm(integrationsToForm(initialData));
    }
  }, [isOpen, initialData]);

  React.useEffect(() => {
    if (sessionsPagination && sessionsPage !== sessionsPagination.page) {
      setSessionsPage(sessionsPagination.page);
    }
  }, [sessionsPage, sessionsPagination]);

  const queryError =
    integrationsQuery.error instanceof Error ? integrationsQuery.error.message : null;
  const displayError = globalError ?? queryError;
  const isDirty = isIntegrationFormDirty(form, initialData);
  const isLoading = integrationsQuery.isLoading && !initialData;
  const isSaving = updateIntegrationsMutation.isPending;
  const isTestingTelegram = testTelegramMutation.isPending;
  const isTestingWebhook = testWebhookMutation.isPending;

  const handleDeleteSession = async (session: SessionDto) => {
    const sessionLabel = session.name || session.domain;
    const confirmed = await modal.confirm({
      title: 'Revoke Session',
      message: `Are you sure you want to revoke the authenticated session for "${sessionLabel}"?`,
      confirmLabel: 'Revoke',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });
    if (!confirmed) return;

    setDeletingSessionId(session.id);
    try {
      await deleteSessionMutation.mutateAsync(session.id);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to revoke session.');
    } finally {
      setDeletingSessionId(null);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setGlobalError(null);
    setSaveSuccess(false);

    try {
      const updated = await updateIntegrationsMutation.mutateAsync(formToIntegrations(form));
      setForm(integrationsToForm(updated));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to save integrations.');
    }
  };

  const handleTestTelegram = async () => {
    if (!form.telegramChatId.trim()) {
      setTelegramTestStatus({ ok: false, msg: 'Please provide a Telegram Chat ID first.' });
      return;
    }

    setTelegramTestStatus(null);
    try {
      const res = await testTelegramMutation.mutateAsync({ chatId: form.telegramChatId.trim() });
      setTelegramTestStatus({ ok: true, msg: res.message });
    } catch (err) {
      setTelegramTestStatus({
        ok: false,
        msg: err instanceof Error ? err.message : 'Telegram test failed.',
      });
    }
  };

  const handleTestWebhook = async () => {
    if (!form.webhookUrl.trim()) {
      setWebhookTestStatus({ ok: false, msg: 'Please provide a Webhook URL first.' });
      return;
    }

    setWebhookTestStatus(null);
    try {
      const res = await testWebhookMutation.mutateAsync(formToWebhookTest(form));
      setWebhookTestStatus({ ok: true, msg: res.message });
    } catch (err) {
      setWebhookTestStatus({
        ok: false,
        msg: err instanceof Error ? err.message : 'Webhook delivery failed.',
      });
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
      description="Configure real-time delivery channels for scraping change alerts and automatic recovery."
      confirmTitle="Discard Unsaved Changes?"
      confirmMessage="You have modified integration settings that have not been saved. Close without saving?"
    >
      <div className="space-y-6 pt-2">
        <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-muted/60 p-1 border border-border">
          <button
            type="button"
            onClick={() => setActiveTab('telegram')}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-md py-2 text-xs sm:text-sm font-medium transition-all duration-150',
              activeTab === 'telegram'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Send className="h-4 w-4 text-sky-500" />
            <span className="truncate">Telegram</span>
            {form.telegramEnabled && (
              <span className="h-2 w-2 rounded-full bg-emerald-500" title="Active" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('webhook')}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-md py-2 text-xs sm:text-sm font-medium transition-all duration-150',
              activeTab === 'webhook'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Webhook className="h-4 w-4 text-violet-500" />
            <span className="truncate">Webhook</span>
            {form.webhookEnabled && (
              <span className="h-2 w-2 rounded-full bg-emerald-500" title="Active" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sessions')}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-md py-2 text-xs sm:text-sm font-medium transition-all duration-150',
              activeTab === 'sessions'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <span className="truncate">Web Sessions</span>
            {sessions.length > 0 && (
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {sessions.length}
              </span>
            )}
          </button>
        </div>

        {displayError && (
          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{displayError}</div>
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
            {activeTab === 'telegram' && (
              <TelegramTab
                telegramEnabled={form.telegramEnabled}
                onTelegramEnabledChange={(value) =>
                  setForm((prev) => ({ ...prev, telegramEnabled: value }))
                }
                telegramChatId={form.telegramChatId}
                onTelegramChatIdChange={(value) =>
                  setForm((prev) => ({ ...prev, telegramChatId: value }))
                }
                telegramBotUsername={telegramBotUsername}
                onTestTelegram={handleTestTelegram}
                isTestingTelegram={isTestingTelegram}
                telegramTestStatus={telegramTestStatus}
              />
            )}

            {activeTab === 'webhook' && (
              <WebhookTab
                webhookEnabled={form.webhookEnabled}
                onWebhookEnabledChange={(value) =>
                  setForm((prev) => ({ ...prev, webhookEnabled: value }))
                }
                webhookUrl={form.webhookUrl}
                onWebhookUrlChange={(value) => setForm((prev) => ({ ...prev, webhookUrl: value }))}
                webhookSecret={form.webhookSecret}
                onWebhookSecretChange={(value) =>
                  setForm((prev) => ({ ...prev, webhookSecret: value }))
                }
                clearWebhookSecret={form.clearWebhookSecret}
                onClearWebhookSecretChange={(value) =>
                  setForm((prev) => ({ ...prev, clearWebhookSecret: value }))
                }
                hasConfiguredSecret={Boolean(initialData?.hasWebhookSecret)}
                onTestWebhook={handleTestWebhook}
                isTestingWebhook={isTestingWebhook}
                webhookTestStatus={webhookTestStatus}
              />
            )}

            {activeTab === 'sessions' && (
              <WebSessionsTab
                sessions={sessions}
                pagination={sessionsPagination}
                page={sessionsPage}
                onPageChange={setSessionsPage}
                pageSize={sessionsPageSize}
                onPageSizeChange={(size) => {
                  setSessionsPageSize(size);
                  setSessionsPage(1);
                }}
                isLoadingSessions={sessionsQuery.isFetching}
                deletingSessionId={deletingSessionId}
                onRefreshSessions={() => void sessionsQuery.refetch()}
                onDeleteSession={handleDeleteSession}
                extensionUrl={extensionUrl}
                isExternalExtensionUrl={isExternalExtensionUrl}
                timeZone={timeZone}
              />
            )}

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border">
              <Button type="button" variant="outline" onClick={onClose} className="h-9 text-xs">
                Close
              </Button>
              {activeTab !== 'sessions' && (
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
              )}
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
