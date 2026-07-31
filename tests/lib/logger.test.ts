/**
 * Tests for src/lib/logger.ts
 *
 * Verifies structured JSON output, log levels, request ID propagation,
 * and sensitive field redaction.
 *
 * Note: these tests capture stdout/stderr. They're a bit hacky but work
 * for verifying the logger's contract.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { logger, getRequestLogger, generateRequestId, setRequestContext, clearRequestContext } from "@/lib/logger";

// Helper: capture stdout writes for the duration of a test
function captureConsole() {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const logs: string[] = [];
  const warns: string[] = [];
  const errors: string[] = [];

  console.log = (...args: any[]) => { logs.push(args.join(" ")); };
  console.warn = (...args: any[]) => { warns.push(args.join(" ")); };
  console.error = (...args: any[]) => { errors.push(args.join(" ")); };

  return {
    logs,
    warns,
    errors,
    restore() {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    },
  };
}

function parseLogLine(line: string): any {
  try { return JSON.parse(line); } catch { return null; }
}

describe("lib/logger", () => {
  let capture: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    capture = captureConsole();
    clearRequestContext();
  });

  afterEach(() => {
    capture.restore();
  });

  describe("basic logging", () => {
    it("logger.info writes a JSON line to stdout", () => {
      logger.info("test message", { foo: "bar" });
      expect(capture.logs.length).toBe(1);
      const entry = parseLogLine(capture.logs[0]);
      expect(entry).not.toBeNull();
      expect(entry.level).toBe("info");
      expect(entry.message).toBe("test message");
      expect(entry.foo).toBe("bar");
      expect(entry.timestamp).toBeTruthy();
    });

    it("logger.warn writes to console.warn", () => {
      logger.warn("warning", { code: 42 });
      expect(capture.warns.length).toBe(1);
      const entry = parseLogLine(capture.warns[0]);
      expect(entry.level).toBe("warn");
    });

    it("logger.error writes to console.error", () => {
      logger.error("error", { code: 500 });
      expect(capture.errors.length).toBe(1);
      const entry = parseLogLine(capture.errors[0]);
      expect(entry.level).toBe("error");
    });

    it("logger.debug writes to stdout (in dev mode)", () => {
      logger.debug("debug msg");
      // In dev mode (default), debug is enabled
      expect(capture.logs.length).toBe(1);
    });
  });

  describe("log levels", () => {
    it("each level has the correct priority", () => {
      // info should be emitted, debug may or may not be (depends on env)
      logger.info("info test");
      logger.warn("warn test");
      logger.error("error test");

      expect(capture.logs.length).toBeGreaterThanOrEqual(1);  // info
      expect(capture.warns.length).toBe(1);  // warn
      expect(capture.errors.length).toBe(1);  // error
    });
  });

  describe("redaction of sensitive fields", () => {
    it("redacts password", () => {
      logger.info("user login", { email: "x@y.com", password: "secret123" });
      const entry = parseLogLine(capture.logs[0]);
      expect(entry.password).toBe("[REDACTED]");
      expect(entry.email).toBe("x@y.com");  // non-sensitive preserved
    });

    it("redacts newPassword", () => {
      logger.info("password change", { newPassword: "NewPass123" });
      const entry = parseLogLine(capture.logs[0]);
      expect(entry.newPassword).toBe("[REDACTED]");
    });

    it("redacts token", () => {
      logger.info("auth", { token: "abc123def456" });
      const entry = parseLogLine(capture.logs[0]);
      expect(entry.token).toBe("[REDACTED]");
    });

    it("redacts password_hash", () => {
      logger.info("db row", { password_hash: "$2b$10$..." });
      const entry = parseLogLine(capture.logs[0]);
      expect(entry.password_hash).toBe("[REDACTED]");
    });

    it("redacts nested sensitive fields", () => {
      logger.info("complex", {
        user: { email: "x@y.com", password: "secret" },
        meta: { token: "abc", nested: { password: "deep" } },
      });
      const entry = parseLogLine(capture.logs[0]);
      expect(entry.user.password).toBe("[REDACTED]");
      expect(entry.user.email).toBe("x@y.com");
      expect(entry.meta.token).toBe("[REDACTED]");
      expect(entry.meta.nested.password).toBe("[REDACTED]");
    });

    it("redacts arrays of objects with sensitive fields", () => {
      logger.info("list", {
        users: [
          { email: "a@b.com", password: "p1" },
          { email: "c@d.com", password: "p2" },
        ],
      });
      const entry = parseLogLine(capture.logs[0]);
      expect(entry.users[0].password).toBe("[REDACTED]");
      expect(entry.users[1].password).toBe("[REDACTED]");
    });
  });

  describe("request context", () => {
    it("includes requestId when set via setRequestContext", () => {
      setRequestContext("req-abc123", "user-xyz");
      logger.info("with context");
      const entry = parseLogLine(capture.logs[0]);
      expect(entry.requestId).toBe("req-abc123");
      expect(entry.userId).toBe("user-xyz");
    });

    it("does not include requestId when context is cleared", () => {
      clearRequestContext();
      logger.info("no context");
      const entry = parseLogLine(capture.logs[0]);
      expect(entry.requestId).toBeUndefined();
    });
  });

  describe("getRequestLogger", () => {
    it("extracts request ID from x-request-id header", () => {
      const request = new Request("https://example.com", {
        headers: new Headers({ "x-request-id": "hdr-123" }),
      });
      const log = getRequestLogger(request);
      log.info("from handler");
      const entry = parseLogLine(capture.logs[0]);
      expect(entry.requestId).toBe("hdr-123");
    });

    it("withUser attaches userId to subsequent logs", () => {
      const request = new Request("https://example.com");
      const log = getRequestLogger(request).withUser("user-789");
      log.info("user action");
      const entry = parseLogLine(capture.logs[0]);
      expect(entry.userId).toBe("user-789");
    });
  });

  describe("generateRequestId", () => {
    it("returns an 8-char hex string", () => {
      const id = generateRequestId();
      expect(id).toMatch(/^[a-f0-9]{8}$/);
    });

    it("returns unique values on subsequent calls", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) ids.add(generateRequestId());
      // Extremely unlikely to have collisions in 100 calls
      expect(ids.size).toBe(100);
    });
  });
});
