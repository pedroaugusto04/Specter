import type { EvalSummary, RateCell } from './summary.js';

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const cellText = (value: string) => value.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

function rateRow(cell: RateCell): string {
  const failure = cell.topFailure ? `${cell.topFailure.outcome} (${cell.topFailure.count})` : '—';
  return `| ${cellText(cell.key)} | ${cell.executions} | ${cell.passed}/${cell.scored} | **${pct(cell.rate)}** | ${pct(cell.ci95[0])}–${pct(cell.ci95[1])} | ${seconds(cell.p50Ms)} | ${seconds(cell.p95Ms)} | ${failure} |`;
}

const RATE_HEADER = [
  '| Valor | Execuções | Sucesso | Taxa | IC 95% | p50 | p95 | Principal falha |',
  '|---|---|---|---|---|---|---|---|',
];

export function renderEvalMarkdown(summary: EvalSummary): string {
  const { meta, overall } = summary;
  const provider = meta.provider.model
    ? `${meta.provider.name} · ${meta.provider.model}`
    : meta.provider.name;
  const lines = [
    `# Specter Evals: ${meta.suite}`,
    '',
    `- **Provider:** ${provider}`,
    `- **Tier:** ${meta.tier}`,
    `- **Repetições por caso:** ${meta.runs}`,
    `- **Início / fim:** ${meta.startedAt} → ${meta.finishedAt}`,
    `- **Node:** ${meta.nodeVersion}`,
    ...(meta.filters && Object.keys(meta.filters).length
      ? [`- **Filtros:** \`${JSON.stringify(meta.filters)}\``]
      : []),
    '',
    '## Consolidado',
    '',
    '| Casos | Execuções | Sucesso | Taxa | IC 95% | pass^k (consistência) | p50 | p95 | Chamadas de modelo/exec |',
    '|---|---|---|---|---|---|---|---|---|',
    `| ${overall.cases} | ${overall.executions} | ${overall.passed}/${overall.scored} | **${pct(overall.rate)}** | ${pct(overall.ci95[0])}–${pct(overall.ci95[1])} | ${overall.consistentCases}/${overall.cases} (${pct(overall.consistency)}) | ${seconds(overall.p50Ms)} | ${seconds(overall.p95Ms)} | ${overall.avgModelCalls?.toFixed(1) ?? '—'} |`,
    '',
    '> Falhas de infraestrutura local (`INFRA`) aparecem nas execuções, mas ficam fora da taxa.',
    '',
  ];

  for (const [dimension, cells] of Object.entries(summary.dimensions))
    lines.push(`## Por ${dimension}`, '', ...RATE_HEADER, ...cells.map(rateRow), '');

  lines.push('## Distribuição de resultados', '', '| Resultado | Execuções |', '|---|---|');
  for (const [outcome, count] of Object.entries(summary.outcomes).sort((a, b) => b[1] - a[1]))
    lines.push(`| ${outcome} | ${count} |`);
  lines.push('');

  if (summary.failures.length) {
    lines.push('## Falhas', '', '| Caso | Run | Resultado | Código | Motivo |', '|---|---|---|---|---|');
    for (const failure of summary.failures)
      lines.push(
        `| ${cellText(failure.caseId)} | ${failure.run} | ${failure.outcome} | ${failure.errorCode ?? '—'} | ${cellText((failure.reason ?? '').slice(0, 220))} |`
      );
    lines.push('');
  }
  return lines.join('\n');
}
