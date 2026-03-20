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

function getSearchQuery(query: ProductQuery) {
  return [query.name, query.category].filter(Boolean).join(" ");
}

function getEnvNumber(name: string, fallback: number) {
  const value = process.env[name];
  const parsedValue = value ? Number(value) : NaN;
  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : fallback;
}

function normalizeUrl(url: string) {
  return url.trim();
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

  const location = process.env.SERPAPI_LOCATION;

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

        if (results.length === 0) {
          errors.push({
            providerId: serpApiProviderId,
            providerLabel: "SerpApi Google Shopping",
            message: "La busqueda no devolvio resultados.",
            query: query.name
          });
          continue;
        }

        for (const result of results) {
          const price = Number(result.extracted_price);
          const url = normalizeUrl(result.product_link || query.url || "");

          if (!Number.isFinite(price) || !url) {
            continue;
          }

          offers.push({
            providerId: serpApiProviderId,
            supplier: result.source?.trim() || "Google Shopping",
            name: query.name.trim(),
            description: result.snippet?.trim() || query.description.trim(),
            category: query.category.trim(),
            price,
            stock: Number(query.stock),
            url
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error desconocido.";

        errors.push({
          providerId: serpApiProviderId,
          providerLabel: "SerpApi Google Shopping",
          message,
          query: query.name
        });
      }
    }

    return {
      offers,
      errors
    };
  }
};
