'use client';

import * as React from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { CRON_PRESETS, validateClientCron } from '@/lib/utils';

export interface CreateJobFormProps {
  onCreated: () => void;
  onCancel?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  isModal?: boolean;
}

export function CreateJobForm({
  onCreated,
  onCancel,
  onDirtyChange,
  isModal = false,
}: CreateJobFormProps) {
  const [url, setUrl] = React.useState('');
  const [userPrompt, setUserPrompt] = React.useState('');
  const [notificationEmail, setNotificationEmail] = React.useState('');
  const [cronPreset, setCronPreset] = React.useState('0 */6 * * *');
  const [customCron, setCustomCron] = React.useState('0 */6 * * *');
  const [useCustomCron, setUseCustomCron] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const effectiveCron = useCustomCron ? customCron : cronPreset;

  const isDirty = Boolean(
    url.trim().length > 0 ||
    userPrompt.trim().length > 0 ||
    notificationEmail.trim().length > 0 ||
    (useCustomCron && customCron !== '0 */6 * * *')
  );

  React.useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cronValidation = validateClientCron(effectiveCron);
    if (!cronValidation.valid) {
      setError(cronValidation.error ?? 'Invalid cron expression.');
      return;
    }

    setLoading(true);
    try {
      await api.createJob({
        url,
        userPrompt,
        notificationEmail,
        cronExpression: effectiveCron.trim(),
      });
      setUrl('');
      setUserPrompt('');
      setError(null);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create monitoring job.');
    } finally {
      setLoading(false);
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-700" htmlFor="target-url">
            Target URL
          </label>
          <Input
            id="target-url"
            type="url"
            required
            placeholder="https://example.com/products/item"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-700" htmlFor="notify-email">
            Alert Email (Resend)
          </label>
          <Input
            id="notify-email"
            type="email"
            required
            placeholder="alerts@company.com"
            value={notificationEmail}
            onChange={(e) => setNotificationEmail(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-700" htmlFor="user-prompt">
          Extraction Instructions (AI Selector Compiler Prompt)
        </label>
        <Textarea
          id="user-prompt"
          required
          minLength={5}
          placeholder="e.g. Extract the product title, current price, stock availability, and the purchase link."
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-700" htmlFor="cron-preset">
            Check Frequency (Minimum floor: 15 min)
          </label>
          <select
            id="cron-preset"
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            value={useCustomCron ? 'custom' : cronPreset}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                setUseCustomCron(true);
              } else {
                setUseCustomCron(false);
                setCronPreset(e.target.value);
                setCustomCron(e.target.value);
              }
            }}
          >
            {CRON_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label} ({preset.value})
              </option>
            ))}
            <option value="custom">Custom Cron Expression...</option>
          </select>
        </div>

        {useCustomCron && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700" htmlFor="custom-cron">
              Cron Expression (5 fields, min. 15m)
            </label>
            <Input
              id="custom-cron"
              required
              placeholder="*/15 * * * *"
              value={customCron}
              onChange={(e) => setCustomCron(e.target.value)}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2.5 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          <Plus className="h-4 w-4" />
          {loading ? 'Compiling & Scheduling...' : 'Create Monitor'}
        </Button>
      </div>
    </form>
  );

  if (isModal) {
    return formContent;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-slate-900" />
          <CardTitle className="text-base">New Autonomous Monitor</CardTitle>
        </div>
      </CardHeader>
      <CardContent>{formContent}</CardContent>
    </Card>
  );
}
