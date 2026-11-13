'use client';

import { Button } from '@/components/ui/button';
import type { UserDto } from '@/lib/api';
import { ArrowRight, Bell, Clock, Globe, Plus } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

interface LandingSectionProps {
  user: UserDto | null;
  onGetStarted: () => void;
  onOpenCreate: () => void;
}

const steps = [
  {
    index: '01',
    label: 'Target',
    title: 'Enter a URL',
    description: 'Paste the webpage you want to monitor and specify what you want to track.',
    icon: Globe,
  },
  {
    index: '02',
    label: 'Schedule',
    title: 'Set the frequency',
    description: 'Automate periodic checks on your own schedule, from every 15 minutes to daily.',
    icon: Clock,
  },
  {
    index: '03',
    label: 'Notify',
    title: 'Review the changes',
    description:
      'Get notified the moment content changes, with side-by-side visual comparisons of exactly what was modified.',
    icon: Bell,
  },
];

const faqs = [
  {
    q: 'How does Specter detect changes?',
    a: 'Specter takes periodic snapshots of your target pages and compares them side-by-side to highlight visual and content differences the moment they happen.',
  },
  {
    q: 'Can Specter monitor dynamic modern websites?',
    a: 'Yes. Specter fully renders modern dynamic pages and JavaScript before checking for updates.',
  },
  {
    q: 'Which notification channels are supported?',
    a: 'Telegram, custom Webhooks (Discord, Slack, Zapier) and email alerts whenever changes are detected.',
  },
  {
    q: 'How frequently can monitors run?',
    a: 'Checks can be scheduled from every 15 minutes to hourly, daily, or custom business intervals.',
  },
];

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-3">
      <span className="text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground">
        {eyebrow}
      </span>
      <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">{description}</p>
    </div>
  );
}

export function LandingSection({ user, onGetStarted, onOpenCreate }: LandingSectionProps) {
  const primaryAction = user ? (
    <Link href="/dashboard" className="block w-full sm:w-auto">
      <Button size="lg" className="w-full sm:w-auto">
        <span>Go to Dashboard</span>
        <ArrowRight className="h-4 w-4" />
      </Button>
    </Link>
  ) : (
    <Button size="lg" onClick={onOpenCreate} className="w-full sm:w-auto">
      <Plus className="h-4 w-4" />
      <span>Create Monitor</span>
    </Button>
  );

  return (
    <div className="divide-y divide-border">
      {/* Hero */}
      <section className="py-14 sm:py-28 text-center">
        <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
          <h1 className="text-3xl min-[400px]:text-4xl sm:text-6xl font-semibold tracking-tighter text-foreground leading-[1.05] text-balance">
            Automated website change detection
          </h1>

          <p className="mx-auto max-w-xl text-base sm:text-lg text-muted-foreground leading-relaxed text-balance">
            Track updates on any website. Compare visual snapshots side-by-side and receive instant
            alerts whenever content changes.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-2">
            {primaryAction}
            {user ? (
              <Button
                variant="outline"
                size="lg"
                onClick={onOpenCreate}
                className="w-full sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                <span>Create Monitor</span>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="lg"
                onClick={onGetStarted}
                className="w-full sm:w-auto"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 sm:py-20 grid gap-8 lg:grid-cols-[280px_1fr] lg:gap-12">
        <SectionHeader
          eyebrow="How it works"
          title="Built for reliable website tracking"
          description="Stay informed on competitor pricing, regulatory updates and content changes in three steps."
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px rounded-lg border border-border bg-border overflow-hidden">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.index} className="bg-card p-5 sm:p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground">
                    {step.index} / {step.label}
                  </span>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 sm:py-20 grid gap-8 lg:grid-cols-[280px_1fr] lg:gap-12">
        <SectionHeader
          eyebrow="FAQ"
          title="Frequently asked questions"
          description="Common questions about website change monitoring."
        />

        <dl className="divide-y divide-border border-y border-border">
          {faqs.map((faq) => (
            <div key={faq.q} className="grid gap-2 py-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-8">
              <dt className="text-sm font-medium text-foreground">{faq.q}</dt>
              <dd className="text-sm text-muted-foreground leading-relaxed">{faq.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Closing CTA */}
      <section className="py-16 sm:py-20">
        <div className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
              Ready to track changes in real time?
            </h2>
            <p className="text-sm text-muted-foreground">
              Start monitoring pages and get notified of critical updates today.
            </p>
          </div>
          <div className="shrink-0 md:w-auto">{primaryAction}</div>
        </div>
      </section>
    </div>
  );
}
