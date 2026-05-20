export async function readApiJson<T>(response: Response): Promise<T | null> {
  const rawText = await response.text();
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    return null;
  }
}

export async function readApiError(
  response: Response,
  fallback: string
): Promise<string> {
  const data = await readApiJson<{ error?: unknown; message?: unknown }>(response);

  if (typeof data?.error === "string" && data.error.trim()) {
    return data.error;
  }

  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message;
  }

  return fallback;
}
