import { NextResponse } from "next/server";
import { compareProductsFromProviders } from "@/lib/products/comparison-service";
import { getDefaultProviderIds } from "@/lib/products/providers";
import { isProductsComparisonRequest } from "@/lib/products/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();

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
      uniqueStoresCompared: comparison.comparisons.length,
      providerCount: comparison.providerCount,
      providerErrors: comparison.providerErrors,
      comparisons: comparison.comparisons
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo procesar el JSON enviado."
      },
      { status: 400 }
    );
  }
}
