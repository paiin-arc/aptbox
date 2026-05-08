import Anthropic from "@anthropic-ai/sdk";

const FAST_MODEL = "claude-haiku-4-5-20251001";
const STRONG_MODEL = "claude-sonnet-4-6";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
    client = new Anthropic({ apiKey });
  }
  return client;
}

export type SummaryAndTags = {
  summary: string;
  tags: string[];
};

/**
 * Generate a 2–4 sentence summary + 3–6 short tags for a document, given
 * its full text (or as much as fits in the model context). Uses Haiku
 * for cost and structured JSON output for reliability.
 */
export async function summarizeAndTag(
  text: string,
  hint?: { mimeType?: string; fileName?: string }
): Promise<SummaryAndTags> {
  const c = getClient();
  // Cap input at ~120k chars (~30k tokens) — leaves headroom in 200k context
  const MAX_CHARS = 120_000;
  const trimmed = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;

  const sysPrompt = [
    "You are an indexing assistant for a decentralized file vault.",
    "Given a file's text, produce a concise factual summary and short tags.",
    "Return ONLY valid JSON with this shape: { \"summary\": string, \"tags\": string[] }.",
    "Summary: 2 to 4 sentences, no bullet points, no preamble.",
    "Tags: 3 to 6 short lowercase tags (1–2 words each), no punctuation.",
    "Do not invent specific details that aren't in the text.",
  ].join("\n");

  const userPrompt = [
    hint?.fileName ? `Filename: ${hint.fileName}` : null,
    hint?.mimeType ? `Content-Type: ${hint.mimeType}` : null,
    "",
    "FILE TEXT:",
    trimmed,
  ]
    .filter(Boolean)
    .join("\n");

  const msg = await c.messages.create({
    model: FAST_MODEL,
    max_tokens: 600,
    system: sysPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Find the text block
  const textBlock = msg.content.find((b) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  const raw = textBlock?.text ?? "{}";

  // Robust JSON parse — strip code fences if Claude added them
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      summary:
        typeof parsed.summary === "string" ? parsed.summary.trim() : "",
      tags: Array.isArray(parsed.tags)
        ? parsed.tags
            .filter((t: unknown) => typeof t === "string")
            .map((t: string) => t.toLowerCase().trim())
            .filter(Boolean)
            .slice(0, 6)
        : [],
    };
  } catch {
    return { summary: cleaned.slice(0, 800), tags: [] };
  }
}

/**
 * Multi-turn streaming chat (used by Phase 1B). Public for future use;
 * Phase 1A doesn't call this yet.
 */
export type ChatTurn = { role: "user" | "assistant"; content: string };

export async function chatWithContext(args: {
  question: string;
  history: ChatTurn[];
  contextChunks: { content: string; page_or_section: string | null }[];
  fileName?: string;
}): Promise<{ stream: AsyncIterable<string> }> {
  const c = getClient();
  const sys = [
    "You answer questions about a single user-provided file using only the supplied context chunks.",
    "If the answer isn't in the context, say so. Cite chunks by their section label when relevant.",
    "Be concise.",
  ].join("\n");

  const contextBlock = args.contextChunks
    .map(
      (chunk, i) =>
        `[chunk ${i + 1}${chunk.page_or_section ? `, ${chunk.page_or_section}` : ""}]\n${chunk.content}`
    )
    .join("\n\n");

  const userPrompt = [
    args.fileName ? `File: ${args.fileName}` : null,
    "",
    "Context:",
    contextBlock,
    "",
    `Question: ${args.question}`,
  ]
    .filter(Boolean)
    .join("\n");

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...args.history,
    { role: "user", content: userPrompt },
  ];

  const stream = await c.messages.stream({
    model: FAST_MODEL,
    max_tokens: 1200,
    system: sys,
    messages,
  });

  async function* iter() {
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  }
  return { stream: iter() };
}

export const STRONG_MODEL_ID = STRONG_MODEL;
export const FAST_MODEL_ID = FAST_MODEL;
