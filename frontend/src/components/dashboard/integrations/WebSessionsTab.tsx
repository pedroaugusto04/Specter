'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import type { SessionDto } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { ExternalLink, Globe, Loader2, Lock, ShieldCheck, Trash2 } from 'lucide-react';

export interface WebSessionsTabProps {
  sessions: SessionDto[];
  isLoadingSessions: boolean;
  deletingSessionId: string | null;
  onRefreshSessions: () => void;
  onDeleteSession: (session: SessionDto) => Promise<void>;
  extensionUrl: string;
  isExternalExtensionUrl: boolean;
  timeZone: string;
}

export function WebSessionsTab({
  sessions,
  isLoadingSessions,
  deletingSessionId,
  onRefreshSessions,
  onDeleteSession,
  extensionUrl,
  isExternalExtensionUrl,
  timeZone,
}: WebSessionsTabProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-foreground">
              Authenticated Web Sessions
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Allows Specter to access websites requiring login, 2FA, or password protection.
              The extension captures your active authenticated browser session with 1 click, without
              exposing your raw passwords.
            </p>
          </div>
        </div>

        <div className="rounded-md bg-muted/40 p-3 text-xs space-y-1.5 border border-border/50">
          <div className="font-medium text-foreground flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-primary" />
            How to use the Companion extension:
          </div>
          <ol className="list-decimal list-inside text-muted-foreground space-y-1.5 pl-1">
            <li>
              <a
                href={extensionUrl}
                {...(isExternalExtensionUrl
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : { download: 'specter-companion.zip' })}
                className="text-primary hover:underline font-medium inline-flex items-center gap-1"
              >
                Download the Specter Companion extension
                <ExternalLink className="h-3 w-3 inline" />
              </a>
            </li>
            <li>Visit and log in to the desired target website in your normal browser.</li>
            <li>
              Click the Specter extension icon and select{' '}
              <strong>&quot;Sync Session with Specter&quot;</strong>.
            </li>
          </ol>
        </div>

        <div className="rounded-md bg-muted/40 p-3 text-xs border border-border/50 text-muted-foreground leading-relaxed">
          <div className="font-medium text-foreground flex items-center gap-1.5 mb-1">
            <Lock className="h-3.5 w-3.5 text-foreground" />
            Privacy & Data Security
          </div>
          The extension strictly collects session cookies for the active domain in your tab to allow
          scraping bots to navigate authenticated portals on your behalf. No passwords, form data,
          credit card numbers, or browsing history of other sites are ever collected or transferred.
          You can revoke any synced session at any time with 1 click below.
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>Saved Sessions ({sessions.length})</span>
          <button
            type="button"
            onClick={onRefreshSessions}
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            Refresh list
          </button>
        </div>

        {isLoadingSessions ? (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Loading synced sessions...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 p-6 text-center text-xs text-muted-foreground">
            No web sessions synced yet.{' '}
            <a
              href={extensionUrl}
              {...(isExternalExtensionUrl
                ? { target: '_blank', rel: 'noopener noreferrer' }
                : { download: 'specter-companion.zip' })}
              className="text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              Download the extension
              <ExternalLink className="h-3 w-3 inline" />
            </a>{' '}
            and sync your logged-in sites with 1 click.
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
            {sessions.map((sess) => (
              <div
                key={sess.id}
                className="flex items-center justify-between p-3 text-xs hover:bg-muted/30 transition-colors"
              >
                <div className="space-y-0.5">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <span>{sess.domain}</span>
                    {sess.name && sess.name !== sess.domain && (
                      <span className="text-[11px] font-normal text-muted-foreground">
                        ({sess.name})
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {sess.cookieCount} cookies • Synced on {formatDateTime(sess.updatedAt, timeZone)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={deletingSessionId === sess.id}
                  onClick={() => void onDeleteSession(sess)}
                  className="h-7 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive border-border"
                  title="Revoke this session"
                >
                  {deletingSessionId === sess.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
