'use client';

import * as React from 'react';
import Link from 'next/link';
import { SpecterLogo } from '@/components/brand/SpecterLogo';
import { ThemeToggle } from '@/components/theme/ThemeProvider';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ShieldCheck, Mail, Lock } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top Bar with App Theme */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 group">
              <SpecterLogo size="md" />
            </Link>
          </div>

          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <Link href="/">
              <Button variant="outline" size="sm" className="h-9 px-3 text-xs sm:text-sm font-medium gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                <span>Dashboard</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-8 sm:py-12 sm:px-6 lg:px-8 space-y-8">
        {/* Section Heading */}
        <div className="border-b border-border pb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Privacy Policy
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Last updated: November 2, 2026 • Single-purpose compliance for Specter and Specter Companion
          </p>
        </div>

        {/* Content Sections in App Card Design */}
        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          {/* Section 1 */}
          <section className="rounded-lg border border-border bg-card p-5 sm:p-6 space-y-3">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">01.</span>
              Single Purpose &amp; Overview
            </h2>
            <p>
              Specter provides automated web data extraction, scheduled scraping pipelines, and the companion browser extension <strong>Specter Companion — Web Session Sync</strong>.
            </p>
            <p>
              The single purpose of Specter Companion is to enable authenticated users to synchronize active browser session cookies for target domains directly to their Specter dashboard. This allows scraping engines to crawl authorized member portals without storing or exposing cleartext user passwords.
            </p>
          </section>

          {/* Section 2 */}
          <section className="rounded-lg border border-border bg-card p-5 sm:p-6 space-y-4">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">02.</span>
              Information We Collect
            </h2>
            <p>
              We only collect data strictly necessary to operate the service:
            </p>
            <div className="grid sm:grid-cols-2 gap-4 pt-1">
              <div className="rounded-md border border-border/70 bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-2 text-foreground font-medium text-xs">
                  <Mail className="h-4 w-4" />
                  Account Identifiers
                </div>
                <p className="text-xs">
                  Your registered email address and authentication token to secure API communication between your client and your Specter account.
                </p>
              </div>

              <div className="rounded-md border border-border/70 bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-2 text-foreground font-medium text-xs">
                  <Lock className="h-4 w-4" />
                  Synchronized Session Cookies
                </div>
                <p className="text-xs">
                  Only when you explicitly initiate synchronization by clicking &quot;Sync Session with Specter&quot;, cookies for the active tab domain are exported and securely stored.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="rounded-lg border border-border bg-card p-5 sm:p-6 space-y-3">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">03.</span>
              How We Use Your Data
            </h2>
            <p>Collected data is used solely to:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-xs">
              <li>Authenticate your account and identify authorized access.</li>
              <li>Attach valid session state to your configured automated scraping jobs on the specified domains.</li>
              <li>Provide diagnostic visibility into job executions and session expiration statuses.</li>
            </ul>
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-foreground font-medium">
              We never sell, rent, monetize, or transfer user data or session cookies to third parties or advertising networks.
            </div>
          </section>

          {/* Section 4 */}
          <section className="rounded-lg border border-border bg-card p-5 sm:p-6 space-y-3">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">04.</span>
              Chrome Extension Permissions Disclosure
            </h2>
            <p>The Specter Companion extension utilizes the following scoped permissions:</p>
            <div className="space-y-2 text-xs">
              <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                <strong className="text-foreground">cookies &amp; host permissions (&lt;all_urls&gt;):</strong> Used exclusively to retrieve session cookies for the active tab domain chosen by the user during explicit sync actions.
              </div>
              <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                <strong className="text-foreground">activeTab:</strong> Used solely to identify the hostname of the active browser tab when the extension popup is opened.
              </div>
              <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                <strong className="text-foreground">storage:</strong> Used locally on your device (<code className="text-foreground font-mono">chrome.storage.local</code>) to remember your API endpoint and login session between browser restarts.
              </div>
              <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                <strong className="text-foreground">tabs:</strong> Used to complete Google OAuth sign-in workflows and open the Specter dashboard tab.
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section className="rounded-lg border border-border bg-card p-5 sm:p-6 space-y-3">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">05.</span>
              Data Security &amp; Storage
            </h2>
            <p>
              All communication between the Specter extension, frontend dashboard, and backend API is encrypted in transit using industry-standard Transport Layer Security (HTTPS/TLS). Cookies and session data are stored securely within isolated database tables associated only with your account.
            </p>
          </section>

          {/* Section 6 */}
          <section className="rounded-lg border border-border bg-card p-5 sm:p-6 space-y-3">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">06.</span>
              User Rights &amp; Data Deletion
            </h2>
            <p>
              You maintain total control over your data:
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-xs">
              <li>You can disconnect and wipe all local extension storage anytime by clicking &quot;Disconnect&quot; in the popup.</li>
              <li>You can delete any synchronized session, cookies, or job history directly in the Specter web dashboard.</li>
              <li>You can request complete deletion of your account and associated records by contacting us.</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="rounded-lg border border-border bg-card p-5 sm:p-6 space-y-2">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">07.</span>
              Contact &amp; Inquiries
            </h2>
            <p className="text-xs">
              For any questions, privacy inquiries, or data requests regarding Specter or the Specter Companion browser extension, please contact:
            </p>
            <p className="text-xs text-foreground font-medium pt-1">
              Email:{' '}
              <a
                href="mailto:pedroaugustoaduarte@gmail.com"
                className="underline underline-offset-4 hover:text-muted-foreground transition-colors"
              >
                pedroaugustoaduarte@gmail.com
              </a>
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/40 mt-auto">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8 text-xs text-muted-foreground">
          <span className="font-mono">Specter Web Monitor &copy; 2026</span>
          <div className="flex items-center gap-4 text-xs font-normal">
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms of Service
            </Link>
            <span>&bull;</span>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
