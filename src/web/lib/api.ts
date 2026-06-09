export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let errorBody: Record<string, unknown> = {};
    try {
      errorBody = await response.json() as Record<string, unknown>;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(response.status, (errorBody.error as string | undefined) ?? "unknown_error");
  }
  return response.json();
}

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}
