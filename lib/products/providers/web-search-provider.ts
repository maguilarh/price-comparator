import {
  ProductProvider,
  ProductQuery,
  ProviderError,
  ProviderProductOffer,
  ProviderQueryDebug
} from "@/lib/products/types";
import { createRateLimiter } from "@/lib/products/rate-limiter";

export const webSearchProviderId = "websearch";

type DuckDuckGoSearchResult = {
  title: string;
  url: string;
  snippet: string;
  source: string;
};

const searchBaseUrl = "https://html.duckduckgo.com/html/";
const maxSearchResults = 12;
const maxAcceptedOffersPerProduct = 10;
const minIntervalMs = 400;
const searchTimeoutMs = 8000;
const pageTimeoutMs = 6000;
const spanishDomainSuffixes = [".es"];
const euroSignals = ["eur", "euro", "euros", "€"];
const spanishSignals = [
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
  "envio a espana",
  "envio en espana",
  "entrega en espana",
  "shipping to spain"
];
const availabilitySignals = {
  available: ["en stock", "disponible", "entrega", "recibelo", "envio inmediato"],
  unavailable: ["agotado", "sin stock", "no disponible", "out of stock"]
};

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function stripHtml(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function getSupplierFromUrl(url: string) {
  const hostname = getHostname(url).replace(/^www\./, "");
  return hostname || "Fuente desconocida";
}

function isSpanishDomain(url: string) {
  const hostname = getHostname(url);
  return spanishDomainSuffixes.some((suffix) => hostname.endsWith(suffix));
}

function hasSpanishSignals(text: string) {
  const normalized = normalizeText(text);
  return spanishSignals.some((signal) => normalized.includes(signal));
}

function hasEuroSignals(text: string) {
  const normalized = normalizeText(text);
  return euroSignals.some((signal) => normalized.includes(signal));
}

function getAvailability(text: string) {
  const normalized = normalizeText(text);

  if (availabilitySignals.unavailable.some((signal) => normalized.includes(signal))) {
    return "Agotado";
  }

  if (availabilitySignals.available.some((signal) => normalized.includes(signal))) {
    return "Disponible";
  }

  return "Consultar";
}

function parsePriceFromHtml(html: string) {
  const metaMatch =
    html.match(/product:price:amount["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["'][^>]*product:price:amount/i);

  if (metaMatch) {
    const value = Number(metaMatch[1].replace(",", "."));
    if (Number.isFinite(value)) {
      return value;
    }
  }

  const text = stripHtml(html);
  const patterns = [
    /(?:€|eur|euros?)\s?(\d{1,4}(?:[.,]\d{3})*(?:[.,]\d{2})?)/i,
    /(\d{1,4}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s?(?:€|eur|euros?)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    const normalized = match[1].replace(/\./g, "").replace(",", ".");
    const value = Number(normalized);

    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function resolveDuckDuckGoUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl, searchBaseUrl);
    const redirected = parsed.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : parsed.toString();
  } catch {
    return rawUrl;
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number, accept: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: accept,
        "User-Agent": "Mozilla/5.0 (compatible; ProductSearchBot/1.0)"
      },
      next: {
        revalidate: 0
      }
    });

    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timeout al consultar ${url}`);
    }

    if (error instanceof TypeError) {
      throw new Error(`Error de red al consultar ${url}`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSearchResults(query: string) {
  const params = new URLSearchParams({
    q: `${query} comprar tienda Espana precio`
  });
  const requestUrl = `${searchBaseUrl}?${params.toString()}`;
  const response = await fetchWithTimeout(requestUrl, searchTimeoutMs, "text/html");

  if (!response.ok) {
    throw new Error(`Respuesta HTTP ${response.status} en busqueda web.`);
  }

  const html = await response.text();

  if (!html.trim()) {
    throw new Error("Respuesta vacia en busqueda web.");
  }

  const anchorRegex =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  const anchors = Array.from(html.matchAll(anchorRegex));
  const snippets = Array.from(html.matchAll(snippetRegex));

  const results: DuckDuckGoSearchResult[] = anchors.slice(0, maxSearchResults).map((match, index) => {
    const url = resolveDuckDuckGoUrl(decodeHtmlEntities(match[1]));
    const title = stripHtml(match[2]);
    const snippet = snippets[index] ? stripHtml(snippets[index][1]) : "";

    return {
      title,
      url,
      snippet,
      source: getSupplierFromUrl(url)
    };
  });

  return {
    requestUrl,
    results
  };
}

async function fetchOfferDetails(result: DuckDuckGoSearchResult) {
  const response = await fetchWithTimeout(result.url, pageTimeoutMs, "text/html");

  if (!response.ok) {
    throw new Error(`Respuesta HTTP ${response.status} al abrir la tienda.`);
  }

  const html = await response.text();

  if (!html.trim()) {
    throw new Error("Respuesta vacia al abrir la tienda.");
  }

  const pageText = stripHtml(html);
  const combinedText = `${result.title} ${result.snippet} ${pageText}`;
  const price = parsePriceFromHtml(html);

  if (!Number.isFinite(price)) {
    throw new Error("No se pudo extraer un precio valido.");
  }

  if (!isSpanishDomain(result.url) && !(hasEuroSignals(combinedText) && hasSpanishSignals(combinedText))) {
    throw new Error("La tienda no parece espanola.");
  }

  return {
    supplier: result.source,
    price,
    url: result.url,
    availability: getAvailability(combinedText)
  };
}

export const webSearchProductsProvider: ProductProvider = {
  id: webSearchProviderId,
  label: "Web Search",
  async fetchOffers(queries: ProductQuery[]) {
    const schedule = createRateLimiter(minIntervalMs);
    const errors: ProviderError[] = [];
    const offers: ProviderProductOffer[] = [];
    const debugEntries: ProviderQueryDebug[] = [];

    for (const query of queries) {
      const consultedSources = new Set<string>();
      const discarded: ProviderQueryDebug["discarded"] = [];
      const queryErrors: string[] = [];
      let requestUrl = "";
      let rawResultsCount = 0;
      let acceptedCount = 0;

      try {
        const search = await schedule(() => fetchSearchResults(query.trim()));
        requestUrl = search.requestUrl;
        rawResultsCount = search.results.length;

        console.info("[products][websearch] search:start", {
          product: query.trim(),
          requestUrl,
          rawResultsCount
        });

        if (search.results.length === 0) {
          throw new Error("La busqueda web no devolvio resultados.");
        }

        for (const result of search.results) {
          consultedSources.add(result.source);
          console.info("[products][websearch] search:result", {
            product: query.trim(),
            source: result.source,
            url: result.url
          });

          try {
            const offer = await schedule(() => fetchOfferDetails(result));

            offers.push({
              providerId: webSearchProviderId,
              supplier: offer.supplier,
              name: query.trim(),
              price: offer.price,
              url: offer.url,
              availability: offer.availability
            });
            acceptedCount += 1;

            if (acceptedCount >= maxAcceptedOffersPerProduct) {
              break;
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : "Error desconocido.";
            discarded.push({
              source: result.source,
              url: result.url,
              reason: message
            });
            console.warn("[products][websearch] search:discarded", {
              product: query.trim(),
              source: result.source,
              url: result.url,
              reason: message
            });
          }
        }

        if (acceptedCount === 0) {
          queryErrors.push("No se pudo convertir ningun resultado web en oferta valida.");
          errors.push({
            providerId: webSearchProviderId,
            providerLabel: "Web Search",
            message: "No se pudo convertir ningun resultado web en oferta valida.",
            query: query.trim()
          });
        }

        debugEntries.push({
          product: query.trim(),
          providerId: webSearchProviderId,
          providerLabel: "Web Search",
          searched: true,
          requestUrl,
          consultedSources: Array.from(consultedSources),
          resultCount: rawResultsCount,
          acceptedCount,
          discardedCount: discarded.length,
          discarded,
          errors: queryErrors,
          usedMockData: false,
          failureStage:
            acceptedCount === 0
              ? rawResultsCount === 0
                ? "no_results"
                : discarded.length > 0
                  ? "filters"
                  : "network"
              : "none"
        });

        console.info("[products][websearch] search:summary", {
          product: query.trim(),
          requestUrl,
          resultsFound: rawResultsCount,
          acceptedCount,
          discardedCount: discarded.length,
          consultedSources: Array.from(consultedSources)
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error desconocido.";
        queryErrors.push(message);
        errors.push({
          providerId: webSearchProviderId,
          providerLabel: "Web Search",
          message,
          query: query.trim()
        });

        debugEntries.push({
          product: query.trim(),
          providerId: webSearchProviderId,
          providerLabel: "Web Search",
          searched: true,
          requestUrl,
          consultedSources: Array.from(consultedSources),
          resultCount: rawResultsCount,
          acceptedCount,
          discardedCount: discarded.length,
          discarded,
          errors: queryErrors,
          usedMockData: false,
          failureStage:
            message.includes("Timeout") || message.includes("red")
              ? "network"
              : message.includes("HTTP")
                ? "http"
                : message.includes("parse")
                  ? "parsing"
                  : rawResultsCount === 0
                    ? "no_results"
                    : "filters"
        });

        console.error("[products][websearch] search:error", {
          product: query.trim(),
          requestUrl,
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
