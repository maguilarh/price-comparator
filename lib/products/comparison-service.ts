import { getProvidersByIds } from "@/lib/products/providers";
import {
  ProductComparisonResult,
  ProductQuery,
  ProviderError,
  ProviderProductOffer,
  ProviderQueryDebug
} from "@/lib/products/types";

type CompareProductsParams = {
  queries: ProductQuery[];
  providerIds: string[];
};

type ComparableOffer = ProviderProductOffer & {
  normalizedName: string;
  normalizedSupplier: string;
};

const maxStoresPerProduct = 10;

function normalizeProductName(name: string) {
  return name.trim().toLowerCase();
}

function normalizeSupplierName(name: string) {
  return name.trim().toLowerCase();
}

function toComparableOffer(offer: ProviderProductOffer): ComparableOffer {
  return {
    ...offer,
    normalizedName: normalizeProductName(offer.name),
    normalizedSupplier: normalizeSupplierName(offer.supplier)
  };
}

function chooseBestOption(products: ComparableOffer[]) {
  return [...products].sort((left, right) => {
    if (left.price !== right.price) {
      return left.price - right.price;
    }

    return left.supplier.localeCompare(right.supplier);
  })[0];
}

function buildComparisons(offers: ComparableOffer[]): ProductComparisonResult[] {
  const groupedProducts = new Map<string, ComparableOffer[]>();

  for (const offer of offers) {
    const group = groupedProducts.get(offer.normalizedName) ?? [];
    group.push(offer);
    groupedProducts.set(offer.normalizedName, group);
  }

  return Array.from(groupedProducts.values())
    .map((group) => {
      const offersBySupplier = new Map<string, ComparableOffer[]>();

      for (const offer of group) {
        const supplierOffers = offersBySupplier.get(offer.normalizedSupplier) ?? [];
        supplierOffers.push(offer);
        offersBySupplier.set(offer.normalizedSupplier, supplierOffers);
      }

      const stores = Array.from(offersBySupplier.values())
        .map((supplierOffers) => chooseBestOption(supplierOffers))
        .sort((left, right) => {
          if (left.price !== right.price) {
            return left.price - right.price;
          }

          return left.supplier.localeCompare(right.supplier);
        })
        .slice(0, maxStoresPerProduct);

      return {
        productName: group[0].name,
        stores: stores.map((offer) => ({
          providerId: offer.providerId,
          supplier: offer.supplier,
          price: offer.price,
          url: offer.url,
          availability: offer.availability
        }))
      };
    })
    .filter((comparison) => comparison.stores.length > 0)
    .sort((left, right) => left.productName.localeCompare(right.productName));
}

export async function compareProductsFromProviders({
  queries,
  providerIds
}: CompareProductsParams) {
  const providers = getProvidersByIds(providerIds);

  if (providers.length === 0) {
    throw new Error("No providers configured");
  }

  const resultsByProvider = await Promise.all(
    providers.map((provider) => provider.fetchOffers(queries))
  );

  const comparableOffers = resultsByProvider
    .flatMap((result) => result.offers)
    .map(toComparableOffer);
  const providerErrors: ProviderError[] = resultsByProvider.flatMap((result) => result.errors);
  const debugEntries: ProviderQueryDebug[] = resultsByProvider.flatMap(
    (result) => result.debugEntries
  );

  return {
    providerCount: providers.length,
    providerErrors,
    comparisons: buildComparisons(comparableOffers),
    debug: {
      requestedProducts: queries,
      providerIds,
      searchExecution: "backend",
      frontendExternalRequests: false,
      corsLikelyIssue: false,
      webSearchAttempted: debugEntries.some((entry) => entry.searched),
      mockDataActive: debugEntries.some((entry) => entry.usedMockData),
      entries: debugEntries,
      totals: {
        productsRequested: queries.length,
        debugEntries: debugEntries.length,
        resultsAccepted: debugEntries.reduce((sum, entry) => sum + entry.acceptedCount, 0),
        resultsDiscarded: debugEntries.reduce((sum, entry) => sum + entry.discardedCount, 0),
        providerErrors: providerErrors.length
      }
    }
  };
}
