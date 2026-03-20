import {
  ProductProvider,
  ProductQuery,
  ProviderError,
  ProviderProductOffer
} from "@/lib/products/types";
import { createRateLimiter } from "@/lib/products/rate-limiter";

export const serpApiProviderId = "serpapi";

type SerpApiShoppingResult = {
  title?: string;
  source?: string;
  product_link?: string;
  price?: string;
  extracted_price?: number;
  snippet?: string;
};

type SerpApiResponse = {
  shopping_results?: SerpApiShoppingResult[];
  error?: string;
};

const apiBaseUrl = "https://serpapi.com/search.json";
const defaultResultLimit = 3;
const defaultMinIntervalMs = 300;
const spanishDomainSuffixes = [".es"];
const euroCurrencySignals = ["eur", "euro", "euros", "€"];
const spanishAddressSignals = [
  "espana",
  "españa",
  "spain",
  "madrid",
  "barcelona",
  "valencia",
  "sevilla",
  "bilbao",
  "zaragoza",
  "malaga",
  "alicante",
  "codigo postal",
  "cp "
];
const spanishShippingSignals = [
  "envio a espana",
  "envio en espana",
  "entrega en espana",
  "entrega en peninsula",
  "envio peninsula",
  "enviado desde espana",
  "shipping to spain",
  "ships to spain"
];

function getSearchQuery(query: ProductQuery) {
  return `${query.trim()} tienda Espana`;
}

function getEnvNumber(name: string, fallback: number) {
  const value = process.env[name];
  const parsedValue = value ? Number(value) : NaN;
  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : fallback;
}

function normalizeUrl(url: string) {
  return url.trim();
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isSpanishHost(hostname: string) {
  if (!hostname) {
    return false;
  }

  return spanishDomainSuffixes.some((suffix) => hostname.endsWith(suffix));
}

function hasEuroSignal(result: SerpApiShoppingResult) {
  const normalizedPrice = normalizeText(result.price || "");
  return euroCurrencySignals.some((signal) => normalizedPrice.includes(signal));
}

function hasSpanishAddressSignal(result: SerpApiShoppingResult) {
  const searchableText = normalizeText(
    [result.title, result.source, result.snippet].filter(Boolean).join(" ")
  );

  return spanishAddressSignals.some((signal) => searchableText.includes(signal));
}

function hasSpanishShippingSignal(result: SerpApiShoppingResult) {
  const searchableText = normalizeText(
    [result.title, result.source, result.snippet].filter(Boolean).join(" ")
  );

  return spanishShippingSignals.some((signal) => searchableText.includes(signal));
}

function isSpanishStore(result: SerpApiShoppingResult, url: string) {
  const hostname = getHostname(url);
  const hasSpanishSignals =
    hasEuroSignal(result) && (hasSpanishAddressSignal(result) || hasSpanishShippingSignal(result));

  return isSpanishHost(hostname) || hasSpanishSignals;
}

async function fetchSerpApiResults(query: ProductQuery) {
  const apiKey = process.env.SERPAPI_KEY;

  if (!apiKey) {
    throw new Error("SERPAPI_KEY no configurada.");
  }

  const params = new URLSearchParams({
    engine: "google_shopping",
    api_key: apiKey,
    q: getSearchQuery(query),
    hl: process.env.SERPAPI_HL || "es",
    gl: process.env.SERPAPI_GL || "es"
  });

  const location = process.env.SERPAPI_LOCATION || "Spain";

  if (location) {
    params.set("location", location);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getEnvNumber("SERPAPI_TIMEOUT_MS", 8000));

  try {
    const response = await fetch(`${apiBaseUrl}?${params.toString()}`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json"
      },
      next: {
        revalidate: 300
      }
    });

    if (!response.ok) {
      throw new Error(`Respuesta HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as SerpApiResponse;

    if (payload.error) {
      throw new Error(payload.error);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export const serpApiProductsProvider: ProductProvider = {
  id: serpApiProviderId,
  label: "SerpApi Google Shopping",
  async fetchOffers(queries: ProductQuery[]) {
    const schedule = createRateLimiter(
      getEnvNumber("SERPAPI_MIN_INTERVAL_MS", defaultMinIntervalMs)
    );
    const errors: ProviderError[] = [];
    const offers: ProviderProductOffer[] = [];
    const resultLimit = getEnvNumber("SERPAPI_RESULT_LIMIT", defaultResultLimit);

    for (const query of queries) {
      try {
        const payload = await schedule(() => fetchSerpApiResults(query));
        const results = payload.shopping_results?.slice(0, resultLimit) ?? [];
        let addedOffers = 0;

        if (results.length === 0) {
          errors.push({
            providerId: serpApiProviderId,
            providerLabel: "SerpApi Google Shopping",
            message: "La busqueda no devolvio resultados.",
            query: query.trim()
          });
          continue;
        }

        for (const result of results) {
          const price = Number(result.extracted_price);
          const url = normalizeUrl(result.product_link || "");

          if (!Number.isFinite(price) || !url || !isSpanishStore(result, url)) {
            continue;
          }

          offers.push({
            providerId: serpApiProviderId,
            supplier: result.source?.trim() || "Google Shopping",
            name: query.trim(),
            price,
            url
          });
          addedOffers += 1;
        }

        if (addedOffers === 0) {
          errors.push({
            providerId: serpApiProviderId,
            providerLabel: "SerpApi Google Shopping",
            message: "No se encontraron tiendas espanolas para este producto.",
            query: query.trim()
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error desconocido.";

        errors.push({
          providerId: serpApiProviderId,
          providerLabel: "SerpApi Google Shopping",
          message,
          query: query.trim()
        });
      }
    }

    return {
      offers,
      errors
    };
  }
};
