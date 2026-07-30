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

/** AsyncLocalStorage-style context — uses a simple global for now.
 *  In a future refactor, replace with `async_hooks` for proper request isolation. */
let _currentRequestId: string | null = null;
let _currentUserId: string | null = null;

export function setRequestContext(requestId: string, userId?: string) {
  _currentRequestId = requestId;
  _currentUserId = userId || null;
}

export function clearRequestContext() {
  _currentRequestId = null;
  _currentUserId = null;
}

/** Generate a request ID (8-char hex, readable in logs). */
export function generateRequestId(): string {
  // Use crypto.randomUUID if available, fall back to Math.random
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID().split("-")[0];  // first segment = 8 chars
  }
  return Math.random().toString(16).substring(2, 10);
}

/** Format a timestamp in ISO 8601 with milliseconds. */
function timestamp(): string {
  return new Date().toISOString();
}

/** Core log function — emits a single JSON line. */
function log(level: LogLevel, message: string, context?: Record<string, any>) {
  const minLevel = getMinLevel();
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return;

  const entry: LogEntry = {
    timestamp: timestamp(),
    level,
    message,
    ...( _currentRequestId ? { requestId: _currentRequestId } : {}),
    ...( _currentUserId ? { userId: _currentUserId } : {}),
    ...(context ? redactSensitive(context) : {}),
  };

  // fatal + error go to stderr; others go to stdout
  const stream = level === "error" || level === "fatal" ? process.stderr : process.stdout;
  stream.write(JSON.stringify(entry) + "\n");
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
 * In Next.js, the `request` object doesn't carry our context directly, but
 * we can extract the request ID from the `x-request-id` header (set by
 * middleware) and set it as the current context for the duration of the
 * request.
 *
 * Usage in a route handler:
 *   export async function GET(request: NextRequest) {
 *     const log = getRequestLogger(request);
 *     log.info("Fetching dashboard data");
 *     ...
 *   }
 */
export function getRequestLogger(request: Request) {
  const requestId = request.headers.get("x-request-id") || _currentRequestId || undefined;
  const userId = _currentUserId || undefined;

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
