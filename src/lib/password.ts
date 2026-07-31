/**
 * Password hashing utilities.
 *
 * Uses bcryptjs (pure-JS implementation of bcrypt) so we don't need native
 * compilation. Cost factor 10 gives ~50ms per hash on a typical machine,
 * which is fast enough for low-volume auth (operators, not public signups).
 *
 * For high-volume public signups, switch to `argon2` (native, but more
 * modern + memory-hard) — needs a build step.
 *
 * IMPORTANT: Never log hashes, never return them in API responses, and
 * never store plaintext passwords anywhere.
 */

import bcrypt from "bcryptjs";

/** Bcrypt cost factor. Higher = slower but more secure.
 *  10 = ~50ms per hash (good for low-volume admin/operator auth)
 *  12 = ~200ms per hash (better for public-facing apps)
 *  Changing this only affects NEW hashes — existing hashes retain their
 *  original cost factor and continue to verify correctly.
 *
 *  Override via BCRYPT_COST env var (see .env.example).
 */
const BCRYPT_COST = (() => {
  const env = parseInt(process.env.BCRYPT_COST || "10", 10);
  if (isNaN(env) || env < 4 || env > 31) return 10;  // bcrypt limits: 4-31
  return env;
})();

/** Minimum password length accepted by the login route.
 *  Passwords shorter than this are rejected up-front before bcrypt runs
 *  (avoids wasting CPU on obviously-invalid input).
 */
export const MIN_PASSWORD_LENGTH = 1;

/** Maximum password length accepted by the login route.
 *  bcrypt itself truncates at 72 bytes; we cap at 200 chars to allow for
 *  passphrases while preventing DoS via huge password strings.
 */
export const MAX_PASSWORD_LENGTH = 200;

/**
 * Hash a plaintext password using bcrypt.
 *
 * @param password  The plaintext password (1-200 chars).
 * @returns         A bcrypt hash string like "$2a$10$..." (60 chars).
 *
 * @throws if password is empty or > 200 chars.
 */
export function hashPassword(password: string): string {
  if (!password || typeof password !== "string") {
    throw new Error("Password is required");
  }
  if (password.length < 1) {
    throw new Error("Password cannot be empty");
  }
  if (password.length > 200) {
    throw new Error("Password too long (max 200 chars)");
  }
  // bcryptjs's hashSync is fine here — the cost is ~50ms which is acceptable
  // for an admin-side operation. For high-volume flows, use hash() (async).
  return bcrypt.hashSync(password, BCRYPT_COST);
}

/**
 * Verify a plaintext password against a stored bcrypt hash.
 *
 * @param password     The plaintext password the user typed.
 * @param passwordHash The hash from the database (e.g. "$2a$10$...").
 * @returns            true if the password matches the hash, false otherwise.
 *                     Also returns false if either argument is missing or
 *                     the hash is malformed (defensive — never throw on
 *                     bad input, just deny).
 */
export function verifyPassword(password: string, passwordHash: string | null | undefined): boolean {
  if (!password || typeof password !== "string") return false;
  if (!passwordHash || typeof passwordHash !== "string") return false;
  // A valid bcrypt hash is 60 chars and starts with $2a$, $2b$, or $2y$
  if (passwordHash.length !== 60 || !/^\$2[aby]\$/.test(passwordHash)) {
    return false;
  }
  try {
    return bcrypt.compareSync(password, passwordHash);
  } catch {
    return false;
  }
}

/**
 * Generate a random temporary password (for admin-initiated resets).
 *
 * Returns a 16-char password with mixed case + digits + symbols.
 * Suitable for sharing with a new operator out-of-band (email/phone).
 */
export function generateTempPassword(length = 16): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let pwd = "";
  // Use crypto.getRandomValues for cryptographic randomness
  const bytes = new Uint8Array(length);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Fallback for environments without Web Crypto
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < length; i++) {
    pwd += charset[bytes[i] % charset.length];
  }
  return pwd;
}

/**
 * Validate password strength.
 *
 * Used by the upcoming admin "create account" UI to enforce a minimum
 * standard. Returns an error message if invalid, or null if valid.
 *
 * Rules:
 *   - At least 8 characters
 *   - At least one letter
 *   - At least one digit
 */
export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (!/[a-zA-Z]/.test(password)) {
    return "Password must contain at least one letter";
  }
  if (!/\d/.test(password)) {
    return "Password must contain at least one digit";
  }
  return null;
}
