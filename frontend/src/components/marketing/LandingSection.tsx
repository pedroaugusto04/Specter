'use client';

import { Button } from '@/components/ui/button';
import type { UserDto } from '@/lib/api';
import { ArrowRight, Bell, Clock, Layers, Plus, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

interface LandingSectionProps {
  user: UserDto | null;
  onGetStarted: () => void;
  onOpenCreate: () => void;
}

export function LandingSection({ user, onGetStarted, onOpenCreate }: LandingSectionProps) {
  const faqs = [
    {
      q: 'How does Specter detect visual and structured changes?',
      a: 'Specter executes scheduled headless browser crawls to capture full-page snapshots, extract targeted data structures using AI, and compare pixel-level visual differences between runs.',
    },
    {
      q: 'Can Specter monitor dynamic, single-page applications (SPAs)?',
      a: 'Yes. Powered by Playwright headless engines, Specter waits for network idle and dynamic JavaScript hydration before evaluating content.',
    },
    {
      q: 'Which notification channels are supported?',
      a: 'You can configure instant alerts through Telegram bots, custom Webhooks (Discord, Slack, Zapier), and direct email notifications whenever a meaningful change is detected.',
    },
    {
      q: 'How frequently can monitors be scheduled?',
      a: 'Specter supports cron expressions ranging from every 15 minutes to hourly, daily, or custom business intervals with built-in failure recovery.',
    },
  ];

  return (
    <div className="space-y-16 sm:space-y-24 py-4 sm:py-8">
      {/* Hero Section */}
      <section className="text-center space-y-6 max-w-3xl mx-auto pt-6 sm:pt-10">
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground leading-[1.15]">
          Web Change Detection &amp; Structured Data Extraction
        </h1>

        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
          Monitor critical websites automatically. Track visual diffs side-by-side, extract clean
          structured data with AI, and receive instant alerts via Telegram and Webhooks.
        </p>

        {/* Central Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          {user ? (
            <>
              <Link href="/dashboard">
                <Button
                  size="lg"
                  className="w-full sm:w-auto h-11 px-6 font-medium gap-2 text-sm shadow-sm"
                >
                  <span>Go to Dashboard</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Button
                variant="outline"
                size="lg"
                onClick={onOpenCreate}
                className="w-full sm:w-auto h-11 px-6 font-medium text-sm gap-2"
              >
                <Plus className="h-4 w-4" />
                <span>Create Monitor</span>
              </Button>
            </>
          ) : (
            <>
              <Button
                size="lg"
                onClick={onOpenCreate}
                className="w-full sm:w-auto h-11 px-6 font-medium gap-2 text-sm shadow-sm"
              >
                <Plus className="h-4 w-4" />
                <span>Create Monitor</span>
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={onGetStarted}
                className="w-full sm:w-auto h-11 px-6 font-medium text-sm"
              >
                Sign In to Dashboard
              </Button>
            </>
          )}
        </div>
      </section>

      {/* Feature Capabilities Grid */}
      <section className="space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            Engineered for precision web tracking
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Everything you need to automate competitive intelligence, regulatory monitoring, and
            website change audits.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-xl border border-border bg-card/60 backdrop-blur-xs space-y-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-foreground">AI-Driven Extraction</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Describe what information you need in plain language. Specter compiles headless
              scraping routines to isolate clean structured data.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-border bg-card/60 backdrop-blur-xs space-y-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Layers className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Visual Diff Slider</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Compare sequential page screenshots with an interactive split-slider to inspect exact
              visual modifications and layout shifts.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-border bg-card/60 backdrop-blur-xs space-y-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Bell className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Multi-Channel Alerts</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Receive real-time notifications via Telegram, Discord, Slack or custom Webhook
              payloads the moment actionable changes occur.
            </p>
          </div>
        </div>
      </section>

      {/* Step-by-Step Workflow */}
      <section className="p-6 sm:p-8 rounded-xl border border-border bg-card/40 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            How Specter Works
          </h2>
          <p className="text-sm text-muted-foreground">
            From URL input to automated change notifications in three steps.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
          <div className="space-y-2">
            <div className="text-xs font-mono font-semibold text-primary">01 / SETUP</div>
            <h4 className="text-sm font-semibold text-foreground">Define URL &amp; Goal</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Paste the target web address and choose what elements or structured data you want to
              track.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-mono font-semibold text-primary">02 / SCHEDULE</div>
            <h4 className="text-sm font-semibold text-foreground">Automated Crawls</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Specter runs scheduled headless browser crawls, taking screenshots and computing
              content hash diffs.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-mono font-semibold text-primary">03 / NOTIFY</div>
            <h4 className="text-sm font-semibold text-foreground">Actionable Alerts</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Get notified immediately through Telegram or Webhooks with the exact change breakdown.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="space-y-6 max-w-3xl mx-auto">
        <div className="text-center space-y-2">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            Frequently Asked Questions
          </h2>
          <p className="text-sm text-muted-foreground">
            Common questions about Specter web change monitoring.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="p-4 sm:p-5 rounded-lg border border-border bg-card/50 space-y-2"
            >
              <h4 className="text-sm font-semibold text-foreground">{faq.q}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="p-8 sm:p-10 rounded-2xl border border-border bg-gradient-to-b from-card/80 to-muted/40 text-center space-y-4">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Ready to track changes in real time?
        </h2>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          Start monitoring pages, comparing visual snapshots, and extracting structured web data
          today.
        </p>
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          {user ? (
            <Link href="/dashboard">
              <Button size="lg" className="h-11 px-6 font-medium gap-2 text-sm">
                <span>Go to Dashboard</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <Button
              size="lg"
              onClick={onOpenCreate}
              className="h-11 px-6 font-medium gap-2 text-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Create Monitor</span>
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
