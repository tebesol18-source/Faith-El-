"use client";

import {
  Coffee,
} from "lucide-react";

export function PlaceholderPage({ title, question }: { title: string; question: string }) {
  return (
    <main className="p-8 max-w-[1200px] mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-2">{title}</h1>
      <p className="text-sm text-gray-500 mb-8">{question}</p>
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-gray-50 mb-4">
          <Coffee className="h-8 w-8 text-gray-300" strokeWidth={1} />
        </div>
        <p className="text-sm font-medium text-gray-500">This page is coming next.</p>
        <p className="text-xs text-gray-400 mt-1">Using the same design system and principles.</p>
      </div>
    </main>
  );
}

