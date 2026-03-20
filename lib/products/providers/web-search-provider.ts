import {
  ProductProvider,
  ProductQuery,
  ProviderError,
  ProviderProductOffer,
  ProviderQueryDebug
} from "@/lib/products/types";
import { createRateLimiter } from "@/lib/products/rate-limiter";

export const webSearchProviderId = "websearch";

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  source: string;
};

type RawDetectedLink = {
  href: string;
  text: string;
};

type SearchEngineId = "duckduckgo_html" | "bing_html";

type SearchAttempt = {
  engine: SearchEngineId;
  requestUrl: string;
  launchedQuery: string;
  httpStatus: number;
  htmlLength: number;
  htmlPreview: string;
  linksDetectedBeforeFilters: number;
  firstDetectedLinks: RawDetectedLink[];
  results: SearchResult[];
};

const duckDuckGoSearchBaseUrl = "https://html.duckduckgo.com/html/";
const bingSearchBaseUrl = "https://www.bing.com/search";
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

function isDuckDuckGoHost(hostname: string) {
  return hostname === "duckduckgo.com" || hostname === "html.duckduckgo.com";
}

function isBingHost(hostname: string) {
  return hostname === "bing.com" || hostname === "www.bing.com";
}

function isUsefulSearchResultUrl(url: string) {
  const hostname = getHostname(url);

  if (!hostname) {
    return false;
  }

  if (isDuckDuckGoHost(hostname)) {
    try {
      const parsed = new URL(url);
      return Boolean(parsed.searchParams.get("uddg"));
    } catch {
      return false;
    }
  }

  if (isBingHost(hostname)) {
    return false;
  }

  return /^https?:\/\//i.test(url);
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
    const parsed = new URL(rawUrl, duckDuckGoSearchBaseUrl);
    const redirected = parsed.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : parsed.toString();
  } catch {
    return rawUrl;
  }
}

function resolveBingUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl, bingSearchBaseUrl);

    if (isBingHost(parsed.hostname)) {
      const redirected = parsed.searchParams.get("u");
      if (redirected) {
        return decodeURIComponent(redirected);
      }
    }

    return parsed.toString();
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

function parseDuckDuckGoResults(html: string) {
  const anchorRegex =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  const anchors = Array.from(html.matchAll(anchorRegex));
  const snippets = Array.from(html.matchAll(snippetRegex));
  const genericAnchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const genericAnchors = Array.from(html.matchAll(genericAnchorRegex));
  const sourceAnchors = (anchors.length > 0 ? anchors : genericAnchors).filter((match) => {
    const resolvedUrl = resolveDuckDuckGoUrl(decodeHtmlEntities(match[1]));
    const text = stripHtml(match[2]);

    return isUsefulSearchResultUrl(resolvedUrl) && Boolean(text);
  });

  const firstDetectedLinks: RawDetectedLink[] = sourceAnchors.slice(0, 10).map((match) => ({
    href: resolveDuckDuckGoUrl(decodeHtmlEntities(match[1])),
    text: stripHtml(match[2]).slice(0, 160)
  }));

  const results: SearchResult[] = sourceAnchors
    .slice(0, maxSearchResults)
    .map((match, index) => {
      const url = resolveDuckDuckGoUrl(decodeHtmlEntities(match[1]));
      const title = stripHtml(match[2]);
      const snippet = snippets[index] ? stripHtml(snippets[index][1]) : "";

      return {
        title,
        url,
        snippet,
        source: getSupplierFromUrl(url)
      };
    })
    .filter((result) => Boolean(result.url) && Boolean(result.title));

  return {
    linksDetectedBeforeFilters: sourceAnchors.length,
    firstDetectedLinks,
    results
  };
}

function parseBingResults(html: string) {
  const resultRegex =
    /<li[^>]*class="[^"]*\bb_algo\b[^"]*"[\s\S]*?<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>([\s\S]*?)<\/li>/gi;
  const matches = Array.from(html.matchAll(resultRegex));
  const genericAnchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const genericAnchors = Array.from(html.matchAll(genericAnchorRegex));

  const structuredMatches = matches.filter((match) => {
    const resolvedUrl = resolveBingUrl(decodeHtmlEntities(match[1]));
    const text = stripHtml(match[2]);

    return isUsefulSearchResultUrl(resolvedUrl) && Boolean(text);
  });

  const sourceAnchors =
    structuredMatches.length > 0
      ? structuredMatches
      : genericAnchors.filter((match) => {
          const resolvedUrl = resolveBingUrl(decodeHtmlEntities(match[1]));
          const text = stripHtml(match[2]);

          return isUsefulSearchResultUrl(resolvedUrl) && Boolean(text);
        });

  const firstDetectedLinks: RawDetectedLink[] = sourceAnchors.slice(0, 10).map((match) => ({
    href: resolveBingUrl(decodeHtmlEntities(match[1])),
    text: stripHtml(match[2]).slice(0, 160)
  }));

  const results: SearchResult[] = sourceAnchors
    .slice(0, maxSearchResults)
    .map((match) => {
      const url = resolveBingUrl(decodeHtmlEntities(match[1]));
      const title = stripHtml(match[2]);
      const snippet = match[3] ? stripHtml(match[3]).slice(0, 300) : "";

      return {
        title,
        url,
        snippet,
        source: getSupplierFromUrl(url)
      };
    })
    .filter((result) => Boolean(result.url) && Boolean(result.title));

  return {
    linksDetectedBeforeFilters: sourceAnchors.length,
    firstDetectedLinks,
    results
  };
}

