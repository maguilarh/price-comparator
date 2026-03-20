import {
  ProductProvider,
  ProductQuery,
  ProviderError
} from "@/lib/products/types";

export const manualProviderId = "manual";

export const manualProductsProvider: ProductProvider = {
  id: manualProviderId,
  label: "Carga manual",
  async fetchOffers(queries: ProductQuery[]) {
    const errors: ProviderError[] = queries.map((query) => ({
      providerId: manualProviderId,
      providerLabel: "Carga manual",
      message:
        "La carga manual ya no genera ofertas sin precio ni stock. Configura un proveedor externo para obtener resultados.",
      query: query.trim()
    }));

    return {
      offers: [],
      errors
    };
  }
};
