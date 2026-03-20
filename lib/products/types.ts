export type ProductInput = {
  name: string;
  description: string;
  price: number | string;
  category: string;
  stock: number | string;
  supplier?: string;
  url?: string;
};

export type ProductQuery = ProductInput;

export type ProviderProductOffer = {
  providerId: string;
  supplier: string;
  name: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  url: string;
};

export type ProviderError = {
  providerId: string;
  providerLabel: string;
  message: string;
  query?: string;
};

export type ProductComparisonResult = {
  productName: string;
  category: string;
  bestOption: {
    providerId: string;
    supplier: string;
    price: number;
    stock: number;
    description: string;
    url: string;
  };
  comparedOptions: number;
  priceRange: {
    min: number;
    max: number;
    savingsVsHighest: number;
  };
  allOptions: Array<{
    providerId: string;
    supplier: string;
    price: number;
    stock: number;
    url: string;
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

export function isValidProductInput(product: unknown): product is ProductInput {
  if (!product || typeof product !== "object") {
    return false;
  }

  const candidate = product as Record<string, unknown>;

  return (
    typeof candidate.name === "string" &&
    candidate.name.trim().length > 0 &&
    typeof candidate.description === "string" &&
    candidate.description.trim().length > 0 &&
    typeof candidate.category === "string" &&
    candidate.category.trim().length > 0 &&
    typeof candidate.url === "string" &&
    candidate.url.trim().length > 0 &&
    Number.isFinite(Number(candidate.price)) &&
    Number(candidate.price) >= 0 &&
    Number.isFinite(Number(candidate.stock)) &&
    Number(candidate.stock) >= 0
  );
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
    candidate.products.every((product) => isValidProductInput(product))
  );
}
