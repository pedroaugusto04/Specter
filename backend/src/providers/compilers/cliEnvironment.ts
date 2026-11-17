/** Only CLI runtime/authentication settings cross the subprocess boundary. */
export function compilerEnvironment(
  provider: string,
  source: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const runtime = [
    'PATH',
    'HOME',
    'USER',
    'LOGNAME',
    'LANG',
    'LC_ALL',
    'TMPDIR',
    'TMP',
    'TEMP',
    'SystemRoot',
    'COMSPEC',
    'PATHEXT',
    'HTTPS_PROXY',
    'HTTP_PROXY',
    'ALL_PROXY',
    'NO_PROXY',
    'https_proxy',
    'http_proxy',
    'all_proxy',
    'no_proxy',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'NODE_EXTRA_CA_CERTS',
  ];
  const credentials =
    provider === 'codex'
      ? [
          'CODEX_HOME',
          'OPENAI_API_KEY',
          'CODEX_API_KEY',
          'OPENAI_BASE_URL',
          'OPENAI_ORG_ID',
          'OPENAI_PROJECT_ID',
        ]
      : provider === 'agy'
        ? [
            'XDG_CONFIG_HOME',
            'XDG_DATA_HOME',
            'GOOGLE_API_KEY',
            'GEMINI_API_KEY',
            'ANTHROPIC_API_KEY',
            'OPENAI_API_KEY',
          ]
        : [];
  return Object.fromEntries(
    [...runtime, ...credentials]
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]])
  );
}
