/* Public copy only. Never include exception messages or provider responses here. */
export const USER_FAILURES = Object.freeze({
  resourceUnavailable: {
    title: 'Service Temporarily Busy',
    description: 'We are handling many checks right now. Please try again later.',
    nextStep: 'Wait a few minutes, then try again.',
  },
  responseTooLarge: {
    title: 'Page Response Too Large',
    description: 'The website response is too large to process safely.',
    nextStep: 'Monitor a more specific page or section with less content.',
  },
  accessBlocked: {
    title: 'Website Access Blocked',
    description:
      'The website is blocking access right now. Try again later or connect an authenticated session.',
    nextStep: 'Try again later. If the page requires sign-in, reconnect your website session.',
  },
  requestTimedOut: {
    title: 'Website Took Too Long to Respond',
    description: 'The website took too long to respond. Please try again later.',
    nextStep: 'Check that the page opens in your browser, then try again.',
  },
  requestedDataUnavailable: {
    title: 'Requested Information Not Found',
    description:
      'The requested information could not be verified on the page. Check the instructions and try again.',
    nextStep: 'Check the page address and describe clearly which information you want to monitor.',
  },
  setupTimedOut: {
    title: 'Monitor Setup Took Too Long',
    description: 'Monitor setup took too long to complete. Please try again.',
    nextStep: 'Try setting up the monitor again. Simplifying the instructions may help.',
  },
  compilerRateLimited: {
    title: 'Setup Temporarily Busy',
    description: 'Monitor setup is temporarily busy. Please try again later.',
    nextStep: 'Wait a few minutes before trying again.',
  },
  setupUnavailable: {
    title: 'Monitor Setup Unavailable',
    description: 'We could not set up the monitor right now. Please try again later.',
    nextStep: 'Try again later. If this continues, contact support.',
  },
  configurationRejected: {
    title: 'Monitor Setup Could Not Be Verified',
    description:
      'We could not confirm that this monitor will track the requested information reliably.',
    nextStep:
      'Check that the information is visible on the page and clarify your monitoring instructions.',
  },
  websiteUnavailable: {
    title: 'Website Unavailable',
    description: 'We could not reach the website or open the requested page.',
    nextStep:
      'Check that the page address is correct and the website is available, then try again.',
  },
  sessionUnavailable: {
    title: 'Website Session Needs Attention',
    description: 'The authenticated web session for this website has expired or redirected to login.',
    nextStep:
      'Open the website in your browser and reconnect your session using the Specter Companion extension.',
  },
  unsupported: {
    title: 'Page Cannot Be Monitored Yet',
    description: 'This page requires a feature that is not currently supported.',
    nextStep: 'Try a different page containing the same information or contact support.',
  },
  executionInterrupted: {
    title: 'Check Interrupted',
    description: 'This check was interrupted before it could finish.',
    nextStep: 'Try again. If this continues, contact support.',
  },
  planLimitReached: {
    title: 'Plan Limit Reached',
    description: 'You have reached your account plan limit for this action.',
    nextStep: 'Check your current plan usage or pause unused monitors.',
  },
  requestFailed: {
    title: 'Request Could Not Be Completed',
    description: 'We could not complete this request. Please try again later.',
    nextStep: 'Try again later. If the problem continues, contact support.',
  },
});

export function formatStructuredUserFailure(failure) {
  return JSON.stringify({
    title: failure.title,
    description: failure.description,
    nextStep: failure.nextStep,
  });
}

export function parseStructuredUserFailure(message) {
  if (typeof message === 'string' && message.startsWith('{') && message.endsWith('}')) {
    try {
      const parsed = JSON.parse(message);
      if (parsed && typeof parsed.description === 'string' && typeof parsed.nextStep === 'string') {
        return {
          title:
            typeof parsed.title === 'string' && parsed.title.trim()
              ? parsed.title.trim()
              : USER_FAILURES.configurationRejected.title,
          description: parsed.description.trim(),
          nextStep: parsed.nextStep.trim(),
        };
      }
    } catch {
      // Fallback to static matching
    }
  }
  return null;
}

export function getUserFailure(message) {
  if (!message) return USER_FAILURES.requestFailed;
  const structured = parseStructuredUserFailure(message);
  if (structured) return structured;
  const match = Object.values(USER_FAILURES).find((failure) => failure.description === message);
  if (match) return match;
  if (/limit reached|quota exceeded/i.test(message)) {
    return {
      title: USER_FAILURES.planLimitReached.title,
      description: message,
      nextStep: USER_FAILURES.planLimitReached.nextStep,
    };
  }
  return USER_FAILURES.requestFailed;
}
