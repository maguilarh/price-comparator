export type ProductQuery = string;

export type ProviderProductOffer = {
  providerId: string;
  supplier: string;
  name: string;
  price: number;
  url: string;
  availability: string;
};

export type ProviderError = {
  providerId: string;
  providerLabel: string;
  message: string;
  query?: string;
};

export type ProductComparisonResult = {
  productName: string;
  stores: Array<{
    providerId: string;
    supplier: string;
    price: number;
    url: string;
    availability: string;
  }>;
};

export type ProductProvider = {
  id: string;
  label: string;
  fetchOffers: (queries: ProductQuery[]) => Promise<{
    offers: ProviderProductOffer[];
    errors: ProviderError[];
  }>;
};

export type ProductsComparisonRequest = {
  products: ProductQuery[];
};

export function isValidProductQuery(product: unknown): product is ProductQuery {
  return typeof product === "string" && product.trim().length > 0;
}

export function isProductsComparisonRequest(
  payload: unknown
): payload is ProductsComparisonRequest {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Record<string, unknown>;

  return (
    Array.isArray(candidate.products) &&
    candidate.products.length > 0 &&
    candidate.products.every((product) => isValidProductQuery(product))
  );
}
