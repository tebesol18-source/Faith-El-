/**
 * Shared formatting utilities.
 * Eliminates date/time formatting duplication across API routes.
 */

/** ISO timestamp → "2h ago" / "5d ago" / "Never" */
export function relativeTime(ts: string | null): string {
  if (!ts) return "Never";
  try {
    const then = new Date(ts).getTime();
    const now = Date.now();
    const diffMs = now - then;
    if (diffMs < 0) return "Just now";
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  } catch {
    return "—";
  }
}

/** ISO timestamp → "Mon DD" (e.g. "Jul 03") */
export function formatDate(ts: string | null): string | null {
  if (!ts) return null;
  try {
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return null;
  }
}

/** ISO timestamp → "YYYY-MM-DD HH:MM:SS" (matches backend format_ts) */
export function formatTimestamp(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
    });
  } catch {
    return "—";
  }
}

/** ISO timestamp → "Today 10:24 AM" / "Yesterday 4:30 PM" */
export function messageTime(ts: string | null): string {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    if (isToday) return `Today ${time}`;
    if (isYesterday) return `Yesterday ${time}`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ` ${time}`;
  } catch {
    return "—";
  }
}

/** Days until a date (null if no date) */
export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  try {
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  } catch {
    return null;
  }
}

/** Get country flag emoji */
export function countryFlag(country: string | null): string {
  if (!country) return "🌍";
  const flags: Record<string, string> = {
    Germany: "🇩🇪", "United Kingdom": "🇬🇧", USA: "🇺🇸", Japan: "🇯🇵",
    Italy: "🇮🇹", France: "🇫🇷", Belgium: "🇧🇪", Sweden: "🇸🇪",
    "South Korea": "🇰🇷", Netherlands: "🇳🇱", DE: "🇩🇪", GB: "🇬🇧", US: "🇺🇸",
  };
  return flags[country] || "🌍";
}
