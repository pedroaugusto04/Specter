import type { AlertPayload } from './notification.interface.js';
import { env } from '../../config/env.js';
import { formatEmailDateTime } from '../../utils/dateFormatter.js';
import { escapeHtml } from '../../utils/htmlEscape.js';

/**
 * Builds a responsive, enterprise-grade HTML email with Specter brand identity,
 * clean typography, change comparison tables, and full snapshot details.
 */
export function buildSpecterAlertEmail(payload: AlertPayload): { html: string; text: string } {
  const formattedDate = formatEmailDateTime(payload.detectedAt, payload.timezone);
  const totalChanges = payload.diffSummary.totalChanges;
  const changeNoun = totalChanges === 1 ? 'change detected' : 'changes detected';

  const allChanges = [
    ...payload.diffSummary.modified,
    ...payload.diffSummary.added,
    ...payload.diffSummary.removed,
  ];

  const specterBaseUrl = (env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const specterUrl =
    payload.specterUrl ??
    (payload.jobId
      ? `${specterBaseUrl}/?jobId=${encodeURIComponent(payload.jobId)}`
      : specterBaseUrl);

  const diffRowsHtml = allChanges
    .map((change) => {
      let badgeHtml: string;
      let prevValueHtml: string;
      let currValueHtml: string;

      if (change.changeType === 'MODIFIED') {
        badgeHtml = `<span style="display:inline-block;background-color:#fef3c7;color:#92400e;border:1px solid #fde68a;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:0.3px;">Modified</span>`;
        prevValueHtml = `<span style="color:#71717a;text-decoration:line-through;font-size:13px;word-break:break-all;">${escapeHtml(change.previousValue)}</span>`;
        currValueHtml = `<span style="color:#09090b;font-weight:600;font-size:13px;background-color:#fef9c3;padding:2px 6px;border-radius:4px;word-break:break-all;">${escapeHtml(change.currentValue)}</span>`;
      } else if (change.changeType === 'ADDED') {
        badgeHtml = `<span style="display:inline-block;background-color:#dcfce7;color:#166534;border:1px solid #bbf7d0;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:0.3px;">New</span>`;
        prevValueHtml = `<span style="color:#a1a1aa;font-size:13px;">—</span>`;
        currValueHtml = `<span style="color:#15803d;font-weight:600;font-size:13px;background-color:#dcfce7;padding:2px 6px;border-radius:4px;word-break:break-all;">${escapeHtml(change.currentValue)}</span>`;
      } else {
        badgeHtml = `<span style="display:inline-block;background-color:#fee2e2;color:#991b1b;border:1px solid #fecaca;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:0.3px;">Removed</span>`;
        prevValueHtml = `<span style="color:#dc2626;text-decoration:line-through;font-size:13px;word-break:break-all;">${escapeHtml(change.previousValue)}</span>`;
        currValueHtml = `<span style="color:#a1a1aa;font-size:13px;">—</span>`;
      }

      return `<tr>
        <td style="padding:10px 14px;border-bottom:1px solid #e4e4e7;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;font-weight:600;color:#09090b;">${escapeHtml(change.field)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e4e4e7;white-space:nowrap;">${badgeHtml}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e4e4e7;">${prevValueHtml}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e4e4e7;">${currValueHtml}</td>
      </tr>`;
    })
    .join('');

  const promptBlockHtml = payload.userPrompt
    ? `<tr>
        <td style="padding:6px 0;font-size:12px;color:#71717a;width:140px;font-weight:500;">Instruction:</td>
        <td style="padding:6px 0;font-size:13px;color:#09090b;font-weight:500;">${escapeHtml(payload.userPrompt)}</td>
       </tr>`
    : '';

  const triggerBlockHtml =
    payload.triggerReasons && payload.triggerReasons.length > 0
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 18px;margin-bottom:24px;">
          <tr>
            <td>
              <div style="font-size:12px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">
                Trigger Conditions Met
              </div>
              <ul style="margin:0;padding-left:18px;color:#1e3a8a;font-size:13px;line-height:1.6;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">
                ${payload.triggerReasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}
              </ul>
            </td>
          </tr>
        </table>`
      : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(payload.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#09090b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Container Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;background-color:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,0.04),0 4px 6px -4px rgba(0,0,0,0.02);">
          
          <!-- SPECTER BRAND HEADER -->
          <tr>
            <td style="background-color:#09090b;padding:24px 32px;border-bottom:1px solid #27272a;text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>
                  <td style="vertical-align:middle;padding-right:12px;">
                    <!-- Specter Viewfinder Logo with CID attachment reference -->
                    <img src="cid:specter-logo" width="36" height="36" alt="Specter" style="display:block;border-radius:8px;border:0;outline:none;" />
                  </td>
                  <td style="vertical-align:middle;">
                    <div style="font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;line-height:1;">SPECTER</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ALERT HERO & CONTEXT -->
          <tr>
            <td style="padding:32px 32px 20px 32px;">
              <h1 style="margin:0 0 8px 0;font-size:20px;font-weight:700;color:#09090b;letter-spacing:-0.4px;line-height:1.3;">
                Change detected on monitored target
              </h1>
              <p style="margin:0 0 24px 0;font-size:14px;color:#52525b;line-height:1.6;">
                Specter identified differences in the extracted attributes compared to the previous execution. Review the updated data below:
              </p>

              <!-- Target Metadata Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:16px 20px;margin-bottom:28px;">
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:6px 0;font-size:12px;color:#71717a;width:140px;font-weight:500;">Monitored Target:</td>
                        <td style="padding:6px 0;font-size:13px;word-break:break-word;">
                          ${payload.monitorName ? `${escapeHtml(payload.monitorName)}<br>` : ''}
                          <a href="${escapeHtml(payload.targetUrl)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;font-weight:600;text-decoration:none;">
                            ${escapeHtml(payload.targetUrl)}
                          </a>
                        </td>
                      </tr>
                      ${promptBlockHtml}
                      <tr>
                        <td style="padding:6px 0;font-size:12px;color:#71717a;width:140px;font-weight:500;">Detected At:</td>
                        <td style="padding:6px 0;font-size:13px;color:#09090b;font-weight:500;">${formattedDate}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- TRIGGER REASONS (IF PRESENT) -->
              ${triggerBlockHtml}

              <!-- ATTRIBUTES DIFF TABLE -->
              <div style="margin-bottom:28px;">
                <h2 style="margin:0 0 12px 0;font-size:15px;font-weight:700;color:#09090b;">
                  Change Summary (${totalChanges})
                </h2>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;background-color:#ffffff;">
                  <thead>
                    <tr style="background-color:#fafafa;text-align:left;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">
                      <th style="padding:10px 14px;border-bottom:1px solid #e4e4e7;">Attribute</th>
                      <th style="padding:10px 14px;border-bottom:1px solid #e4e4e7;">Status</th>
                      <th style="padding:10px 14px;border-bottom:1px solid #e4e4e7;">Previous Value</th>
                      <th style="padding:10px 14px;border-bottom:1px solid #e4e4e7;">New Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${diffRowsHtml}
                  </tbody>
                </table>
              </div>

              <!-- ACTION LINK: REDIRECT TO SPECTER -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 28px 0;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(specterUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#09090b;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:11px 22px;border-radius:6px;letter-spacing:-0.2px;">
                      See more on Specter &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- FULL SNAPSHOT (JSON ACCORDION) -->
              <details style="background-color:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:12px 16px;margin-bottom:12px;">
                <summary style="font-size:13px;font-weight:600;color:#3f3f46;cursor:pointer;user-select:none;">
                  View full extracted data snapshot (JSON)
                </summary>
                <div style="margin-top:12px;">
                  <pre style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;background-color:#09090b;color:#fafafa;padding:14px;border-radius:6px;overflow-x:auto;line-height:1.5;">${escapeHtml(JSON.stringify(payload.data, null, 2))}</pre>
                </div>
              </details>
            </td>
          </tr>

          <!-- SPECTER BRAND FOOTER -->
          <tr>
            <td style="background-color:#09090b;padding:28px 32px;border-top:1px solid #27272a;text-align:center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <div style="font-size:13px;font-weight:700;color:#f4f4f5;margin-bottom:6px;">
                      SPECTER
                    </div>
                    <div style="font-size:12px;color:#a1a1aa;line-height:1.6;margin-bottom:12px;">
                      You received this notification because this email was configured to receive alerts for this monitor.
                    </div>
                    <div style="font-size:11px;color:#71717a;">
                      ${formattedDate}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!-- Legal / Automated Note -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;margin-top:16px;">
          <tr>
            <td align="center" style="font-size:11px;color:#a1a1aa;line-height:1.5;">
              This is an automated transactional email generated by your Specter environment. Please do not reply to this message.
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines = [
    `[SPECTER] ${totalChanges} ${changeNoun.toUpperCase()} ON MONITORED TARGET`,
    `============================================================`,
    ``,
    `Monitor: ${payload.monitorName ?? payload.targetUrl}`,
    `Target URL: ${payload.targetUrl}`,
    payload.userPrompt ? `Instruction: ${payload.userPrompt}` : null,
    `Date: ${formattedDate}`,
    ``,
    payload.triggerReasons && payload.triggerReasons.length > 0
      ? `TRIGGER CONDITIONS MET:\n${payload.triggerReasons.map((r) => `- ${r}`).join('\n')}\n`
      : null,
    `CHANGE SUMMARY:`,
    `------------------------------------------------------------`,
    payload.diffSummary.summaryText,
    ``,
    `See more on Specter: ${specterUrl}`,
    ``,
    `------------------------------------------------------------`,
    `Specter`,
    `Automated transactional notification`,
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text: textLines };
}
