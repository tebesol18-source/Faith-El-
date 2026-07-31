"use client";

import { useState } from "react";
import { ArrowRight, Coffee, KeyRound, Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";
import { clearAuthToken } from "@/lib/auth-client";
import { getCsrfToken } from "@/lib/auth-client";

export function ChangePasswordPage({ userEmail, onDone }: { userEmail: string; onDone: () => void }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const strengthCheck = (pwd: string): { ok: boolean; message?: string } => {
    if (pwd.length < 8) return { ok: false, message: "At least 8 characters" };
    if (!/[a-zA-Z]/.test(pwd)) return { ok: false, message: "Must contain a letter" };
    if (!/\d/.test(pwd)) return { ok: false, message: "Must contain a digit" };
    return { ok: true };
  };

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setError("");

    if (!oldPassword || !newPassword || !confirmPassword) {
      setError("All fields are required");
      return;
    }

    const check = strengthCheck(newPassword);
    if (!check.ok) {
      setError(`New password: ${check.message}`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match");
      return;
    }

    if (oldPassword === newPassword) {
      setError("New password must be different from your current password");
      return;
    }

    setSubmitting(true);
    try {
      const r = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken() || "",
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const d = await r.json();
      if (d.ok) {
        setSuccess(true);
        // After 2 seconds, call onDone (clears token + goes back to login)
        setTimeout(() => {
          clearAuthToken();
          onDone();
        }, 2000);
      } else {
        setError(d.error || "Failed to change password");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9] p-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-200 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 mb-4">
            <CheckCircle2 className="h-7 w-7 text-green-600" strokeWidth={2} />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Password changed</h1>
          <p className="text-sm text-gray-500 mb-6">
            Your password has been updated. All other sessions have been logged out.
            Redirecting you to login…
          </p>
          <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 animate-pulse" style={{ width: "100%" }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9] p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4A3520]">
            <Coffee className="h-5 w-5 text-white" strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-bold text-gray-900 tracking-tight">COFFEE</p>
            <p className="font-light text-xs text-gray-400 -mt-0.5">EXPORT ERP</p>
          </div>
        </div>

        <div className="rounded-2xl bg-white shadow-xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-br from-[#2D1810] to-[#4A3520] p-6 text-white">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                <KeyRound className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-xl font-bold">Change Your Password</h1>
                <p className="text-xs text-white/60 mt-0.5">Required before you can continue</p>
              </div>
            </div>
            <p className="text-sm text-white/70">
              Hi <span className="font-medium text-white">{userEmail}</span> — your administrator set a
              temporary password for your account. Please choose a new password to continue.
            </p>
          </div>

          {/* Warning banner */}
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800">
              You won&apos;t be able to access any other page until you change your password.
              All other active sessions will be logged out after the change.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Old password */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                Current Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" strokeWidth={1.5} />
                <input
                  type={showOld ? "text" : "password"}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="The password you logged in with"
                  className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowOld(!showOld)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                New Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" strokeWidth={1.5} />
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 chars, 1 letter + 1 digit"
                  className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {/* Strength indicator */}
              {newPassword && (
                <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                  {(() => {
                    const check = strengthCheck(newPassword);
                    return check.ok ? (
                      <span className="text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Password meets requirements
                      </span>
                    ) : (
                      <span className="text-amber-600">{check.message}</span>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Confirm new password */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                Confirm New Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" strokeWidth={1.5} />
                <input
                  type={showNew ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter the new password"
                  className={`w-full rounded-lg border bg-white pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A3520]/10 ${
                    confirmPassword && confirmPassword !== newPassword
                      ? "border-red-300 focus:border-red-400"
                      : "border-gray-200 focus:border-[#4A3520]"
                  }`}
                />
              </div>
              {confirmPassword && confirmPassword !== newPassword && (
                <p className="mt-1 text-[11px] text-red-600">Passwords don&apos;t match</p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-[#4A3520] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Changing password...
                </>
              ) : (
                <>
                  Change Password
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Need help? Contact your administrator.
        </p>
      </div>
    </div>
  );
}
