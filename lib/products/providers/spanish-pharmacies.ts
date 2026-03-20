import {
  ProductProvider,
  ProductQuery,
  ProviderError,
  ProviderProductOffer,
  ProviderQueryDebug
} from "@/lib/products/types";

type PharmacyDefinition = {
  id: string;
  label: string;
  baseUrl: string;
  buildSearchUrl: (query: string) => string;
};

type SearchCandidate = {
  name: string;
  price: number;
  url: string;
  score: number;
};

const requestTimeoutMs = 8000;

export const spanishPharmacyDefinitions: PharmacyDefinition[] = [
  {
    id: "promofarma",
    label: "Promofarma",
    baseUrl: "https://www.promofarma.com",
    buildSearchUrl: (query) =>
      `https://www.promofarma.com/es/buscar?text=${encodeURIComponent(query)}`
  },
  {
    id: "dosfarma",
    label: "Dosfarma",
    baseUrl: "https://www.dosfarma.com",
    buildSearchUrl: (query) =>
      `https://www.dosfarma.com/search?controller=search&s=${encodeURIComponent(query)}`
  },
  {
    id: "mifarma",
    label: "Mifarma",
    baseUrl: "https://www.mifarma.es",
    buildSearchUrl: (query) =>
      `https://www.mifarma.es/search?controller=search&s=${encodeURIComponent(query)}`
  },
  {
    id: "farmaciasdirect",
    label: "Farmaciasdirect",
    baseUrl: "https://www.farmaciasdirect.com",
    buildSearchUrl: (query) =>
      `https://www.farmaciasdirect.com/search?controller=search&s=${encodeURIComponent(query)}`
  },
  {
    id: "atida",
    label: "Atida",
    baseUrl: "https://www.atida.com",
    buildSearchUrl: (query) =>
      `https://www.atida.com/es-es/search?text=${encodeURIComponent(query)}`
  },
  {
    id: "farmacia-jimenez",
    label: "Farmacia Jimenez",
    baseUrl: "https://www.farmaciajimenez.com",
    buildSearchUrl: (query) =>
      `https://www.farmaciajimenez.com/catalogsearch/result/?q=${encodeURIComponent(query)}`
  },
  {
    id: "farmacia-barata",
    label: "Farmacia Barata",
    baseUrl: "https://www.farmaciabarata.es",
    buildSearchUrl: (query) =>
      `https://www.farmaciabarata.es/search?controller=search&s=${encodeURIComponent(query)}`
  },
  {
    id: "farmacia-morlan",
    label: "Farmacia Morlan",
    baseUrl: "https://www.farmaciamorlan.com",
    buildSearchUrl: (query) =>
      `https://www.farmaciamorlan.com/search?controller=search&s=${encodeURIComponent(query)}`
  },
  {
    id: "farmacia-ribera",
    label: "Farmacia Ribera",
    baseUrl: "https://www.farmaciaribera.es",
    buildSearchUrl: (query) =>
      `https://www.farmaciaribera.es/catalogsearch/result/?q=${encodeURIComponent(query)}`
  },
  {
    id: "farmacia-soler",
    label: "Farmacia Soler",
    baseUrl: "https://www.farmaciasoler.com",
    buildSearchUrl: (query) =>
      `https://www.farmaciasoler.com/search?controller=search&s=${encodeURIComponent(query)}`
  },
  {
    id: "farmacia-internacional",
    label: "Farmacia Internacional",
    baseUrl: "https://www.farmaciainternacional.net",
    buildSearchUrl: (query) =>
      `https://www.farmaciainternacional.net/search?controller=search&s=${encodeURIComponent(query)}`
  },
  {
    id: "farmacia-campoamor",
    label: "Farmacia Campoamor",
    baseUrl: "https://www.farmaciacampoamor.com",
    buildSearchUrl: (query) =>
      `https://www.farmaciacampoamor.com/search?controller=search&s=${encodeURIComponent(query)}`
  },
  {
    id: "farmacia-tedin",
    label: "Farmacia Tedin",
    baseUrl: "https://www.farmaciatedin.es",
    buildSearchUrl: (query) =>
      `https://www.farmaciatedin.es/catalogsearch/result/?q=${encodeURIComponent(query)}`
  },
  {
    id: "farmacia-4-estaciones",
    label: "Farmacia 4 Estaciones",
    baseUrl: "https://www.farmacia4estaciones.es",
    buildSearchUrl: (query) =>
      `https://www.farmacia4estaciones.es/search?controller=search&s=${encodeURIComponent(query)}`
  },
  {
    id: "farmacia-olmos",
    label: "Farmacia Olmos",
    baseUrl: "https://www.farmaciaolmos.es",
    buildSearchUrl: (query) =>
      `https://www.farmaciaolmos.es/search?controller=search&s=${encodeURIComponent(query)}`
  },
  {
    id: "farmacia-lisboa",
    label: "Farmacia Lisboa",
    baseUrl: "https://www.farmacialisboa.es",
    buildSearchUrl: (query) =>
      `https://www.farmacialisboa.es/search?controller=search&s=${encodeURIComponent(query)}`
  },
  {
    id: "farmacia-torres",
    label: "Farmacia Torres",
    baseUrl: "https://www.farmaciatorres.com",
    buildSearchUrl: (query) =>
      `https://www.farmaciatorres.com/search?controller=search&s=${encodeURIComponent(query)}`
  },
  {
    id: "farmacia-ecoceutics",
    label: "Farmacia Ecoceutics",
    baseUrl: "https://www.ecoceutics.com",
    buildSearchUrl: (query) =>
      `https://www.ecoceutics.com/search?controller=search&s=${encodeURIComponent(query)}`
  },
  {
    id: "farmacia-pizarro",
    label: "Farmacia Pizarro",
    baseUrl: "https://www.farmaciapizarro.com",
    buildSearchUrl: (query) =>
      `https://www.farmaciapizarro.com/search?controller=search&s=${encodeURIComponent(query)}`
  },
  {
    id: "farmacia-vila",
    label: "Farmacia Vila",
    baseUrl: "https://www.farmaciavila.com",
    buildSearchUrl: (query) =>
      `https://www.farmaciavila.com/search?controller=search&s=${encodeURIComponent(query)}`
  }
];

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

