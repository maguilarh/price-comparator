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
};

function normalizeProductName(name: string) {
  return name.trim().toLowerCase();
}

function toComparableOffer(offer: ProviderProductOffer): ComparableOffer {
  return {
    ...offer,
    normalizedName: normalizeProductName(offer.name)
  };
}

function chooseBestOption(products: ComparableOffer[]) {
  return [...products].sort((left, right) => {
    if (left.price !== right.price) {
      return left.price - right.price;
    }

    if (left.stock !== right.stock) {
      return right.stock - left.stock;
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

  return Array.from(groupedProducts.values()).map((group) => {
    const bestOption = chooseBestOption(group);
    const prices = group.map((offer) => offer.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    return {
      productName: bestOption.name,
      category: bestOption.category,
      bestOption: {
        providerId: bestOption.providerId,
        supplier: bestOption.supplier,
        price: bestOption.price,
        stock: bestOption.stock,
        description: bestOption.description,
        url: bestOption.url
      },
      comparedOptions: group.length,
      priceRange: {
        min: minPrice,
        max: maxPrice,
        savingsVsHighest: Number((maxPrice - minPrice).toFixed(2))
      },
      allOptions: group
        .map((offer) => ({
          providerId: offer.providerId,
          supplier: offer.supplier,
          price: offer.price,
          stock: offer.stock,
          url: offer.url
        }))
        .sort((left, right) => left.price - right.price)
    };
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
  const providerErrors: ProviderError[] = resultsByProvider.flatMap((result) => result.errors);

  return {
    providerCount: providers.length,
    providerErrors,
    comparisons: buildComparisons(comparableOffers)
  };
}