async function fetchSearchAttempt(
  engine: SearchEngineId,
  launchedQuery: string
): Promise<SearchAttempt> {
  const requestUrl =
    engine === "duckduckgo_html"
      ? `${duckDuckGoSearchBaseUrl}?${new URLSearchParams({ q: launchedQuery }).toString()}`
      : `${bingSearchBaseUrl}?${new URLSearchParams({
          q: launchedQuery,
          setlang: "es-ES",
          cc: "es"
        }).toString()}`;
  const response = await fetchWithTimeout(requestUrl, searchTimeoutMs, "text/html");
  const httpStatus = response.status;

  if (!response.ok) {
    throw new Error(`Respuesta HTTP ${response.status} en busqueda web.`);
  }

  const html = await response.text();
  const htmlLength = html.length;
  const htmlPreview = html.slice(0, 1000);

  if (!html.trim()) {
    throw new Error("Respuesta vacia en busqueda web.");
  }

  const parsed =
    engine === "duckduckgo_html" ? parseDuckDuckGoResults(html) : parseBingResults(html);

  return {
    engine,
    launchedQuery,
    requestUrl,
    httpStatus,
    htmlLength,
    htmlPreview,
    linksDetectedBeforeFilters: parsed.linksDetectedBeforeFilters,
    firstDetectedLinks: parsed.firstDetectedLinks,
    results: parsed.results
  };
}

