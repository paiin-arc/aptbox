import OpenAI from "openai";

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 1536;

let openai: OpenAI | null = null;
function getClient(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set");
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

/**
 * Embed an array of text chunks. Batches up to 100 inputs per API call.
 * Returns embeddings in the same order as input.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = getClient();
  const out: number[][] = [];
  const BATCH = 96;
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const resp = await client.embeddings.create({
      model: EMBED_MODEL,
      input: slice,
    });
    for (const item of resp.data) {
      out.push(item.embedding as number[]);
    }
  }
  return out;
}

export async function embedSingle(text: string): Promise<number[]> {
  const [e] = await embedTexts([text]);
  return e;
}

export const EMBEDDING_DIMENSIONS = EMBED_DIMS;