function resolveUrl(baseUrl: string, candidateUrl: string) {
  try {
    return new URL(candidateUrl, baseUrl).toString();
  } catch {
    return "";
  }
}

function parsePrice(rawPrice: string) {
  const match = rawPrice.match(/(\d{1,4}(?:[.,]\d{3})*(?:[.,]\d{2})?)/);

  if (!match) {
    return null;
  }

  const normalized = match[1].replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function getAvailability(context: string) {
  const normalized = normalizeText(context);

  if (
    normalized.includes("agotado") ||
    normalized.includes("sin stock") ||
    normalized.includes("no disponible")
  ) {
    return "Agotado";
  }

  if (
    normalized.includes("en stock") ||
    normalized.includes("disponible") ||
    normalized.includes("envio inmediato") ||
    normalized.includes("entrega")
  ) {
    return "Disponible";
  }

  return "Consultar";
}

function scoreCandidate(query: string, title: string, context: string) {
  const normalizedQuery = normalizeText(query);
  const normalizedTitle = normalizeText(title);
  const normalizedContext = normalizeText(context);
  const tokens = normalizedQuery.split(/\s+/).filter((token) => token.length > 2);

  if (tokens.length === 0) {
    return 0;
  }

  let score = 0;

  for (const token of tokens) {
    if (normalizedTitle.includes(token)) {
      score += 3;
    } else if (normalizedContext.includes(token)) {
      score += 1;
    }
  }

  return score;
}

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; FarmaciaSearchBot/1.0)"
      },
      next: {
        revalidate: 0
      }
    });

    const html = await response.text();

    return {
      status: response.status,
      html,
      responseTimeMs: Date.now() - startedAt
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Timeout al consultar la farmacia.");
    }

    if (error instanceof TypeError) {
      throw new Error("Error de red al consultar la farmacia.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function extractCandidates(
  query: string,
  definition: PharmacyDefinition,
  html: string
): SearchCandidate[] {
  const anchors = Array.from(
    html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)
  );
  const prices = Array.from(
    html.matchAll(/(?:€|eur|euros?)\s*\d[\d.,]*|\d[\d.,]*\s*(?:€|eur|euros?)/gi)
  );
  const candidates = new Map<string, SearchCandidate>();

  for (const priceMatch of prices) {
    const price = parsePrice(priceMatch[0]);

    if (!Number.isFinite(price)) {
      continue;
    }

    const priceIndex = priceMatch.index ?? 0;
    const nearbyAnchor = anchors.find((anchor) => {
      const anchorIndex = anchor.index ?? 0;
      return Math.abs(anchorIndex - priceIndex) <= 1200;
    });

    if (!nearbyAnchor) {
      continue;
    }

    const url = resolveUrl(definition.baseUrl, decodeHtmlEntities(nearbyAnchor[1]));
    const title = stripHtml(nearbyAnchor[2]).slice(0, 180);
    const context = stripHtml(
      html.slice(Math.max(0, priceIndex - 350), Math.min(html.length, priceIndex + 350))
    );
    const score = scoreCandidate(query, title, context);

    if (!url || !title || score <= 0) {
      continue;
    }

    const existing = candidates.get(url);

    if (
      !existing ||
      score > existing.score ||
      (score === existing.score && price < existing.price)
    ) {
      candidates.set(url, {
        name: title,
        price,
        url,
        score
      });
    }
  }

  return Array.from(candidates.values()).sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }

    if (left.price !== right.price) {
      return left.price - right.price;
    }

    return left.name.localeCompare(right.name);
  });
}

