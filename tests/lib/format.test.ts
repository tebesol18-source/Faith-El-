/**
 * Tests for src/lib/format.ts
 * Verifies the date/time formatting helpers produce correct output.
 */
import { describe, it, expect } from "vitest";
import {
  relativeTime,
  formatDate,
  formatTimestamp,
  messageTime,
  daysUntil,
  countryFlag,
} from "@/lib/format";

describe("lib/format", () => {
  describe("relativeTime", () => {
    it("returns 'Never' for null input", () => {
      expect(relativeTime(null)).toBe("Never");
    });

    it("returns 'Just now' for timestamps less than 1 minute old", () => {
      const now = new Date(Date.now() - 30_000).toISOString(); // 30s ago
      expect(relativeTime(now)).toBe("Just now");
    });

    it("returns 'Xm ago' for timestamps less than 1 hour old", () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
      expect(relativeTime(fiveMinAgo)).toBe("5m ago");
    });

    it("returns 'Xh ago' for timestamps less than 1 day old", () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
      expect(relativeTime(threeHoursAgo)).toBe("3h ago");
    });

    it("returns 'Xd ago' for timestamps less than 1 month old", () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60_000).toISOString();
      expect(relativeTime(fiveDaysAgo)).toBe("5d ago");
    });

    it("returns 'Xmo ago' for timestamps less than 1 year old", () => {
      const twoMonthsAgo = new Date(Date.now() - 65 * 24 * 60 * 60_000).toISOString();
      expect(relativeTime(twoMonthsAgo)).toBe("2mo ago");
    });

    it("returns 'Xy ago' for timestamps over 1 year old", () => {
      const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60_000).toISOString();
      expect(relativeTime(twoYearsAgo)).toBe("2y ago");
    });

    it("returns 'Just now' for future timestamps", () => {
      const future = new Date(Date.now() + 60_000).toISOString();
      expect(relativeTime(future)).toBe("Just now");
    });
  });

  describe("formatDate", () => {
    it("returns null for null input", () => {
      expect(formatDate(null)).toBeNull();
    });

    it("formats a date as 'Mon DD'", () => {
      const result = formatDate("2026-07-15T10:00:00Z");
      // Should be "Jul 15" or "Jul 16" depending on timezone
      expect(result).toMatch(/^Jul 1[56]$/);
    });
  });

  describe("formatTimestamp", () => {
    it("returns '—' for null input", () => {
      expect(formatTimestamp(null)).toBe("—");
    });

    it("formats a timestamp with month, day, hour, minute", () => {
      const result = formatTimestamp("2026-07-15T10:30:00Z");
      // Should contain "Jul" and "15" or "16"
      expect(result).toMatch(/Jul 1[56]/);
      // Should contain a time component
      expect(result).toMatch(/\d{1,2}:\d{2}/);
    });
  });

  describe("messageTime", () => {
    it("returns '—' for null input", () => {
      expect(messageTime(null)).toBe("—");
    });

    it("returns 'Today HH:MM AM/PM' for timestamps from today", () => {
      const today = new Date().toISOString();
      const result = messageTime(today);
      expect(result).toMatch(/^Today \d{1,2}:\d{2} (AM|PM)$/);
    });

    it("returns 'Yesterday HH:MM AM/PM' for timestamps from yesterday", () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const result = messageTime(yesterday);
      // Could be "Yesterday HH:MM AM/PM" or "Mon DD HH:MM AM/PM" depending on exact time
      expect(result).toMatch(/^(Yesterday|Jul \d{1,2}) \d{1,2}:\d{2} (AM|PM)$/);
    });
  });

  describe("daysUntil", () => {
    it("returns null for null input", () => {
      expect(daysUntil(null)).toBeNull();
    });

    it("returns positive number for future dates", () => {
      const sevenDaysAhead = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
      const result = daysUntil(sevenDaysAhead);
      expect(result).not.toBeNull();
      expect(result!).toBeGreaterThanOrEqual(6);
      expect(result!).toBeLessThanOrEqual(8);
    });

    it("returns negative number for past dates", () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
      const result = daysUntil(sevenDaysAgo);
      expect(result).not.toBeNull();
      expect(result!).toBeLessThanOrEqual(-6);
      expect(result!).toBeGreaterThanOrEqual(-8);
    });

    it("returns 0 or near-0 for today", () => {
      const now = new Date().toISOString();
      const result = daysUntil(now);
      expect(result).not.toBeNull();
      expect(Math.abs(result!)).toBeLessThanOrEqual(1);
    });
  });

  describe("countryFlag", () => {
    it("returns 🌍 for null input", () => {
      expect(countryFlag(null)).toBe("🌍");
    });

    it("returns 🌍 for unknown country", () => {
      expect(countryFlag("Atlantis")).toBe("🌍");
    });

    it("returns correct flag for known countries", () => {
      expect(countryFlag("Germany")).toBe("🇩🇪");
      expect(countryFlag("United Kingdom")).toBe("🇬🇧");
      expect(countryFlag("USA")).toBe("🇺🇸");
      expect(countryFlag("Japan")).toBe("🇯🇵");
      expect(countryFlag("Italy")).toBe("🇮🇹");
      expect(countryFlag("France")).toBe("🇫🇷");
      expect(countryFlag("Belgium")).toBe("🇧🇪");
      expect(countryFlag("Sweden")).toBe("🇸🇪");
      expect(countryFlag("South Korea")).toBe("🇰🇷");
      expect(countryFlag("Netherlands")).toBe("🇳🇱");
    });

    it("returns correct flag for ISO country codes", () => {
      expect(countryFlag("DE")).toBe("🇩🇪");
      expect(countryFlag("GB")).toBe("🇬🇧");
      expect(countryFlag("US")).toBe("🇺🇸");
    });
  });
});
