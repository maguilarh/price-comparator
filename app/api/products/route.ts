import { NextResponse } from "next/server";
import { compareProductsFromProviders } from "@/lib/products/comparison-service";
import { getDefaultProviderIds } from "@/lib/products/providers";
import { isProductsComparisonRequest } from "@/lib/products/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const debugEnabled =
      typeof body?.debug === "boolean" ? body.debug : process.env.PRODUCT_DEBUG === "true";

    if (!isProductsComparisonRequest(body)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Debes enviar `products` como una lista de nombres de producto validos."
        },
        { status: 400 }
      );
    }

    const comparison = await compareProductsFromProviders({
      queries: body.products,
      providerIds: getDefaultProviderIds()
    });

    return NextResponse.json({
      ok: true,
      processedAt: new Date().toISOString(),
      totalProductsReceived: body.products.length,
      uniqueProductsCompared: comparison.comparisons.length,
      providerCount: comparison.providerCount,
      providerErrors: comparison.providerErrors,
      comparisons: comparison.comparisons,
      debug: debugEnabled ? comparison.debug : undefined
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo procesar el JSON enviado.";
    console.error("[products][api] request:error", { error: message });
    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo procesar el JSON enviado.",
        debug: {
          error: message
        }
      },
      { status: 400 }
    );
  }
}
