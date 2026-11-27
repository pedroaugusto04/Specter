import { Langfuse } from 'langfuse';

let langfuseInstance: Langfuse | null = null;
let isInitialized = false;

export type ManagedPromptClient = Parameters<
  NonNullable<ReturnType<Langfuse['trace']>>['generation']
>[0]['prompt'];

export function getLangfuse(): Langfuse | null {
  if (isInitialized) {
    return langfuseInstance;
  }

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
  const baseUrl = (
    process.env.LANGFUSE_BASE_URL ||
    process.env.LANGFUSE_BASEURL ||
    'http://127.0.0.1:3000'
  ).trim();

  if (!publicKey || !secretKey) {
    isInitialized = true;
    langfuseInstance = null;
    return null;
  }

  try {
    langfuseInstance = new Langfuse({ publicKey, secretKey, baseUrl });
  } catch {
    langfuseInstance = null;
  }

  isInitialized = true;
  return langfuseInstance;
}

export async function resolveManagedPrompt(
  name: string,
  fallback: string
): Promise<{ text: string; promptClient?: ManagedPromptClient }> {
  const langfuse = getLangfuse();
  if (!langfuse) {
    return { text: fallback };
  }

  try {
    const fetched = await langfuse.getPrompt(name, undefined, {
      type: 'text',
      fallback,
      cacheTtlSeconds: 300,
    });
    if (fetched.isFallback) {
      langfuse
        .createPrompt({
          name,
          type: 'text',
          prompt: fallback,
          labels: ['production'],
        })
        .catch(() => {});
    }
    return {
      text: fetched.compile() || fallback,
      promptClient: fetched,
    };
  } catch {
    return { text: fallback };
  }
}

export async function getManagedPrompt(name: string, fallback: string): Promise<string> {
  const resolved = await resolveManagedPrompt(name, fallback);
  return resolved.text;
}
