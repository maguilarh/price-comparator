import { getProvidersByIds } from "@/lib/products/providers";
import {
  ProductComparisonResult,
  ProductQuery,
  ProviderError,
  ProviderProductOffer
} from "@/lib/products/types";

type CompareProductsParams = {
  queries: ProductQuery[];
  providerIds: string[];
};

type ComparableOffer = ProviderProductOffer & {
  normalizedName: string;
  normalizedSupplier: string;
};

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

function getUniqueRequestedProducts(queries: ProductQuery[]) {
  return Array.from(new Set(queries.map((query) => normalizeProductName(query))));
}

function buildComparisons(
  offers: ComparableOffer[],
  requestedProducts: string[]
): ProductComparisonResult[] {
  const groupedProducts = new Map<string, ComparableOffer[]>();

  for (const offer of offers) {
    const group = groupedProducts.get(offer.normalizedSupplier) ?? [];
    group.push(offer);
    groupedProducts.set(offer.normalizedSupplier, group);
  }

  return Array.from(groupedProducts.values())
    .map((group) => {
      const offersByProduct = new Map<string, ComparableOffer[]>();

      for (const offer of group) {
        const productOffers = offersByProduct.get(offer.normalizedName) ?? [];
        productOffers.push(offer);
        offersByProduct.set(offer.normalizedName, productOffers);
      }

      if (requestedProducts.some((product) => !offersByProduct.has(product))) {
        return null;
      }

      const selectedOffers = requestedProducts.map((product) =>
        chooseBestOption(offersByProduct.get(product) ?? [])
      );
      const bestOption = chooseBestOption(selectedOffers);
      const totalPrice = selectedOffers.reduce((sum, offer) => sum + offer.price, 0);

      return {
        supplier: bestOption.supplier,
        providerId: bestOption.providerId,
        totalProducts: selectedOffers.length,
        totalPrice: Number(totalPrice.toFixed(2)),
        averagePrice: Number((totalPrice / selectedOffers.length).toFixed(2)),
        bestOffer: {
          productName: bestOption.name,
          price: bestOption.price,
          url: bestOption.url
        }
      };
    })
    .filter((comparison): comparison is ProductComparisonResult => comparison !== null)
    .sort((left, right) => {
      if (left.totalPrice !== right.totalPrice) {
        return left.totalPrice - right.totalPrice;
      }

      return left.supplier.localeCompare(right.supplier);
    });
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
  const requestedProducts = getUniqueRequestedProducts(queries);
  const providerErrors: ProviderError[] = resultsByProvider.flatMap((result) => result.errors);

  return {
    providerCount: providers.length,
    providerErrors,
    comparisons: buildComparisons(comparableOffers, requestedProducts)
  };
}
