import { NextResponse } from "next/server";

const publicTestUrl = "https://example.com";

export async function GET() {
  const startedAt = Date.now();

  try {
    console.info("[debug][network-test] request:start", {
      url: publicTestUrl
    });

    const response = await fetch(publicTestUrl, {
      method: "GET",
      headers: {
        Accept: "text/html"
      },
      next: {
        revalidate: 0
      }
    });

    const body = await response.text();
    const durationMs = Date.now() - startedAt;

    console.info("[debug][network-test] request:success", {
      url: publicTestUrl,
      status: response.status,
      ok: response.ok,
      durationMs
    });

    return NextResponse.json({
      ok: response.ok,
      url: publicTestUrl,
      status: response.status,
      durationMs,
      bodyPreview: body.slice(0, 200)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido.";
    const durationMs = Date.now() - startedAt;

    console.error("[debug][network-test] request:error", {
      url: publicTestUrl,
      error: message,
      durationMs
    });

    return NextResponse.json(
      {
        ok: false,
        url: publicTestUrl,
        durationMs,
        error: message
      },
      { status: 500 }
    );
  }
}
