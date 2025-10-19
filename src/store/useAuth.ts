const AUTH_STORAGE_KEY = "pos.accessToken";
const AUTH_EVENT = "pos-auth-changed";

type AuthChangeDetail = string | null;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getAccessToken(): string | null {
  if (!isBrowser()) {
    return null;
  }

  return window.localStorage.getItem(AUTH_STORAGE_KEY);
}

export function setAccessToken(token: string | null): void {
  if (!isBrowser()) {
    return;
  }

  if (!token) {
    clearAccessToken();
    return;
  }

  window.localStorage.setItem(AUTH_STORAGE_KEY, token);
  emitAuthChange(token);
}

export function clearAccessToken(): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  emitAuthChange(null);
}

function emitAuthChange(token: AuthChangeDetail): void {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(new CustomEvent<AuthChangeDetail>(AUTH_EVENT, { detail: token }));
}

export function subscribeAuthToken(callback: (token: string | null) => void): () => void {
  if (!isBrowser()) {
    return () => undefined;
  }

  const handleCustom: EventListener = (event) => {
    const detail = (event as CustomEvent<AuthChangeDetail>).detail;
    callback(detail ?? getAccessToken());
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === AUTH_STORAGE_KEY) {
      callback(getAccessToken());
    }
  };

  window.addEventListener(AUTH_EVENT, handleCustom);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(AUTH_EVENT, handleCustom);
    window.removeEventListener("storage", handleStorage);
  };
}

declare global {
  interface WindowEventMap {
    "pos-auth-changed": CustomEvent<AuthChangeDetail>;
  }
}