function buildPharmacyProvider(definition: PharmacyDefinition): ProductProvider {
  return {
    id: definition.id,
    label: definition.label,
    async fetchOffers(
      queries: ProductQuery[],
      _options?: {
        debugEnabled?: boolean;
      }
    ) {
      const results = await Promise.all(
        queries.map(async (query) => {
          const trimmedQuery = query.trim();
          const requestUrl = definition.buildSearchUrl(trimmedQuery);
          const discarded: ProviderQueryDebug["discarded"] = [];
          const queryErrors: string[] = [];
          let responseTimeMs = 0;
          let httpStatus: number | undefined;
          let htmlLength = 0;
          let htmlPreview = "";

          try {
            const response = await fetchHtml(requestUrl);
            responseTimeMs = response.responseTimeMs;
            httpStatus = response.status;
            htmlLength = response.html.length;
            htmlPreview = response.html.slice(0, 1000);

            if (response.status >= 400) {
              throw new Error(`Respuesta HTTP ${response.status} al consultar la farmacia.`);
            }

            if (!response.html.trim()) {
              throw new Error("Respuesta vacia al consultar la farmacia.");
            }

            const candidates = extractCandidates(trimmedQuery, definition, response.html);

            if (candidates.length === 0) {
              queryErrors.push("No se encontraron resultados parseables en la farmacia.");
            }

            const bestCandidate = candidates[0];
            const offer: ProviderProductOffer | null = bestCandidate
              ? {
                  providerId: definition.id,
                  supplier: definition.label,
                  name: trimmedQuery,
                  price: bestCandidate.price,
                  url: bestCandidate.url,
                  availability: getAvailability(response.html)
                }
              : null;

            for (const candidate of candidates.slice(1)) {
              discarded.push({
                source: definition.label,
                url: candidate.url,
                reason: "Resultado alternativo no seleccionado."
              });
            }

            const debugEntry: ProviderQueryDebug = {
              product: trimmedQuery,
              providerId: definition.id,
              providerLabel: definition.label,
              searched: true,
              responseTimeMs,
              launchedQuery: trimmedQuery,
              requestUrl,
              httpStatus,
              htmlLength,
              htmlPreview,
              consultedSources: [definition.label],
              resultCount: candidates.length,
              linksDetectedBeforeFilters: candidates.length,
              firstDetectedLinks: candidates.slice(0, 10).map((candidate) => ({
                href: candidate.url,
                text: candidate.name
              })),
              acceptedCount: offer ? 1 : 0,
              discardedCount: discarded.length,
              discardedByCause: {
                alternative_result: discarded.length
              },
              discarded,
              errors: queryErrors,
              usedMockData: false,
              failureStage:
                httpStatus && httpStatus >= 400
                  ? "http_error"
                  : !response.html.trim()
                    ? "empty_body"
                    : candidates.length === 0
                      ? "no_valid_store_results"
                      : "none"
            };

            return {
              offers: offer ? [offer] : [],
              errors:
                offer || queryErrors.length === 0
                  ? []
                  : [
                      {
                        providerId: definition.id,
                        providerLabel: definition.label,
                        message: queryErrors[0],
                        query: trimmedQuery
                      } satisfies ProviderError
                    ],
              debugEntry
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : "Error desconocido.";
            queryErrors.push(message);

            return {
              offers: [] as ProviderProductOffer[],
              errors: [
                {
                  providerId: definition.id,
                  providerLabel: definition.label,
                  message,
                  query: trimmedQuery
                }
              ] satisfies ProviderError[],
              debugEntry: {
                product: trimmedQuery,
                providerId: definition.id,
                providerLabel: definition.label,
                searched: true,
                responseTimeMs,
                launchedQuery: trimmedQuery,
                requestUrl,
                httpStatus,
                htmlLength,
                htmlPreview,
                consultedSources: [definition.label],
                resultCount: 0,
                linksDetectedBeforeFilters: 0,
                firstDetectedLinks: [],
                acceptedCount: 0,
                discardedCount: 0,
                discardedByCause: {},
                discarded: [],
                errors: queryErrors,
                usedMockData: false,
                failureStage:
                  message.includes("HTTP") || message.includes("red") || message.includes("Timeout")
                    ? "http_error"
                    : message.includes("vacia")
                      ? "empty_body"
                      : "parsing"
              } satisfies ProviderQueryDebug
            };
          }
        })
      );

      return {
        offers: results.flatMap((result) => result.offers),
        errors: results.flatMap((result) => result.errors),
        debugEntries: results.map((result) => result.debugEntry)
      };
    }
  };
}

export const spanishPharmacyProviders = spanishPharmacyDefinitions.map(buildPharmacyProvider);
