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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-44 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 sm:h-52 dark:border-zinc-800 dark:bg-zinc-900"
          />
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-300 bg-white px-4 py-12 text-center dark:border-zinc-700 dark:bg-zinc-950 sm:py-16">
        <CategoryIcon id="all" className="h-12 w-12 text-zinc-400" />
        <div className="mt-3 text-base font-medium">No datasets here yet</div>
        <div className="mt-1 max-w-xs text-sm text-zinc-500">
          {emptyHint ?? "Upload your first dataset to get started."}
        </div>
        <Link
          href="/upload"
          className="mt-4 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-700 hover:to-violet-700 active:scale-[0.98]"
        >
          Upload a dataset
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {files.map((f) => (
        <FileCard key={f.fileId} file={f} />
      ))}
    </div>
  );
}