async function fetchSearchResults(query: string, launchedQueryOverride?: string) {
  const launchedQuery = launchedQueryOverride ?? `${query} comprar tienda Espana precio`;
  const attempts: SearchAttempt[] = [];
  const attemptErrors: string[] = [];

  for (const engine of ["duckduckgo_html", "bing_html"] as const) {
    try {
      const attempt = await fetchSearchAttempt(engine, launchedQuery);
      attempts.push(attempt);

      if (attempt.results.length > 0) {
        return {
          ...attempt,
          attempts,
          attemptErrors
        };
      }

      attemptErrors.push(`${engine}: sin resultados parseables`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido.";
      attemptErrors.push(`${engine}: ${message}`);
    }
  }

  if (attempts.length > 0) {
    return {
      ...attempts[attempts.length - 1],
      attempts,
      attemptErrors
    };
  }

  throw new Error(
    attemptErrors.length > 0
      ? `Todos los motores de busqueda fallaron. ${attemptErrors.join(" | ")}`
      : "Todos los motores de busqueda fallaron sin detalle adicional."
  );
}

async function fetchOfferDetails(result: SearchResult) {
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
  async fetchOffers(
    queries: ProductQuery[],
    options?: {
      debugEnabled?: boolean;
    }
  ) {
    const schedule = createRateLimiter(minIntervalMs);
    const errors: ProviderError[] = [];
    const offers: ProviderProductOffer[] = [];
    const debugEntries: ProviderQueryDebug[] = [];

    for (const query of queries) {
      const consultedSources = new Set<string>();
      const discarded: ProviderQueryDebug["discarded"] = [];
      const discardedByCause: Record<string, number> = {
        no_domain: 0,
        non_spanish_domain: 0,
        blocked_domain: 0,
        missing_price: 0,
        irrelevant_result: 0
      };
      const queryErrors: string[] = [];
      let requestUrl = "";
      let searchEngine = "";
      let debugPreviewQuery = "";
      let debugPreviewLinks: RawDetectedLink[] = [];
      let launchedQuery = "";
      let httpStatus: number | undefined;
      let htmlLength = 0;
      let htmlPreview = "";
      let rawResultsCount = 0;
      let linksDetectedBeforeFilters = 0;
      let firstDetectedLinks: RawDetectedLink[] = [];
      let acceptedCount = 0;

      try {
        if (options?.debugEnabled) {
          try {
            const previewSearch = await schedule(() =>
              fetchSearchResults(query.trim(), `${query.trim()} comprar`)
            );
            debugPreviewQuery = previewSearch.launchedQuery;
            debugPreviewLinks = previewSearch.firstDetectedLinks;

            console.info("[products][websearch] debug:preview", {
              product: query.trim(),
              debugPreviewQuery,
              linksDetected: previewSearch.linksDetectedBeforeFilters,
              previewLinks: debugPreviewLinks
            });
          } catch (previewError) {
            const previewMessage =
              previewError instanceof Error
                ? previewError.message
                : "Error desconocido en la vista previa de debug.";
            queryErrors.push(`Debug preview: ${previewMessage}`);

            console.warn("[products][websearch] debug:preview:error", {
              product: query.trim(),
              error: previewMessage
            });
          }
        }

        const search = await schedule(() => fetchSearchResults(query.trim()));
        searchEngine = search.engine;
        launchedQuery = search.launchedQuery;
        requestUrl = search.requestUrl;
        httpStatus = search.httpStatus;
        htmlLength = search.htmlLength;
        htmlPreview = search.htmlPreview;
        rawResultsCount = search.results.length;
        linksDetectedBeforeFilters = search.linksDetectedBeforeFilters;
        firstDetectedLinks = search.firstDetectedLinks;
        queryErrors.push(...search.attemptErrors);

        console.info("[products][websearch] search:start", {
          product: query.trim(),
          searchEngine,
          launchedQuery,
          requestUrl,
          httpStatus,
          htmlLength,
          linksDetectedBeforeFilters,
          rawResultsCount
        });

        if (linksDetectedBeforeFilters === 0) {
          throw new Error("El parser no detecto enlaces en el HTML recibido.");
        }

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
            const hostname = (() => {
              try {
                return new URL(result.url).hostname;
              } catch {
                return "";
              }
            })();
            const normalizedMessage = message.toLowerCase();

            if (!hostname) {
              discardedByCause.no_domain += 1;
            } else if (normalizedMessage.includes("no parece espanola")) {
              discardedByCause.non_spanish_domain += 1;
            } else if (
              normalizedMessage.includes("403") ||
              normalizedMessage.includes("401") ||
              normalizedMessage.includes("bloque") ||
              normalizedMessage.includes("forbidden")
            ) {
              discardedByCause.blocked_domain += 1;
            } else if (normalizedMessage.includes("precio valido")) {
              discardedByCause.missing_price += 1;
            } else {
              discardedByCause.irrelevant_result += 1;
            }

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
          searchEngine,
          debugPreviewQuery,
          debugPreviewLinks,
          launchedQuery,
          requestUrl,
          httpStatus,
          htmlLength,
          htmlPreview,
          consultedSources: Array.from(consultedSources),
          resultCount: rawResultsCount,
          linksDetectedBeforeFilters,
          firstDetectedLinks,
          acceptedCount,
          discardedCount: discarded.length,
          discardedByCause,
          discarded,
          errors: queryErrors,
          usedMockData: false,
          failureStage:
            acceptedCount === 0
              ? htmlLength === 0
                ? "empty_body"
                : linksDetectedBeforeFilters === 0
                  ? "html_received_no_links"
                  : rawResultsCount === 0
                    ? "no_valid_store_results"
                    : discarded.length > 0
                      ? "links_found_but_filtered"
                      : "no_valid_store_results"
              : "none"
        });

        console.info("[products][websearch] search:summary", {
          product: query.trim(),
          searchEngine,
          launchedQuery,
          requestUrl,
          httpStatus,
          htmlLength,
          linksDetectedBeforeFilters,
          resultsFound: rawResultsCount,
          acceptedCount,
          discardedCount: discarded.length,
          discardedByCause,
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
          searchEngine,
          debugPreviewQuery,
          debugPreviewLinks,
          launchedQuery,
          requestUrl,
          httpStatus,
          htmlLength,
          htmlPreview,
          consultedSources: Array.from(consultedSources),
          resultCount: rawResultsCount,
          linksDetectedBeforeFilters,
          firstDetectedLinks,
          acceptedCount,
          discardedCount: discarded.length,
          discardedByCause,
          discarded,
          errors: queryErrors,
          usedMockData: false,
          failureStage:
            message.includes("Timeout") || message.includes("red")
              ? "http_error"
              : message.includes("Respuesta HTTP")
                ? "http_error"
                : message.includes("vacia")
                  ? "empty_body"
                  : message.includes("no detecto enlaces")
                    ? "html_received_no_links"
                    : linksDetectedBeforeFilters > 0 && discarded.length > 0
                      ? "links_found_but_filtered"
                      : rawResultsCount === 0
                        ? "no_valid_store_results"
                        : "parsing"
        });

        console.error("[products][websearch] search:error", {
          product: query.trim(),
          launchedQuery,
          requestUrl,
          httpStatus,
          htmlLength,
          linksDetectedBeforeFilters,
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
