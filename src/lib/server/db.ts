import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for server-side use only. Uses the service-role key
 * (full bypass of RLS) — never import this from a client component.
 *
 * If env vars aren't set, returns null. Callers should treat null as
 * "AI features off" and short-circuit gracefully.
 */

export type AptboxFile = {
  network: string;
  file_id: number;
  uploader: string;
  shelby_cid: string;
  mime_type: string | null;
  size_bytes: number | null;
  ai_status:
    | "pending"
    | "processing"
    | "ready"
    | "failed"
    | "unsupported"
    | "skipped";
  ai_summary: string | null;
  ai_tags: string[] | null;
  ai_chunk_count: number;
  ai_processed_at: string | null;
  ai_error: string | null;
  ai_retries: number;
  created_at: string;
};

export type AptboxChunk = {
  id: string;
  network: string;
  file_id: number;
  chunk_index: number;
  content: string;
  embedding: number[] | null;
  page_or_section: string | null;
  created_at: string;
};

export type AptboxAccessLog = {
  id: number;
  network: string;
  file_id: number;
  viewer: string | null;
  action: string | null;
  occurred_at: string;
  ip_hash: string | null;
};

export type Database = {
  public: {
    Tables: {
      aptbox_files: {
        Row: AptboxFile;
        Insert: Partial<AptboxFile> &
          Pick<AptboxFile, "network" | "file_id" | "uploader" | "shelby_cid">;
        Update: Partial<AptboxFile>;
        Relationships: [];
      };
      aptbox_chunks: {
        Row: AptboxChunk;
        Insert: Omit<AptboxChunk, "id" | "created_at"> &
          Partial<Pick<AptboxChunk, "id" | "created_at">>;
        Update: Partial<AptboxChunk>;
        Relationships: [];
      };
      aptbox_access_log: {
        Row: AptboxAccessLog;
        Insert: Omit<AptboxAccessLog, "id" | "occurred_at"> &
          Partial<Pick<AptboxAccessLog, "id" | "occurred_at">>;
        Update: Partial<AptboxAccessLog>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      match_chunks: {
        Args: {
          query_embedding: number[];
          filter_network: string;
          filter_file_id: number;
          match_count?: number;
        };
        Returns: Array<{
          id: string;
          chunk_index: number;
          content: string;
          page_or_section: string | null;
          similarity: number;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Db = SupabaseClient<Database>;

let cached: Db | null | undefined;

export function getDb(): Db | null {
  if (cached !== undefined) return cached;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    cached = null;
    return null;
  }
  cached = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
