"use client";

import { useState } from "react";
import {
  ArrowRight, Coffee, Eye, EyeOff, Lock, Mail,
} from "lucide-react";
import type { Operator, Seller } from "@/lib/types";
import { setAuthToken } from "@/lib/auth-client";

export function LoginPage({ onLogin }: {
  onLogin: (data: { role: "admin" | "seller"; email: string; name?: string; mustChangePassword?: boolean }) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showRequestAccess, setShowRequestAccess] = useState(false);

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter both email and password");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (data.ok && data.token) {
        setAuthToken(data.token);
        onLogin({
          role: data.role === "admin" ? "admin" : "seller",
          email: data.email,
          name: data.name,
          mustChangePassword: data.mustChangePassword,
        });
      } else {
        setError(data.error || "Login failed");
      }
    } catch (err) {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side — branding panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#2D1810] via-[#4A3520] to-[#6B4E33] relative overflow-hidden">
        {/* Decorative coffee bean pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-20 left-20 w-32 h-32 rounded-full bg-white" />
          <div className="absolute top-40 right-20 w-24 h-24 rounded-full bg-white" />
          <div className="absolute bottom-32 left-32 w-40 h-40 rounded-full bg-white" />
          <div className="absolute bottom-20 right-40 w-28 h-28 rounded-full bg-white" />
        </div>
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
              <Coffee className="h-6 w-6 text-white" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-bold text-lg tracking-tight">COFFEE</p>
              <p className="font-light text-sm text-white/60 -mt-1">EXPORT ERP</p>
            </div>
          </div>

          <div>
            <h2 className="text-4xl font-bold leading-tight mb-4">
              From Addis to the<br />world&apos;s best roasters.
            </h2>
            <p className="text-white/70 text-lg leading-relaxed max-w-md">
              Manage leads, samples, quotes, contracts, shipments, and compliance — all in one AI-powered platform built for Ethiopian coffee exporters.
            </p>
            <div className="grid grid-cols-3 gap-4 mt-8 max-w-md">
              <div>
                <p className="text-3xl font-bold">11</p>
                <p className="text-xs text-white/60 mt-1">Integrated modules</p>
              </div>
              <div>
                <p className="text-3xl font-bold">7</p>
                <p className="text-xs text-white/60 mt-1">AI agents working</p>
              </div>
              <div>
                <p className="text-3xl font-bold">2%</p>
                <p className="text-xs text-white/60 mt-1">Commission shielded</p>
              </div>
            </div>
          </div>

          <div className="text-xs text-white/40">
            © 2026 Faith-El PLC · Powered by Coffee Export ERP
          </div>
        </div>
      </div>

      {/* Right side — login form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-[#FAFAF9]">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4A3520]">
              <Coffee className="h-5 w-5 text-white" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-bold text-gray-900 tracking-tight">COFFEE</p>
              <p className="font-light text-xs text-gray-400 -mt-0.5">EXPORT ERP</p>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome back</h1>
            <p className="text-sm text-gray-500 mt-1.5">Sign in to your Coffee Export ERP account</p>
          </div>

          {/* Role selector — REMOVED. Role is auto-detected from email. */}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" strokeWidth={1.5} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10 transition-colors"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" strokeWidth={1.5} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-10 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            {/* Remember + forgot */}
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded border-gray-300 text-[#4A3520] focus:ring-[#4A3520]" />
                <span className="text-gray-600">Remember me for 30 days</span>
              </label>
              <button type="button" className="font-medium text-[#4A3520] hover:underline">Forgot password?</button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#4A3520] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            Don&apos;t have an account? <button onClick={() => setShowRequestAccess(true)} className="font-medium text-[#4A3520] hover:underline">Request access</button>
          </p>
        </div>
      </div>

      {/* Request Access modal */}
      {showRequestAccess && (
        <RequestAccessModal onClose={() => setShowRequestAccess(false)} />
      )}
    </div>
  );
}

// ─── Request Access Modal ────────────────────────────────────────────
function RequestAccessModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required");
      return;
    }
    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const r = await fetch("/api/auth/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, company, jobTitle, phone, message }),
      });
      const data = await r.json();
      if (data.ok) {
        setSubmitted(true);
      } else {
        setError(data.error || "Failed to submit request");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-[#2D1810] to-[#4A3520] p-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold">Request Access</h2>
              <p className="text-sm text-white/70 mt-1">We&apos;ll review your request and email you within 1–2 business days.</p>
            </div>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white -mr-1 -mt-1 p-1"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {submitted ? (
          // Success state
          <div className="p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-4">
              <svg className="h-6 w-6 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Request submitted</h3>
            <p className="text-sm text-gray-500 mb-6">
              Thanks, {name.split(" ")[0]}! An administrator will review your request and reach out to <span className="font-medium text-gray-700">{email}</span> with login instructions.
            </p>
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-[#4A3520] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors"
            >
              Back to login
            </button>
          </div>
        ) : (
          // Form state
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                required
                maxLength={100}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                Work Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                maxLength={200}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10 transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Company</label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Optional"
                  maxLength={100}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Job Title</label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Optional"
                  maxLength={100}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+251 911 234 567 (optional)"
                maxLength={50}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Anything else we should know? (optional)"
                rows={3}
                maxLength={500}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4A3520] focus:ring-2 focus:ring-[#4A3520]/10 transition-colors resize-none"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-lg bg-[#4A3520] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6B4E33] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit request
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

