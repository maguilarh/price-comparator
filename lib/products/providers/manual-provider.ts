import {
  ProductProvider,
  ProductQuery,
  ProviderProductOffer
} from "@/lib/products/types";

export const manualProviderId = "manual";

export const manualProductsProvider: ProductProvider = {
  id: manualProviderId,
  label: "Carga manual",
  async fetchOffers(queries: ProductQuery[]) {
    return {
      offers: queries.map((query, index) => ({
        providerId: manualProviderId,
        supplier: query.supplier?.trim() || `Proveedor ${index + 1}`,
        name: query.name.trim(),
        description: query.description.trim(),
        category: query.category.trim(),
        price: Number(query.price),
        stock: Number(query.stock),
        url: query.url?.trim() || ""
      })),
      errors: []
    };
  }
};
