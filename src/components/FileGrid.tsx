"use client";

import Link from "next/link";
import type { FileMeta } from "@/lib/files";
import { FileCard } from "./FileCard";
import { CategoryIcon } from "./CategoryIcon";

type Props = {
  files: FileMeta[];
  loading?: boolean;
  emptyHint?: string;
};

export function FileGrid({ files, loading, emptyHint }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-44 animate-pulse rounded-xl border border-line bg-surface-sunken sm:h-52"
          />
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line bg-surface-raised px-4 py-10 text-center sm:py-16">
        <CategoryIcon id="all" className="h-10 w-10 text-ink-subtle sm:h-12 sm:w-12" />
        <div className="mt-3 text-base font-medium sm:text-base">
          No datasets here yet
        </div>
        <div className="mt-1 max-w-xs text-sm leading-relaxed text-ink-subtle sm:text-sm">
          {emptyHint ?? "Upload your first dataset to get started."}
        </div>
        {/* The one other upload CTA in the app. It can't collide with the
            topbar's visually because it only renders when the view is empty. */}
        <Link
          href="/upload"
          className="mt-4 w-full max-w-[15rem] rounded-lg bg-gradient-to-br from-royal to-royal-deep px-4 py-2.5 text-sm font-semibold text-surface shadow-sm transition hover:from-royal-deep hover:to-royal-deep active:scale-[0.98] sm:w-auto sm:py-2"
        >
          Upload a dataset
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {files.map((f) => (
        <FileCard key={f.fileId} file={f} />
      ))}
    </div>
  );
}
