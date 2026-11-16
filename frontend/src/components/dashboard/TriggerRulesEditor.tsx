'use client';

import * as React from 'react';
import {
  FieldType,
  TriggerMatchMode,
  TriggerOperator,
  triggerOperatorsForType,
  type TriggerRule,
} from '@specter/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HelpCircle, Plus, Trash2 } from 'lucide-react';

export interface TriggerRulesEditorProps {
  triggerRules: TriggerRule[];
  onChange: (rules: TriggerRule[]) => void;
  triggerMatchMode: TriggerMatchMode;
  onMatchModeChange: (mode: TriggerMatchMode) => void;
  availableFields?: string[];
  fieldTypes?: Record<string, { type: FieldType }>;
}

export function TriggerHelpCallout({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 space-y-2.5 text-xs text-muted-foreground transition-all">
      <div className="flex items-center justify-between font-medium text-foreground">
        <span className="flex items-center gap-1.5">
          <HelpCircle className="h-4 w-4 text-primary" />
          How Smart Alerts & Trigger Conditions Work
        </span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Dismiss
          </button>
        )}
      </div>

      <p className="leading-relaxed">
        By default, you receive an alert whenever any tracked content changes on the page.
        Conditional triggers let you filter notifications so you only get alerted{' '}
        <strong>when specific events occur</strong>.
      </p>

      <div className="space-y-1.5 pt-1 text-[11px]">
        <div className="font-semibold text-foreground">What you can monitor:</div>
        <ul className="list-disc list-inside space-y-1 pl-1">
          <li>
            <strong className="text-foreground">Relative variations (numbers & text):</strong>{' '}
            Get alerted if a value drops (e.g. drops by 10%, or any decrease) or if any text/status
            changes compared to the prior check.
          </li>
          <li>
            <strong className="text-foreground">Fixed target thresholds:</strong> Alert only if a
            value passes a specific limit (e.g. less than 100 or greater than 50).
          </li>
          <li>
            <strong className="text-foreground">Specific text & keyword matches:</strong> Alert when
            a field contains or equals specific words (e.g. &quot;Available&quot;, &quot;Approved&quot;,
            &quot;Open&quot;).
          </li>
        </ul>
      </div>

      <div className="rounded border border-primary/25 bg-background/70 p-2.5 text-[11px] text-foreground space-y-1.5">
        <div className="font-semibold text-primary">💡 Two ways to configure conditions:</div>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground pl-0.5">
          <li>
            <strong className="text-foreground">1. In the extraction prompt:</strong> Add your
            condition in plain text in the extraction instructions (e.g.{' '}
            <em>&quot;Notify only if price drops by 10%&quot;</em>).
          </li>
          <li>
            <strong className="text-foreground">2. Via dropdown rules:</strong> Pick detected
            variables, operators, and target thresholds with visual controls when editing the job.
          </li>
        </ul>
      </div>
    </div>
  );
}

