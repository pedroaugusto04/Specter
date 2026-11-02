'use client';

import * as React from 'react';
import Link from 'next/link';
import { SpecterLogo } from '@/components/brand/SpecterLogo';
import { ArrowLeft, FileText, CheckCircle2, AlertTriangle, ShieldCheck, Mail } from 'lucide-react';

export default function TermsPage() {
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
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-4">
          <FileText className="w-3.5 h-3.5" />
          Terms of Service & Usage Agreement
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-slate-400 mb-8">
          Last updated: November 2, 2026 • Effective immediately
        </p>

        <div className="space-y-8 text-slate-300 text-sm leading-relaxed border-t border-slate-800/80 pt-8">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400">1.</span> Acceptance of Terms
            </h2>
            <p>
              By accessing or using Specter (including our web platform at <code className="text-indigo-300">specterdev.online</code> and the <strong>Specter Companion</strong> browser extension), you agree to be bound by these Terms of Service. If you do not agree to these terms, you must not use or access our software and services.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400">2.</span> Description of Service
            </h2>
            <p>
              Specter is a developer automation and data extraction platform. It provides tools to schedule, configure, and execute automated browser tasks and API workflows. The companion browser extension enables registered users to securely export active session state (cookies) to their private Specter account for automated workflow execution.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400">3.</span> Acceptable Use Policy & User Responsibility
            </h2>
            <p>
              You agree to use Specter responsibly and ethically. When synchronizing sessions or configuring data extraction tasks, you expressly agree:
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-400">
              <li>You will only scrape and extract data from websites and services you have lawful permission, authorization, or legal right to access.</li>
              <li>You will not use Specter to perform Denial of Service (DoS) attacks, brute-force logins, credential stuffing, or overwhelm remote servers.</li>
              <li>You will not synchronize sessions belonging to third parties without authorization.</li>
              <li>You will respect robots.txt standards, terms of service of third-party domains, and applicable rate limits.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400">4.</span> Account Security & Credentials
            </h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and any synchronized cookies. You agree to notify us immediately of any unauthorized access to your account. Specter implements industry-standard encryption for stored data, but you remain responsible for the security of your local browser environment.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400">5.</span> Disclaimer of Warranties
            </h2>
            <p className="text-slate-400">
              Specter is provided on an &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo; basis without warranties of any kind, whether express or implied. We do not guarantee uninterrupted uptime, error-free operation, or that target websites will not change their structure, anti-bot mechanisms, or invalidate sessions.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-indigo-400">6.</span> Limitation of Liability
            </h2>
            <p className="text-slate-400">
              Under no circumstances shall Specter or its operators be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your access to or inability to use the service, or actions taken by third-party websites against accounts used in automated jobs.
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-3 p-5 rounded-2xl bg-indigo-950/20 border border-indigo-800/40">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Mail className="w-4 h-4 text-indigo-400" />
              7. Contact & Support
            </h2>
            <p className="text-slate-300">
              For any questions, concerns, or legal inquiries regarding these Terms of Service, please reach out to:
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
