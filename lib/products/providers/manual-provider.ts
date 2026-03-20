import {
  ProductProvider,
  ProductQuery,
  ProviderError,
  ProviderQueryDebug
} from "@/lib/products/types";

export const manualProviderId = "manual";

export const manualProductsProvider: ProductProvider = {
  id: manualProviderId,
  label: "Carga manual",
  async fetchOffers(
    queries: ProductQuery[],
    _options?: {
      debugEnabled?: boolean;
    }
  ) {
    const debugEntries: ProviderQueryDebug[] = queries.map((query) => ({
      product: query.trim(),
      providerId: manualProviderId,
      providerLabel: "Carga manual",
      searched: false,
      launchedQuery: query.trim(),
      consultedSources: [],
      httpStatus: undefined,
      htmlLength: 0,
      htmlPreview: "",
      resultCount: 0,
      linksDetectedBeforeFilters: 0,
      firstDetectedLinks: [],
      acceptedCount: 0,
      discardedCount: 0,
      discardedByCause: {},
      discarded: [],
      errors: [
        "Proveedor sin busqueda web activa. No genera resultados reales sin un proveedor externo."
      ],
      usedMockData: true,
      failureStage: "mock"
    }));
    const errors: ProviderError[] = queries.map((query) => ({
      providerId: manualProviderId,
      providerLabel: "Carga manual",
      message:
        "La carga manual ya no genera ofertas sin precio ni stock. Configura un proveedor externo para obtener resultados.",
      query: query.trim()
    }));

    return {
      offers: [],
      errors,
      debugEntries
    };
  }
};
