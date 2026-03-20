import { ProductProvider } from "@/lib/products/types";
import { manualProductsProvider } from "@/lib/products/providers/manual-provider";
import { serpApiProductsProvider } from "@/lib/products/providers/serpapi-provider";
import { webSearchProductsProvider } from "@/lib/products/providers/web-search-provider";

const providers: ProductProvider[] = [
  webSearchProductsProvider,
  serpApiProductsProvider,
  manualProductsProvider
];

export function getProvidersByIds(providerIds: string[]): ProductProvider[] {
  return providerIds
    .map((providerId) => providers.find((provider) => provider.id === providerId))
    .filter((provider): provider is ProductProvider => Boolean(provider));
}

export function getAllProviders() {
  return [...providers];
}

export function getDefaultProviderIds() {
  const configuredIds = process.env.PRODUCT_PROVIDER_IDS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configuredIds && configuredIds.length > 0) {
    return configuredIds;
  }

  const defaults = [webSearchProductsProvider.id];

  if (process.env.SERPAPI_KEY) {
    defaults.push(serpApiProductsProvider.id);
  }

  if (process.env.USE_MOCK === "true") {
    defaults.push(manualProductsProvider.id);
  }

  return defaults;
}
