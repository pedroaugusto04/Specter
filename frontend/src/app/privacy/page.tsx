'use client';

import * as React from 'react';
import Link from 'next/link';
import { SpecterLogo } from '@/components/brand/SpecterLogo';
import { ArrowLeft, ShieldCheck, Mail, Lock, Eye, Server, RefreshCw } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <SpecterLogo className="w-8 h-8 transition-transform group-hover:scale-105" />
            <span className="font-semibold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Specter
            </span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors bg-slate-800/60 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700/60"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-4">
          <ShieldCheck className="w-3.5 h-3.5" />
          Official Privacy Policy & Chrome Web Store Compliance
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-slate-400 mb-8">
          Last updated: November 2, 2026 • Effective immediately
        </p>

        <div className="space-y-8 text-slate-300 text-sm leading-relaxed border-t border-slate-800/80 pt-8">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400">1.</span> Overview & Single Purpose
            </h2>
            <p>
              Specter (&ldquo;Specter&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) provides automated web data extraction, scraping pipelines, and the companion browser extension <strong>Specter Companion &mdash; Web Session Sync</strong>.
            </p>
            <p>
              The single purpose of Specter and its browser extension is to allow authenticated users to export and synchronize their current browser session cookies for a selected domain directly to their private Specter account, enabling automated web bots to navigate authenticated portals without exposing raw passwords.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400">2.</span> Information We Collect
            </h2>
            <p>
              We only collect data strictly necessary to fulfill our core services:
            </p>
            <div className="grid sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
                <div className="flex items-center gap-2 text-white font-medium text-sm">
                  <Mail className="w-4 h-4 text-indigo-400" />
                  Account Identifiers
                </div>
                <p className="text-xs text-slate-400">
                  Your registered email address and authentication credentials/tokens used to authenticate and communicate securely with your private Specter server instance.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
                <div className="flex items-center gap-2 text-white font-medium text-sm">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  Synchronized Session Cookies
                </div>
                <p className="text-xs text-slate-400">
                  Only when you explicitly initiate synchronization by clicking &ldquo;Sync Session&rdquo;, cookies for the active domain are read and securely uploaded to your account.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400">3.</span> How We Use Your Data
            </h2>
            <p>All data collected is used solely to:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-400">
              <li>Authenticate your account and identify authorized access.</li>
              <li>Attach valid session state to your configured automated scraping jobs on the specified domains.</li>
              <li>Provide diagnostic visibility into job executions and session expiration statuses.</li>
            </ul>
            <p className="text-emerald-400 font-medium pt-1">
              ✓ We never sell, rent, monetize, or transfer user data or session cookies to third parties or advertising networks.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400">4.</span> Chrome Extension Permissions Disclosure
            </h2>
            <p>The Specter Companion extension utilizes the following scoped permissions:</p>
            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800/60">
                <strong className="text-slate-200">cookies & host permissions (&lt;all_urls&gt;):</strong> Used exclusively to retrieve session cookies for the active tab domain chosen by the user during explicit sync actions.
              </div>
              <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800/60">
                <strong className="text-slate-200">activeTab:</strong> Used solely to identify the hostname of the active browser tab when the extension popup is opened.
              </div>
              <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800/60">
                <strong className="text-slate-200">storage:</strong> Used locally on your device (<code className="text-indigo-300">chrome.storage.local</code>) to remember your API endpoint and login session between browser restarts.
              </div>
              <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800/60">
                <strong className="text-slate-200">tabs:</strong> Used to complete Google OAuth sign-in workflows and open the Specter dashboard tab.
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400">5.</span> Data Security & Storage
            </h2>
            <p>
              All communication between the Specter extension, frontend dashboard, and backend API is encrypted in transit using industry-standard Transport Layer Security (HTTPS/TLS). Cookies and session data are stored securely within isolated database tables associated only with your account.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400">6.</span> User Rights & Data Deletion
            </h2>
            <p>
              You maintain total control over your data:
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-400">
              <li>You can disconnect and wipe all local extension storage anytime by clicking &ldquo;Disconnect&rdquo; in the popup.</li>
              <li>You can delete any synchronized session, cookies, or job history directly in the Specter web dashboard.</li>
              <li>You can request complete deletion of your account and associated records by contacting us.</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="space-y-3 p-5 rounded-2xl bg-indigo-950/20 border border-indigo-800/40">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Mail className="w-4 h-4 text-indigo-400" />
              7. Contact & Support
            </h2>
            <p className="text-slate-300">
              For any questions, privacy inquiries, or data requests regarding Specter or the Specter Companion browser extension, please contact our support team:
            </p>
            <div className="text-sm">
              <span className="text-slate-400">Email: </span>
              <a href="mailto:pedroaugustoaduarte@gmail.com" className="text-indigo-400 hover:text-indigo-300 underline font-medium">
                pedroaugustoaduarte@gmail.com
              </a>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-8 text-center text-xs text-slate-400">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 Specter. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-slate-200 transition-colors">
              Terms of Service
            </Link>
            <span>•</span>
            <Link href="/privacy" className="hover:text-slate-200 transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