export function TriggerRulesEditor({
  triggerRules,
  onChange,
  triggerMatchMode,
  onMatchModeChange,
  availableFields = [],
  fieldTypes = {},
}: TriggerRulesEditorProps) {
  const [showTriggerHelp, setShowTriggerHelp] = React.useState(false);

  const handleAddRule = () => {
    const defaultField = availableFields[0] || '';
    onChange([
      ...triggerRules,
      { field: defaultField, operator: TriggerOperator.Changes, value: '' },
    ]);
  };

  const handleRemoveRule = (index: number) => {
    onChange(triggerRules.filter((_, idx) => idx !== index));
  };

  const handleFieldChange = (index: number, newField: string) => {
    const updated = [...triggerRules];
    const current = updated[index];
    if (!current) return;

    updated[index] = {
      ...current,
      field: newField,
      operator: TriggerOperator.Changes,
      value: '',
    };
    onChange(updated);
  };

  const handleOperatorChange = (index: number, newOp: TriggerOperator) => {
    const updated = [...triggerRules];
    const current = updated[index];
    if (!current) return;

    const isBoolean = fieldTypes[current.field]?.type === FieldType.Boolean;
    updated[index] = {
      ...current,
      operator: newOp,
      value: isBoolean ? false : '',
    };
    onChange(updated);
  };

  const handleValueChange = (index: number, val: string | number | boolean) => {
    const updated = [...triggerRules];
    const current = updated[index];
    if (!current) return;

    updated[index] = { ...current, value: val };
    onChange(updated);
  };

  return (
    <div className="space-y-3 pt-2 border-t border-border">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <span>Conditional Alert Triggers</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowTriggerHelp((prev) => !prev)}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-full hover:bg-muted"
              title="How do price and conditional alert triggers work?"
              aria-label="Toggle conditional alert trigger info"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Only send notifications when extracted fields meet these conditions.
          </p>
        </div>

        {triggerRules.length > 1 && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Match:</span>
            <button
              type="button"
              onClick={() =>
                onMatchModeChange(
                  triggerMatchMode === TriggerMatchMode.All
                    ? TriggerMatchMode.Any
                    : TriggerMatchMode.All
                )
              }
              className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80"
            >
              {triggerMatchMode === TriggerMatchMode.All ? 'ALL conditions' : 'ANY condition'}
            </button>
          </div>
        )}
      </div>

      {showTriggerHelp && <TriggerHelpCallout onDismiss={() => setShowTriggerHelp(false)} />}

      {triggerRules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
          No trigger conditions active. Alerts will trigger on any detected change.
          <div className="mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleAddRule}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Trigger Rule
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {triggerRules.map((rule, idx) => {
            const fieldType = fieldTypes[rule.field]?.type;
            const allowedOperators = fieldType ? triggerOperatorsForType(fieldType) : [];

            return (
              <div
                key={idx}
                className="flex flex-wrap sm:flex-nowrap items-center gap-2 rounded-md border border-border bg-muted/30 p-2"
              >
                {/* Field selector */}
                <div className="w-full sm:w-1/3">
                  {availableFields.length > 0 ? (
                    <select
                      value={rule.field}
                      onChange={(e) => handleFieldChange(idx, e.target.value)}
                      className="h-8 w-full rounded border border-input bg-background px-2 text-xs text-foreground focus:outline-none"
                    >
                      {availableFields.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      placeholder="field (e.g. price)"
                      value={rule.field}
                      className="h-8 text-xs"
                      onChange={(e) => handleFieldChange(idx, e.target.value)}
                    />
                  )}
                </div>

                {/* Operator selector */}
                <div className="w-full sm:w-1/3">
                  <select
                    value={rule.operator}
                    onChange={(e) => handleOperatorChange(idx, e.target.value as TriggerOperator)}
                    className="h-8 w-full rounded border border-input bg-background px-2 text-xs text-foreground focus:outline-none"
                  >
                    <optgroup label="Relative Changes (vs Previous Check)">
                      <option
                        disabled={!allowedOperators.includes(TriggerOperator.PercentageDrop)}
                        value={TriggerOperator.PercentageDrop}
                      >
                        Drops by % or more
                      </option>
                      <option
                        disabled={!allowedOperators.includes(TriggerOperator.PercentageIncrease)}
                        value={TriggerOperator.PercentageIncrease}
                      >
                        Increases by % or more
                      </option>
                      <option
                        disabled={!allowedOperators.includes(TriggerOperator.Decreased)}
                        value={TriggerOperator.Decreased}
                      >
                        Decreased (any drop)
                      </option>
                      <option
                        disabled={!allowedOperators.includes(TriggerOperator.Increased)}
                        value={TriggerOperator.Increased}
                      >
                        Increased (any rise)
                      </option>
                      <option
                        disabled={!allowedOperators.includes(TriggerOperator.Changes)}
                        value={TriggerOperator.Changes}
                      >
                        Changed (any text or value)
                      </option>
                    </optgroup>
                    <optgroup label="Fixed Thresholds & Matches">
                      <option
                        disabled={!allowedOperators.includes(TriggerOperator.LessThan)}
                        value={TriggerOperator.LessThan}
                      >
                        &lt; Less than
                      </option>
                      <option
                        disabled={!allowedOperators.includes(TriggerOperator.LessThanOrEqual)}
                        value={TriggerOperator.LessThanOrEqual}
                      >
                        &le; Less or equal
                      </option>
                      <option
                        disabled={!allowedOperators.includes(TriggerOperator.GreaterThan)}
                        value={TriggerOperator.GreaterThan}
                      >
                        &gt; Greater than
                      </option>
                      <option
                        disabled={!allowedOperators.includes(TriggerOperator.GreaterThanOrEqual)}
                        value={TriggerOperator.GreaterThanOrEqual}
                      >
                        &ge; Greater or equal
                      </option>
                      <option
                        disabled={!allowedOperators.includes(TriggerOperator.Equal)}
                        value={TriggerOperator.Equal}
                      >
                        == Equals
                      </option>
                      <option
                        disabled={!allowedOperators.includes(TriggerOperator.NotEqual)}
                        value={TriggerOperator.NotEqual}
                      >
                        != Not equals
                      </option>
                      <option
                        disabled={!allowedOperators.includes(TriggerOperator.Contains)}
                        value={TriggerOperator.Contains}
                      >
                        Contains text
                      </option>
                      <option
                        disabled={!allowedOperators.includes(TriggerOperator.NotContains)}
                        value={TriggerOperator.NotContains}
                      >
                        Does not contain
                      </option>
                    </optgroup>
                  </select>
                </div>

                {/* Value input */}
                <div className="w-full sm:w-1/3">
                  {(
                    [
                      TriggerOperator.Decreased,
                      TriggerOperator.Increased,
                      TriggerOperator.Changes,
                    ] as TriggerOperator[]
                  ).includes(rule.operator) ? (
                    <div className="h-8 flex items-center px-2.5 rounded border border-input bg-muted/40 text-xs text-muted-foreground italic select-none">
                      Any change detected
                    </div>
                  ) : fieldType === FieldType.Boolean ? (
                    <select
                      value={String(rule.value)}
                      onChange={(e) => handleValueChange(idx, e.target.value === 'true')}
                      className="h-8 w-full rounded border border-input bg-background px-2 text-xs text-foreground focus:outline-none"
                    >
                      <option value="true">True (is true)</option>
                      <option value="false">False (is false)</option>
                    </select>
                  ) : (
                    <Input
                      type={
                        (
                          [
                            TriggerOperator.LessThan,
                            TriggerOperator.LessThanOrEqual,
                            TriggerOperator.GreaterThan,
                            TriggerOperator.GreaterThanOrEqual,
                            TriggerOperator.PercentageDrop,
                            TriggerOperator.PercentageIncrease,
                          ] as TriggerOperator[]
                        ).includes(rule.operator)
                          ? 'number'
                          : 'text'
                      }
                      placeholder={
                        rule.operator === TriggerOperator.PercentageDrop ||
                        rule.operator === TriggerOperator.PercentageIncrease
                          ? 'e.g. 10 (for 10%)'
                          : 'target value'
                      }
                      value={String(rule.value ?? '')}
                      className="h-8 text-xs"
                      onChange={(e) => {
                        const isNum = (
                          [
                            TriggerOperator.LessThan,
                            TriggerOperator.LessThanOrEqual,
                            TriggerOperator.GreaterThan,
                            TriggerOperator.GreaterThanOrEqual,
                            TriggerOperator.PercentageDrop,
                            TriggerOperator.PercentageIncrease,
                          ] as TriggerOperator[]
                        ).includes(rule.operator);

                        handleValueChange(
                          idx,
                          isNum ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value
                        );
                      }}
                    />
                  )}
                </div>

                {/* Remove button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => handleRemoveRule(idx)}
                  title="Remove condition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs mt-1"
            onClick={handleAddRule}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Rule
          </Button>
        </div>
      )}
    </div>
  );
}
