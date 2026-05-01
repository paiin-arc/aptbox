"use client";

import Link from "next/link";
import type { FileMeta } from "@/lib/files";
import { FileCard } from "./FileCard";

type Props = {
  files: FileMeta[];
  loading?: boolean;
  emptyHint?: string;
};

export function FileGrid({ files, loading, emptyHint }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-52 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
          />
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-300 bg-white py-16 text-center dark:border-zinc-700 dark:bg-zinc-950">
        <div className="text-5xl">📁</div>
        <div className="mt-3 text-base font-medium">No files here yet</div>
        <div className="mt-1 max-w-xs text-sm text-zinc-500">
          {emptyHint ?? "Upload your first file to get started."}
        </div>
        <Link
          href="/upload"
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Upload a file
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {files.map((f) => (
        <FileCard key={f.fileId} file={f} />
      ))}
    </div>
  );
}
