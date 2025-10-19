import { getAccessToken } from "@/store/useAuth";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

export class ApiError<T = unknown> extends Error {
  public readonly status: number;
  public readonly body: T | string | null;

  constructor(status: number, body: T | string | null, message?: string) {
    super(message ?? `Request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

export type ApiFetchOptions = RequestInit & {
  auth?: boolean;
};

export async function apiFetch<TResponse>(path: string, options: ApiFetchOptions = {}): Promise<TResponse> {
  const { auth = true, headers, body, ...rest } = options;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${API_BASE_URL}${normalizedPath}`;

  const finalHeaders = new Headers(headers ?? undefined);

  if (auth) {
    const token = getAccessToken();
    if (token) {
      finalHeaders.set("Authorization", `Bearer ${token}`);
    }
  }

  if (body !== undefined && typeof body === "string" && !finalHeaders.has("Content-Type")) {
    finalHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...rest,
    headers: finalHeaders,
    body,
  });

  const responseText = await response.text();

  if (!response.ok) {
    let parsed: unknown = null;
    if (responseText) {
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed = responseText;
      }
    }

    throw new ApiError(response.status, parsed, response.statusText);
  }

  if (!responseText) {
    return undefined as TResponse;
  }

  try {
    return JSON.parse(responseText) as TResponse;
  } catch {
    throw new ApiError(response.status, responseText, "Failed to parse response JSON");
  }
}
