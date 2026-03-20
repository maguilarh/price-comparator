import { getProvidersByIds } from "@/lib/products/providers";
import {
  PharmacyCartSummary,
  ProductComparisonResult,
  ProductQuery,
  ProviderError,
  ProviderProductOffer,
  ProviderQueryDebug
} from "@/lib/products/types";

type CompareProductsParams = {
  queries: ProductQuery[];
  providerIds: string[];
  debugEnabled?: boolean;
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

function buildCartSummaries(
  offers: ComparableOffer[],
  queries: ProductQuery[]
): PharmacyCartSummary[] {
  const queriesByName = new Map(queries.map((query) => [normalizeProductName(query), query.trim()]));
  const groupedBySupplier = new Map<string, ComparableOffer[]>();

  for (const offer of offers) {
    const currentGroup = groupedBySupplier.get(offer.normalizedSupplier) ?? [];
    currentGroup.push(offer);
    groupedBySupplier.set(offer.normalizedSupplier, currentGroup);
  }

  return Array.from(groupedBySupplier.values())
    .map((supplierOffers) => {
      const bestByProduct = new Map<string, ComparableOffer>();

      for (const offer of supplierOffers) {
        const current = bestByProduct.get(offer.normalizedName);
        if (!current || offer.price < current.price) {
          bestByProduct.set(offer.normalizedName, offer);
        }
      }

      const items = Array.from(bestByProduct.values())
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((offer) => ({
          productName: offer.name,
          price: offer.price,
          url: offer.url,
          availability: offer.availability
        }));
      const missingProducts = Array.from(queriesByName.entries())
        .filter(([normalizedName]) => !bestByProduct.has(normalizedName))
        .map(([, originalName]) => originalName);

      return {
        supplier: supplierOffers[0].supplier,
        providerId: supplierOffers[0].providerId,
        totalPrice: items.reduce((sum, item) => sum + item.price, 0),
        matchedProducts: items.length,
        missingProducts,
        isComplete: missingProducts.length === 0,
        items
      };
    })
    .sort((left, right) => {
      if (left.isComplete !== right.isComplete) {
        return left.isComplete ? -1 : 1;
      }

      if (left.totalPrice !== right.totalPrice) {
        return left.totalPrice - right.totalPrice;
      }

      return left.supplier.localeCompare(right.supplier);
    });
}

export async function compareProductsFromProviders({
  queries,
  providerIds,
  debugEnabled
}: CompareProductsParams) {
  const providers = getProvidersByIds(providerIds);

  if (providers.length === 0) {
    throw new Error("No providers configured");
  }

  const resultsByProvider = await Promise.all(
    providers.map((provider) => provider.fetchOffers(queries, { debugEnabled }))
  );

  const comparableOffers = resultsByProvider
    .flatMap((result) => result.offers)
    .map(toComparableOffer);
  const providerErrors: ProviderError[] = resultsByProvider.flatMap((result) => result.errors);
  const debugEntries: ProviderQueryDebug[] = resultsByProvider.flatMap(
    (result) => result.debugEntries
  );
  const cartSummaries = buildCartSummaries(comparableOffers, queries);
  const bestCart = cartSummaries.find((summary) => summary.isComplete) ?? null;

  return {
    providerCount: providers.length,
    providerErrors,
    comparisons: buildComparisons(comparableOffers),
    cartSummaries,
    bestCart,
    debug: {
      requestedProducts: queries,
      providerIds,
      activeProviders: providers.map((provider) => ({
        id: provider.id,
        label: provider.label
      })),
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
