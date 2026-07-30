/**
 * Structured JSON logger.
 *
 * Every log entry is a single JSON line on stdout/stderr — easy to ship to
 * ELK, Datadog, CloudWatch, or just grep with `jq`.
 *
 * Features:
 *   - Request ID propagation (set once in middleware, included on every log)
 *   - 5 log levels: debug, info, warn, error, fatal
 *   - Automatic redaction of sensitive fields (password, token, password_hash)
 *   - Optional context object merged into every log line
 *   - Works in both server (Node) and edge (middleware) runtimes
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("User logged in", { userId: "abc", email: "x@y.com" });
 *   logger.error("DB write failed", { table: "operators", error: err.message });
 *
 * In a route handler, use the request-scoped logger to get the request ID:
 *   import { getRequestLogger } from "@/lib/logger";
 *   const log = getRequestLogger(request);
 *   log.info("Processing lead research", { country: "Germany" });
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  userId?: string;
  [key: string]: any;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

/** Read the minimum log level from env (default: "info" in prod, "debug" in dev). */
function getMinLevel(): LogLevel {
  const env = process.env.LOG_LEVEL as LogLevel | undefined;
  if (env && env in LEVEL_PRIORITY) return env;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/** Fields that get redacted (replaced with "[REDACTED]") in every log entry. */
const SENSITIVE_FIELDS = new Set([
  "password",
  "oldPassword",
  "newPassword",
  "token",
  "authToken",
  "sessionToken",
  "password_hash",
  "passwordHash",
  "authorization",
  "cookie",
  "secret",
  "apiKey",
  "api_key",
]);

function redactSensitive(value: any, depth = 0): any {
  if (depth > 5) return "[max-depth]";  // prevent infinite recursion on circular refs
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactSensitive(v, depth + 1));

  const redacted: Record<string, any> = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_FIELDS.has(key)) {
      redacted[key] = "[REDACTED]";
    } else {
      redacted[key] = redactSensitive(val, depth + 1);
    }
  }
  return redacted;
}

/**
 * Per-request context storage.
 *
 * Uses Node's AsyncLocalStorage when available (proper request isolation
 * across async boundaries), falls back to a module-level global otherwise.
 *
 * The fallback is imperfect — concurrent requests can interleave — but
 * it's better than nothing in edge runtimes that don't support AsyncLocalStorage.
 */
// AsyncLocalStorage is Node-only — lazy-load so this file can be imported
// from Edge runtime (middleware) without crashing. The actual storage is
// only used in route handlers (Node runtime).
let _asyncStorage: any = null;
function getAsyncStorage(): any {
  if (_asyncStorage !== null) return _asyncStorage;
  try {
    // Only attempt the require in Node runtime
    if (typeof process !== "undefined" && process.versions?.node) {
      const { AsyncLocalStorage } = require("async_hooks");
      _asyncStorage = new AsyncLocalStorage();
    } else {
      _asyncStorage = false;  // Edge runtime — not available
    }
  } catch {
    _asyncStorage = false;
  }
  return _asyncStorage;
}

// Fallback global context (used when AsyncLocalStorage isn't available)
let _globalRequestId: string | null = null;
let _globalUserId: string | null = null;

interface RequestContext {
  requestId?: string;
  userId?: string;
}

export function setRequestContext(requestId: string, userId?: string) {
  if (_asyncStorage) {
    // AsyncLocalStorage version — caller should use .run() instead
    _globalRequestId = requestId;
    _globalUserId = userId || null;
  } else {
    _globalRequestId = requestId;
    _globalUserId = userId || null;
  }
}

export function clearRequestContext() {
  _globalRequestId = null;
  _globalUserId = null;
}

/**
 * Run a callback within a request context. Uses AsyncLocalStorage when
 * available so the context propagates across async boundaries.
 *
 * In middleware, wrap the response like:
 *   return runWithRequestContext(requestId, () => handler(request));
 *
 * In a route handler, you usually don't need this — the middleware already
 * set the context, just call getRequestLogger(request) to read it.
 */
