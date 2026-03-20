import { ProductProvider } from "@/lib/products/types";
import { manualProductsProvider } from "@/lib/products/providers/manual-provider";
import { spanishPharmacyProviders } from "@/lib/products/providers/spanish-pharmacies";

const providers: ProductProvider[] = [...spanishPharmacyProviders, manualProductsProvider];

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

  const defaults = spanishPharmacyProviders.map((provider) => provider.id);

  if (process.env.USE_MOCK === "true") {
    defaults.push(manualProductsProvider.id);
  }

  return defaults;
}
