'use client';

import { Button } from '@/components/ui/button';
import type { UserDto } from '@/lib/api';
import { ArrowRight, Bell, Clock, Layers, Plus } from 'lucide-react';
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
      q: 'How does Specter detect changes?',
      a: 'Specter takes periodic snapshots of your target pages and compares them side-by-side to highlight visual and content differences the moment they happen.',
    },
    {
      q: 'Can Specter monitor dynamic modern websites?',
      a: 'Yes. Specter fully renders modern dynamic pages and JavaScript before checking for updates.',
    },
    {
      q: 'Which notification channels are supported?',
      a: 'You can receive instant notifications via Telegram, custom Webhooks (Discord, Slack, Zapier), and email alerts whenever changes are detected.',
    },
    {
      q: 'How frequently can monitors run?',
      a: 'You can schedule automated checks from every 15 minutes to hourly, daily, or custom business intervals.',
    },
  ];

  return (
    <div className="space-y-16 sm:space-y-24 py-4 sm:py-8">
      {/* Hero Section */}
      <section className="text-center space-y-6 max-w-3xl mx-auto pt-6 sm:pt-10">
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground leading-[1.15]">
          Automated Website Change Detection
        </h1>

        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
          Track updates on any website effortlessly. Compare visual snapshots side-by-side and
          receive instant alerts via Telegram and Webhooks whenever content changes.
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
            Built for reliable website tracking
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Stay informed on competitor pricing, regulatory updates, content changes, and page
            modifications.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-xl border border-border bg-card/60 backdrop-blur-xs space-y-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Layers className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Visual Diff Slider</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Compare sequential page snapshots with an interactive split-slider to inspect exact
              modifications and visual shifts side-by-side.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-border bg-card/60 backdrop-blur-xs space-y-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Clock className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Scheduled Monitoring</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Automate periodic checks on your custom schedule—from every 15 minutes to
              daily—without ever having to manually refresh or inspect pages.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-border bg-card/60 backdrop-blur-xs space-y-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Bell className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Instant Alerts</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Get notified immediately through Telegram, Discord, Slack, or custom Webhooks the
              moment actionable changes occur.
            </p>
          </div>
        </div>
      </section>

      {/* Step-by-Step Workflow */}
      <section className="p-6 sm:p-8 rounded-xl border border-border bg-card/40 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            How It Works
          </h2>
          <p className="text-sm text-muted-foreground">Set up monitoring in three simple steps.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
          <div className="space-y-2">
            <div className="text-xs font-mono font-semibold text-primary">01 / TARGET</div>
            <h4 className="text-sm font-semibold text-foreground">Enter URL</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Paste the webpage you want to monitor and specify what you want to track.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-mono font-semibold text-primary">02 / SCHEDULE</div>
            <h4 className="text-sm font-semibold text-foreground">Set Frequency</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Pick how often Specter checks the site for updates and captures new snapshots.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-mono font-semibold text-primary">03 / NOTIFY</div>
            <h4 className="text-sm font-semibold text-foreground">Receive Alerts</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Get an instant notification with visual comparisons whenever a change is detected.
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
            Common questions about website change monitoring.
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
          Start monitoring pages, comparing visual snapshots, and staying notified of critical
          updates today.
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
