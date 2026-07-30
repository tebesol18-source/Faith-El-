"use client";

/**
 * Client-side authentication helpers.
 * Used by every page component to send authenticated API requests.
 */

export const ADMIN_EMAIL = "admin@coelrodan.com";

export let _authToken: string | null = null;

export function getAuthToken(): string | null {
  if (_authToken) return _authToken;
  if (typeof window !== "undefined") {
    _authToken = localStorage.getItem("coffee_erp_token");
  }
  return _authToken;
}

export function setAuthToken(token: string) {
  _authToken = token;
  if (typeof window !== "undefined") {
    localStorage.setItem("coffee_erp_token", token);
  }
}

export function clearAuthToken() {
  _authToken = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("coffee_erp_token");
  }
}

export function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set("x-auth-token", token);
  }
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url, { ...options, headers });
}

