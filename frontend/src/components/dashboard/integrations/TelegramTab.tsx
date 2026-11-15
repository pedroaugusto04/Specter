'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { AlertCircle, Check, ExternalLink, HelpCircle, Loader2, MessageSquare, Send } from 'lucide-react';

export interface TelegramTabProps {
  telegramEnabled: boolean;
  onTelegramEnabledChange: (enabled: boolean) => void;
  telegramChatId: string;
  onTelegramChatIdChange: (chatId: string) => void;
  telegramBotUsername: string | null;
  onTestTelegram: () => Promise<void>;
  isTestingTelegram: boolean;
  telegramTestStatus: { ok: boolean; msg: string } | null;
}

export function TelegramTab({
  telegramEnabled,
  onTelegramEnabledChange,
  telegramChatId,
  onTelegramChatIdChange,
  telegramBotUsername,
  onTestTelegram,
  isTestingTelegram,
  telegramTestStatus,
}: TelegramTabProps) {
  return (
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
          onChange={(e) => onTelegramEnabledChange(e.target.checked)}
          className="h-5 w-5 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
        />
      </div>

      {/* Telegram Bot Instructions & Quick Link */}
      <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-sky-500 shrink-0" />
            <span className="text-xs font-semibold text-foreground">
              How to connect the Telegram bot
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
                Open the bot{' '}
                <a
                  href={`https://t.me/${telegramBotUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline decoration-sky-500 underline-offset-2 hover:text-sky-400"
                >
                  @{telegramBotUsername}
                </a>{' '}
                and click <strong className="text-foreground">Start (/start)</strong>. Telegram
                requires you to start the chat before it allows the bot to send you messages.
              </span>
            ) : (
              <span>
                Open the Specter bot on Telegram and send{' '}
                <strong className="text-foreground">/start</strong>. Telegram prohibits bots from
                sending messages to users who haven&apos;t started a conversation first.
              </span>
            )}
          </li>
          <li>
            Discover your <strong className="text-foreground">Chat ID</strong> (you can check your
            ID by sending a message to{' '}
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
            Paste your Chat ID in the field below and click{' '}
            <strong className="text-foreground">Send Test Message</strong>.
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
              <span>Start conversation with @{telegramBotUsername} on Telegram</span>
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
            onChange={(e) => onTelegramChatIdChange(e.target.value)}
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
              Tip: Start a chat at{' '}
              <a
                href={`https://t.me/${telegramBotUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-foreground hover:underline"
              >
                @{telegramBotUsername}
              </a>{' '}
              and find your Chat ID with{' '}
              <a
                href="https://t.me/userinfobot"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-foreground hover:underline"
              >
                @userinfobot
              </a>
              .
            </>
          ) : (
            <>
              Tip: Send <span className="font-mono text-foreground">/start</span> to the bot and find
              your Chat ID with{' '}
              <a
                href="https://t.me/userinfobot"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-foreground hover:underline"
              >
                @userinfobot
              </a>
              .
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
          onClick={onTestTelegram}
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
  );
}
