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

export type ProviderQueryDebug = {
  product: string;
  providerId: string;
  providerLabel: string;
  searched: boolean;
  responseTimeMs?: number;
  searchEngine?: string;
  debugPreviewQuery?: string;
  debugPreviewLinks?: Array<{
    href: string;
    text: string;
  }>;
  launchedQuery?: string;
  requestUrl?: string;
  httpStatus?: number;
  htmlLength?: number;
  htmlPreview?: string;
  consultedSources: string[];
  resultCount: number;
  linksDetectedBeforeFilters?: number;
  firstDetectedLinks?: Array<{
    href: string;
    text: string;
  }>;
  acceptedCount: number;
  discardedCount: number;
  discardedByCause?: Record<string, number>;
  discarded: Array<{
    source?: string;
    url?: string;
    reason: string;
  }>;
  errors: string[];
  usedMockData: boolean;
  failureStage?:
    | "http_error"
    | "empty_body"
    | "html_received_no_links"
    | "links_found_but_filtered"
    | "no_valid_store_results"
    | "parsing"
    | "mock"
    | "none";
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

export type PharmacyCartSummary = {
  supplier: string;
  providerId: string;
  totalPrice: number;
  matchedProducts: number;
  missingProducts: string[];
  isComplete: boolean;
  items: Array<{
    productName: string;
    price: number;
    url: string;
    availability: string;
  }>;
};

export type ProductProvider = {
  id: string;
  label: string;
  fetchOffers: (
    queries: ProductQuery[],
    options?: {
      debugEnabled?: boolean;
    }
  ) => Promise<{
    offers: ProviderProductOffer[];
    errors: ProviderError[];
    debugEntries: ProviderQueryDebug[];
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
