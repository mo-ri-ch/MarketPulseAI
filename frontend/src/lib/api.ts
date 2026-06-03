/**
 * Authenticated fetch helper.
 *
 * Reads the JWT from localStorage ("access_token") and adds it as a Bearer
 * Authorization header. On 401, clears the token and redirects to /login so
 * the user can re-authenticate.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export function isLoggedIn(): boolean {
  return getToken() !== null;
}

export function logout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("access_token");
  window.location.href = "/login";
}

export class AuthError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "AuthError";
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401) {
    // Token missing/expired — boot to login so the user can re-authenticate
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      // Avoid redirect loops if we're already on /login
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    throw new AuthError();
  }

  return res;
}

export async function apiJson<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed with ${res.status}`);
  }
  return res.json();
}
