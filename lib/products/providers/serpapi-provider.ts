import {
  ProductProvider,
  ProductQuery,
  ProviderError,
  ProviderProductOffer,
  ProviderQueryDebug
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

function buildRequestUrl(params: URLSearchParams) {
  return `${apiBaseUrl}?${params.toString()}`;
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

function getAvailability(result: SerpApiShoppingResult) {
  const searchableText = normalizeText(
    [result.title, result.snippet, result.source].filter(Boolean).join(" ")
  );

  if (
    searchableText.includes("agotado") ||
    searchableText.includes("sin stock") ||
    searchableText.includes("no disponible") ||
    searchableText.includes("out of stock")
  ) {
    return "Agotado";
  }

  if (
    searchableText.includes("en stock") ||
    searchableText.includes("disponible") ||
    searchableText.includes("envio inmediato") ||
    searchableText.includes("recibelo") ||
    searchableText.includes("entrega")
  ) {
    return "Disponible";
  }

  return "Consultar";
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
  const requestUrl = buildRequestUrl(params);

  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json"
      },
      next: {
        revalidate: 300
      }
    });
    console.info("[products][serpapi] http:response", {
      product: query.trim(),
      status: response.status,
      ok: response.ok,
      requestUrl
    });

    if (!response.ok) {
      throw new Error(`Respuesta HTTP ${response.status}.`);
    }

    let payload: SerpApiResponse;

    try {
      payload = (await response.json()) as SerpApiResponse;
    } catch {
      throw new Error("No se pudo parsear la respuesta JSON del proveedor.");
    }

    if (payload.error) {
      throw new Error(payload.error);
    }

    return {
      payload,
      requestUrl
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Timeout al consultar el proveedor web.");
    }

    if (error instanceof TypeError) {
      throw new Error("Error de red o bloqueo al consultar el proveedor web.");
    }

    throw error;
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
    const debugEntries: ProviderQueryDebug[] = [];
    const resultLimit = getEnvNumber("SERPAPI_RESULT_LIMIT", defaultResultLimit);

    for (const query of queries) {
      const consultedSources = new Set<string>();
      const discarded: ProviderQueryDebug["discarded"] = [];
      const queryErrors: string[] = [];

      try {
        const { payload, requestUrl } = await schedule(() => fetchSerpApiResults(query));
        const results = payload.shopping_results?.slice(0, resultLimit) ?? [];
        let addedOffers = 0;
        console.info("[products][serpapi] search:start", {
          product: query.trim(),
          requestUrl,
          resultLimit
        });

        if (results.length === 0) {
          queryErrors.push("La busqueda no devolvio resultados.");
          errors.push({
            providerId: serpApiProviderId,
            providerLabel: "SerpApi Google Shopping",
            message: "La busqueda no devolvio resultados.",
            query: query.trim()
          });
          debugEntries.push({
            product: query.trim(),
            providerId: serpApiProviderId,
            providerLabel: "SerpApi Google Shopping",
            searched: true,
            requestUrl,
            consultedSources: [],
            resultCount: 0,
            acceptedCount: 0,
            discardedCount: 0,
            discarded: [],
            errors: queryErrors,
            usedMockData: false,
            failureStage: "no_results"
          });
          console.warn("[products][serpapi] search:empty", {
            product: query.trim(),
            requestUrl
          });
          continue;
        }

        for (const result of results) {
          const price = Number(result.extracted_price);
          const url = normalizeUrl(result.product_link || "");
          const source = result.source?.trim() || "Google Shopping";
          consultedSources.add(source);
          console.info("[products][serpapi] search:result", {
            product: query.trim(),
            source,
            url,
            extractedPrice: result.extracted_price
          });

          if (!Number.isFinite(price)) {
            discarded.push({
              source,
              url,
              reason: "Precio invalido o no parseable."
            });
            console.warn("[products][serpapi] search:discarded", {
              product: query.trim(),
              source,
              url,
              reason: "Precio invalido o no parseable."
            });
            continue;
          }

          if (!url) {
            discarded.push({
              source,
              reason: "Resultado sin URL valida."
            });
            console.warn("[products][serpapi] search:discarded", {
              product: query.trim(),
              source,
              reason: "Resultado sin URL valida."
            });
            continue;
          }

          if (!isSpanishStore(result, url)) {
            discarded.push({
              source,
              url,
              reason: "Descartado por no cumplir las senales de tienda espanola."
            });
            console.warn("[products][serpapi] search:discarded", {
              product: query.trim(),
              source,
              url,
              reason: "Descartado por no cumplir las senales de tienda espanola."
            });
            continue;
          }

          offers.push({
            providerId: serpApiProviderId,
            supplier: result.source?.trim() || "Google Shopping",
            name: query.trim(),
            price,
            url,
            availability: getAvailability(result)
          });
          addedOffers += 1;
        }

        if (addedOffers === 0) {
          queryErrors.push("No se encontraron tiendas espanolas para este producto.");
          errors.push({
            providerId: serpApiProviderId,
            providerLabel: "SerpApi Google Shopping",
            message: "No se encontraron tiendas espanolas para este producto.",
            query: query.trim()
          });
        }

        debugEntries.push({
          product: query.trim(),
          providerId: serpApiProviderId,
          providerLabel: "SerpApi Google Shopping",
          searched: true,
          requestUrl,
          consultedSources: Array.from(consultedSources),
          resultCount: results.length,
          acceptedCount: addedOffers,
          discardedCount: discarded.length,
          discarded,
          errors: queryErrors,
          usedMockData: false,
          failureStage:
            addedOffers === 0
              ? discarded.length > 0
                ? "filters"
                : "no_results"
              : "none"
        });
        console.info("[products][serpapi] search:summary", {
          product: query.trim(),
          requestUrl,
          resultsFound: results.length,
          acceptedResults: addedOffers,
          discardedResults: discarded.length,
          consultedSources: Array.from(consultedSources)
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error desconocido.";
        queryErrors.push(message);
        const failureStage = message.includes("Timeout")
          ? "network"
          : message.includes("HTTP")
            ? "http"
            : message.includes("parsear")
              ? "parsing"
              : message.includes("red") || message.includes("bloqueo")
                ? "network"
                : "http";

        errors.push({
          providerId: serpApiProviderId,
          providerLabel: "SerpApi Google Shopping",
          message,
          query: query.trim()
        });
        debugEntries.push({
          product: query.trim(),
          providerId: serpApiProviderId,
          providerLabel: "SerpApi Google Shopping",
          searched: true,
          consultedSources: Array.from(consultedSources),
          resultCount: 0,
          acceptedCount: 0,
          discardedCount: discarded.length,
          discarded,
          errors: queryErrors,
          usedMockData: false,
          failureStage
        });
        console.error("[products][serpapi] search:error", {
          product: query.trim(),
          error: message
        });
      }
    }

    return {
      offers,
      errors,
      debugEntries
    };
  }
};
