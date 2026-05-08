/**
 * Read-only feature flags for the AI overlay.
 *
 * AI_FEATURES_ENABLED is the master kill switch — if false, no AI UI shows
 * up anywhere and the API routes refuse to do work. Setting it true requires
 * the full backend to be configured (Supabase + Inngest + OpenAI + Anthropic).
 */
export const AI_FEATURES_ENABLED =
  process.env.NEXT_PUBLIC_AI_FEATURES_ENABLED === "true";