export function runWithRequestContext<T>(
  ctx: RequestContext,
  fn: () => T
): T {
  const storage = getAsyncStorage();
  if (storage) {
    return storage.run(ctx, fn);
  }
  // Fallback — set globals (imperfect, but better than nothing)
  const prevReq = _globalRequestId;
  const prevUser = _globalUserId;
  _globalRequestId = ctx.requestId || null;
  _globalUserId = ctx.userId || null;
  try {
    return fn();
  } finally {
    _globalRequestId = prevReq;
    _globalUserId = prevUser;
  }
}

function getCurrentContext(): RequestContext {
  const storage = getAsyncStorage();
  if (storage) {
    const store = storage.getStore();
    if (store) return store;
  }
  return {
    requestId: _globalRequestId || undefined,
    userId: _globalUserId || undefined,
  };
}

/** Generate a request ID (8-char hex, readable in logs). */
export function generateRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID().split("-")[0];  // first segment = 8 chars
  }
  return Math.random().toString(16).substring(2, 10);
}

/** Format a timestamp in ISO 8601 with milliseconds. */
function timestamp(): string {
  return new Date().toISOString();
}

/** Core log function — emits a single JSON line.
 *
 *  Uses console.log/console.error which work in both Node and Edge runtimes.
 *  In Node, these write to stdout/stderr; in Edge (middleware), they're
 *  captured by the platform's logging infrastructure.
 */
function log(level: LogLevel, message: string, context?: Record<string, any>) {
  const minLevel = getMinLevel();
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return;

  const ctx = getCurrentContext();
  const entry: LogEntry = {
    timestamp: timestamp(),
    level,
    message,
    ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
    ...(ctx.userId ? { userId: ctx.userId } : {}),
    ...(context ? redactSensitive(context) : {}),
  };

  // Use console.* — works in both Node and Edge runtimes.
  // In Node: writes to stdout/stderr.
  // In Edge: captured by the platform's logging.
  const line = JSON.stringify(entry);
  if (level === "error" || level === "fatal") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/** Public logger API. */
export const logger = {
  debug(message: string, context?: Record<string, any>) {
    log("debug", message, context);
  },
  info(message: string, context?: Record<string, any>) {
    log("info", message, context);
  },
  warn(message: string, context?: Record<string, any>) {
    log("warn", message, context);
  },
  error(message: string, context?: Record<string, any>) {
    log("error", message, context);
  },
  fatal(message: string, context?: Record<string, any>) {
    log("fatal", message, context);
  },
};

/**
 * Get a request-scoped logger.
 *
 * Reads the request ID from the `x-request-id` header (set by middleware)
 * or the current AsyncLocalStorage context.
 *
 * Usage in a route handler:
 *   export async function GET(request: NextRequest) {
 *     const log = getRequestLogger(request);
 *     log.info("Fetching dashboard data");
 *     ...
 *   }
 */
export function getRequestLogger(request: Request) {
  const headerRequestId = request.headers.get("x-request-id") || undefined;
  const ctx = getCurrentContext();
  const requestId = headerRequestId || ctx.requestId;
  const userId = ctx.userId;

  return {
    debug(message: string, context?: Record<string, any>) {
      log("debug", message, { ...context, requestId });
    },
    info(message: string, context?: Record<string, any>) {
      log("info", message, { ...context, requestId });
    },
    warn(message: string, context?: Record<string, any>) {
      log("warn", message, { ...context, requestId });
    },
    error(message: string, context?: Record<string, any>) {
      log("error", message, { ...context, requestId });
    },
    fatal(message: string, context?: Record<string, any>) {
      log("fatal", message, { ...context, requestId });
    },
    /** Attach a user ID to subsequent log entries from this logger. */
    withUser(userId: string) {
      return {
        debug: (m: string, c?: Record<string, any>) => log("debug", m, { ...c, requestId, userId }),
        info: (m: string, c?: Record<string, any>) => log("info", m, { ...c, requestId, userId }),
        warn: (m: string, c?: Record<string, any>) => log("warn", m, { ...c, requestId, userId }),
        error: (m: string, c?: Record<string, any>) => log("error", m, { ...c, requestId, userId }),
        fatal: (m: string, c?: Record<string, any>) => log("fatal", m, { ...c, requestId, userId }),
      };
    },
  };
}

export type RequestLogger = ReturnType<typeof getRequestLogger>;
