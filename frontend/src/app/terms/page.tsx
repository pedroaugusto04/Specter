'use client';

import { SpecterLogo } from '@/components/brand/SpecterLogo';
import { ThemeToggle } from '@/components/theme/ThemeProvider';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function TermsPage() {
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
            <Link href="/dashboard">
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 text-xs sm:text-sm font-medium gap-1.5"
              >
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
            Terms of Service
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Last updated: November 2, 2026 • Acceptable usage and service terms
          </p>
        </div>

        {/* Content Sections in App Card Design */}
        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          {/* Section 1 */}
          <section className="rounded-lg border border-border bg-card p-5 sm:p-6 space-y-3">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">01.</span>
              Acceptance of Terms
            </h2>
            <p>
              By accessing or using Specter (including our web platform at{' '}
              <code className="text-foreground font-mono">specterdev.online</code> and the{' '}
              <strong>Specter Companion</strong> browser extension), you agree to be bound by these
              Terms of Service. If you do not agree to these terms, you must not use or access our
              software and services.
            </p>
          </section>

          {/* Section 2 */}
          <section className="rounded-lg border border-border bg-card p-5 sm:p-6 space-y-3">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">02.</span>
              Description of Service
            </h2>
            <p>
              Specter is a developer automation and data extraction platform. It provides tools to
              schedule, configure, and execute automated browser tasks and API workflows. The
              companion browser extension enables registered users to securely export active session
              state (cookies) to their private Specter account for automated workflow execution.
            </p>
          </section>

          {/* Section 3 */}
          <section className="rounded-lg border border-border bg-card p-5 sm:p-6 space-y-3">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">03.</span>
              Acceptable Use Policy &amp; User Responsibility
            </h2>
            <p>
              You agree to use Specter responsibly and ethically. When synchronizing sessions or
              configuring data extraction tasks, you expressly agree:
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-xs">
              <li>
                You will only scrape and extract data from websites and services you have lawful
                permission, authorization, or legal right to access.
              </li>
              <li>
                You will not use Specter to perform Denial of Service (DoS) attacks, brute-force
                logins, credential stuffing, or overwhelm remote servers.
              </li>
              <li>
                You will not synchronize sessions belonging to third parties without authorization.
              </li>
              <li>
                You will respect robots.txt standards, terms of service of third-party domains, and
                applicable rate limits.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="rounded-lg border border-border bg-card p-5 sm:p-6 space-y-3">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">04.</span>
              Account Security &amp; Credentials
            </h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials
              and any synchronized cookies. You agree to notify us immediately of any unauthorized
              access to your account. Specter implements industry-standard encryption for stored
              data, but you remain responsible for the security of your local browser environment.
            </p>
          </section>

          {/* Section 5 */}
          <section className="rounded-lg border border-border bg-card p-5 sm:p-6 space-y-3">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">05.</span>
              Disclaimer of Warranties
            </h2>
            <p className="text-xs">
              Specter is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis without
              warranties of any kind, whether express or implied. We do not guarantee uninterrupted
              uptime, error-free operation, or that target websites will not change their structure,
              anti-bot mechanisms, or invalidate sessions.
            </p>
          </section>

          {/* Section 6 */}
          <section className="rounded-lg border border-border bg-card p-5 sm:p-6 space-y-3">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">06.</span>
              Limitation of Liability
            </h2>
            <p className="text-xs">
              Under no circumstances shall Specter or its operators be liable for any indirect,
              incidental, special, consequential, or punitive damages resulting from your access to
              or inability to use the service, or actions taken by third-party websites against
              accounts used in automated jobs.
            </p>
          </section>

          {/* Section 7 */}
          <section className="rounded-lg border border-border bg-card p-5 sm:p-6 space-y-2">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">07.</span>
              Contact &amp; Inquiries
            </h2>
            <p className="text-xs">
              For any questions, concerns, or legal inquiries regarding these Terms of Service,
              please reach out to:
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
