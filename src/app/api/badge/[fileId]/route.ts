import { fetchFileMetaStrict } from "@/lib/files";
import { defaultNetwork, isSupported } from "@/lib/networks";
import { renderBadgeSvg, type BadgeState } from "@/lib/citation";

/**
 * Embeddable SVG badge: GET /api/badge/<fileId>?n=<network>
 *
 * Reads the dataset's record straight from the Aptos registry, so the badge
 * reflects current chain state (flags, deletion) rather than whatever was true
 * when someone pasted it into a README.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId: raw } = await params;
  const fileId = raw.replace(/\.svg$/i, "");
  const requested = new URL(req.url).searchParams.get("n");
  const network = isSupported(requested) ? requested : defaultNetwork();

  let state: BadgeState;
  if (!/^\d+$/.test(fileId)) {
    // Registry IDs are u64; anything else can't exist, no need to ask.
    state = { kind: "not_found", fileId };
  } else {
    try {
      // Strict: resolves null only when the registry confirms the file is
      // absent. Outages throw, so they render as "registry unavailable"
      // instead of falsely telling README readers the dataset is unregistered.
      const file = await fetchFileMetaStrict(network, fileId);
      state = file
        ? {
            kind: "committed",
            fileId: file.fileId,
            contentHash: file.contentHash,
            flagCount: file.flagCount,
          }
        : { kind: "not_found", fileId };
    } catch (e) {
      console.warn(`[badge] ${network}/${fileId} registry unavailable`, (e as Error).cause ?? e);
      state = { kind: "error" };
    }
  }

  return new Response(renderBadgeSvg(state), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Short CDN cache: badges are hit by every README view, but flags and
      // deletions should show up within minutes.
      "Cache-Control":
        state.kind === "error"
          ? "no-store"
          : "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
