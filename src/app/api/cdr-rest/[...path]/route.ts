import { NextResponse } from "next/server";

/**
 * Same-origin proxy to the Story API REST endpoint (DKG state, partials, etc).
 *
 * The CDR SDK in the browser tries to call `apiUrl` (default
 * `http://172.192.41.96:1317`) directly — which CORS-blocks because the
 * upstream sets no Access-Control-Allow-Origin headers. Routing through this
 * Next API handler turns those calls into same-origin requests, dodging CORS
 * entirely.
 *
 * Browser side:  fetch("/api/cdr-rest/dkg/latest_active")
 * Server side:   fetch(`${STORY_API_URL}/dkg/latest_active`)
 *
 * Upstream is configurable via the server-only env var STORY_API_URL.
 */

const UPSTREAM =
  process.env.STORY_API_URL ?? "http://172.192.41.96:1317";

type Ctx = { params: Promise<{ path: string[] }> };

async function forward(req: Request, ctx: Ctx, method: "GET" | "POST") {
  const { path } = await ctx.params;
  const tail = path.join("/");
  const url = `${UPSTREAM}/${tail}${new URL(req.url).search}`;

  let body: BodyInit | undefined;
  if (method !== "GET") {
    body = await req.text();
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      body,
      headers: {
        // Pass through content-type for POSTs so the upstream parses correctly
        ...(req.headers.get("content-type")
          ? { "content-type": req.headers.get("content-type") as string }
          : {}),
      },
      // Don't surface upstream cookies / redirect chains; we're just relaying JSON.
      redirect: "follow",
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "upstream_unreachable",
        upstream: url,
        message: (e as Error).message ?? String(e),
      },
      { status: 502 }
    );
  }

  // Stream the upstream body back unmodified, preserve status, copy
  // content-type if present. Strip any upstream CORS / cookie headers.
  const out = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
  return out;
}

export async function GET(req: Request, ctx: Ctx) {
  return forward(req, ctx, "GET");
}

export async function POST(req: Request, ctx: Ctx) {
  return forward(req, ctx, "POST");
}
