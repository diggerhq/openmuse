// The browser's view of the app's routes: JSON in and out, the CSRF token on
// every request, and a redirect to the login page when the cookie is gone.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function apiFetch(csrf: string): typeof fetch {
  return async (input, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("x-csrf-token", csrf);
    const response = await fetch(input, { ...init, headers });
    if (response.status === 401 && typeof window !== "undefined") window.location.assign("/login");
    return response;
  };
}

export async function api<T>(csrf: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(csrf)(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = body.error;
    const message =
      typeof error === "string"
        ? error
        : typeof error === "object" && error && "message" in error
          ? String((error as { message: unknown }).message)
          : `Request failed (${response.status})`;
    throw new ApiError(response.status, message, body);
  }
  return body as T;
}
