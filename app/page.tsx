"use client";

import { ChangeEvent, FormEvent, Fragment, useState } from "react";

type ProductFormData = {
  name: string;
};

type ComparisonResult = {
  productName: string;
  stores: Array<{
    providerId: string;
    supplier: string;
    price: number;
    url: string;
    availability: string;
  }>;
};

type ComparisonResponse = {
  ok: boolean;
  comparisons?: ComparisonResult[];
  error?: string;
  providerErrors?: Array<{
    providerId: string;
    providerLabel: string;
    message: string;
    query?: string;
  }>;
  debug?: {
    requestedProducts?: string[];
    providerIds?: string[];
    activeProviders?: Array<{
      id: string;
      label: string;
    }>;
    searchExecution?: string;
    frontendExternalRequests?: boolean;
    corsLikelyIssue?: boolean;
    webSearchAttempted?: boolean;
    mockDataActive?: boolean;
    entries?: Array<{
      product: string;
      providerId: string;
      providerLabel: string;
      searched: boolean;
      searchEngine?: string;
      debugPreviewQuery?: string;
      debugPreviewLinks?: Array<{
        href: string;
        text: string;
      }>;
      requestUrl?: string;
      consultedSources: string[];
      launchedQuery?: string;
      httpStatus?: number;
      htmlLength?: number;
      htmlPreview?: string;
      resultCount: number;
      linksDetectedBeforeFilters?: number;
      firstDetectedLinks?: Array<{
        href: string;
        text: string;
      }>;
      acceptedCount: number;
      discardedCount: number;
      discardedByCause?: Record<string, number>;
      discarded: Array<{
        source?: string;
        url?: string;
        reason: string;
      }>;
      errors: string[];
      usedMockData: boolean;
      failureStage?:
        | "http_error"
        | "empty_body"
        | "html_received_no_links"
        | "links_found_but_filtered"
        | "no_valid_store_results"
        | "parsing"
        | "mock"
        | "none";
    }>;
    totals?: {
      productsRequested: number;
      debugEntries: number;
      resultsAccepted: number;
      resultsDiscarded: number;
      providerErrors: number;
    };
    error?: string;
  };
};

type NetworkTestResponse = {
  ok: boolean;
  url: string;
  status?: number;
  durationMs: number;
  bodyPreview?: string;
  error?: string;
};

const initialForm: ProductFormData = {
  name: ""
};

export default function HomePage() {
  const [formData, setFormData] = useState<ProductFormData>(initialForm);
  const [products, setProducts] = useState<string[]>([]);
  const [comparisons, setComparisons] = useState<ComparisonResult[]>([]);
  const [providerErrors, setProviderErrors] = useState<NonNullable<ComparisonResponse["providerErrors"]>>([]);
  const [debugData, setDebugData] = useState<ComparisonResponse["debug"]>();
  const [statusMessage, setStatusMessage] = useState(
    "Añade varios nombres de producto y compara el mejor precio."
  );
  const [isLoading, setIsLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [networkTest, setNetworkTest] = useState<NetworkTestResponse>();
  const [isTestingNetwork, setIsTestingNetwork] = useState(false);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleAddProduct = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const productNames = formData.name
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);

    if (productNames.length === 0) {
      setStatusMessage("Introduce al menos un nombre de producto valido.");
      return;
    }

    setProducts((current) => [...current, ...productNames]);
    setFormData(initialForm);
    setStatusMessage(
      productNames.length === 1
        ? "Producto añadido. Puedes seguir cargando mas nombres o comparar ahora."
        : `${productNames.length} productos añadidos. Puedes seguir cargando mas nombres o comparar ahora.`
    );
  };

  const handleCompare = async () => {
    if (products.length === 0) {
      setStatusMessage("Necesitas al menos un producto para comparar.");
      return;
    }

    setIsLoading(true);
    setStatusMessage("Comparando precios entre tiendas...");

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ products, debug: true })
      });

      const data = (await response.json()) as ComparisonResponse;
      setDebugData(data.debug);
      setProviderErrors(data.providerErrors || []);

      if (!response.ok || !data.ok || !data.comparisons) {
        setComparisons([]);
        setStatusMessage(data.error || "No se pudo completar la comparacion.");
        return;
      }

      setComparisons(data.comparisons);
      if (data.comparisons.length === 0) {
        setStatusMessage(
          "No se encontraron resultados. Revisa el panel de depuracion para ver en que paso se descartan."
        );
        return;
      }

      setStatusMessage(
        data.comparisons.length < products.length
          ? "Comparacion completada con resultados parciales. Revisa que productos no devolvieron tiendas."
          : "Comparacion completada. Ya tienes hasta 10 tiendas por producto."
      );
    } catch {
      setComparisons([]);
      setProviderErrors([]);
      setDebugData(undefined);
      setStatusMessage("Ha ocurrido un error al llamar al endpoint.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleNetworkTest = async () => {
    setIsTestingNetwork(true);

    try {
      const response = await fetch("/api/debug/network-test");
      const data = (await response.json()) as NetworkTestResponse;
      setNetworkTest(data);
    } catch {
      setNetworkTest({
        ok: false,
        url: "https://example.com",
        durationMs: 0,
        error: "No se pudo llamar al endpoint de test de red."
      });
    } finally {
      setIsTestingNetwork(false);
    }
  };

  const detectedFailureStage = debugData?.entries?.find(
    (entry) => entry.failureStage && entry.failureStage !== "none"
  )?.failureStage;

  const failureStageLabel =
    detectedFailureStage === "http_error"
      ? "Error HTTP o de red al consultar la fuente"
      : detectedFailureStage === "empty_body"
        ? "La respuesta HTTP llego, pero el HTML estaba vacio"
        : detectedFailureStage === "html_received_no_links"
          ? "Se recibio HTML, pero el parser no detecto enlaces"
          : detectedFailureStage === "links_found_but_filtered"
            ? "Se detectaron enlaces, pero todos fueron descartados"
            : detectedFailureStage === "no_valid_store_results"
              ? "No hubo resultados validos de tienda tras el parsing"
              : detectedFailureStage === "parsing"
                ? "Fallo al parsear la respuesta"
                : detectedFailureStage === "mock"
                  ? "Proveedor sin busqueda web real"
                  : null;
  const missingProducts =
    debugData?.requestedProducts?.filter(
      (product) => !comparisons.some((comparison) => comparison.productName === product)
    ) || [];

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Comparador de precios</p>
        <h1>Compara hasta 10 tiendas por producto</h1>
        <p className="lead">
          Introduce los nombres de los productos que quieres consultar y revisa, para cada
          producto, hasta 10 tiendas encontradas ordenadas por precio ascendente.
        </p>
      </section>

      <section className="grid">
        <article className="card">
          <div className="card-header">
            <h2>Nuevos productos</h2>
            <p>Introduce uno o varios nombres, uno por linea.</p>
          </div>

          <form className="product-form" onSubmit={handleAddProduct}>
            <label>
              Productos
              <textarea
                name="name"
                placeholder={"Ej. Camiseta basica\nAuriculares bluetooth\nCafe en grano"}
                value={formData.name}
                onChange={handleChange}
                rows={5}
                required
              />
            </label>

            <div className="actions">
              <button type="submit">Añadir productos</button>
              <button
                className="secondary-button"
                type="button"
                onClick={handleCompare}
                disabled={isLoading}
              >
                {isLoading ? "Comparando..." : "Comparar precios"}
              </button>
            </div>
          </form>
        </article>

        <aside className="card preview">
          <div className="card-header">
            <h2>Productos cargados</h2>
            <p>{statusMessage}</p>
          </div>

          <label className="debug-toggle">
            <input
              type="checkbox"
              checked={showDebug}
              onChange={() => setShowDebug((current) => !current)}
            />
            Mostrar modo debug
          </label>

          <div className="debug-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={handleNetworkTest}
              disabled={isTestingNetwork}
            >
              {isTestingNetwork ? "Probando red..." : "Test de red servidor"}
            </button>
          </div>

          <div className="debug-hint">
            <strong>Proveedor activo:</strong>{" "}
            {debugData?.activeProviders?.map((provider) => provider.label).join(", ") ||
              "sin ejecutar aun"}
            {" | "}
            <strong>Ubicacion de la busqueda:</strong>{" "}
            {debugData?.searchExecution === "backend"
              ? "backend"
              : "sin ejecutar aun"}
            {" | "}
            <strong>Busquedas externas desde frontend:</strong>{" "}
            {debugData?.frontendExternalRequests ? "Si" : "No"}
            {" | "}
            <strong>CORS probable:</strong> {debugData?.corsLikelyIssue ? "Si" : "No"}
          </div>

          {debugData?.mockDataActive ? (
            <p className="warning-banner">
              Aviso: el modo testing/mock esta activo. El proveedor manual solo debe usarse
              cuando `USE_MOCK=true`.
            </p>
          ) : null}

          {providerErrors.length > 0 ? (
            <div className="error-panel">
              <strong>Errores detectados</strong>
              <ul>
                {providerErrors.map((providerError, index) => (
                  <li key={`${providerError.providerId}-${providerError.query || index}`}>
                    {providerError.providerLabel}: {providerError.message}
                    {providerError.query ? ` (${providerError.query})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {failureStageLabel ? (
            <p className="warning-banner">
              Diagnostico principal: <strong>{failureStageLabel}</strong>
            </p>
          ) : null}

          {networkTest ? (
            <div className="network-test-panel">
              <strong>Test de red del servidor</strong>
              <p>URL: {networkTest.url}</p>
              <p>Estado: {typeof networkTest.status === "number" ? networkTest.status : "Sin status"}</p>
              <p>Duracion: {networkTest.durationMs} ms</p>
              <p>Resultado: {networkTest.ok ? "Conexion correcta desde backend" : "Fallo de red"}</p>
              {networkTest.error ? <p>Error: {networkTest.error}</p> : null}
            </div>
          ) : null}

          {products.length > 0 ? (
            <ul className="offer-list">
              {products.map((product, index) => (
                <li key={`${product}-${index}`}>
                  <strong>{product}</strong>
                  <span>Listo para comparar</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">
              Todavia no hay productos cargados. Añade varios para obtener una comparacion.
            </p>
          )}
        </aside>
      </section>

      <section className="card results-card">
        <div className="card-header">
          <h2>Resumen</h2>
          <p>Tabla agrupada visualmente por producto con hasta 10 tiendas ordenadas por precio.</p>
        </div>

        {comparisons.length > 0 ? (
          <>
            {missingProducts.length > 0 ? (
              <p className="warning-banner">
                Sin resultados para: <strong>{missingProducts.join(", ")}</strong>. Consulta el
                modo debug para ver el motivo exacto por producto.
              </p>
            ) : null}
            <div className="table-wrap">
              <table className="results-table grouped-results-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Tienda</th>
                    <th>Precio</th>
                    <th>Disponibilidad</th>
                    <th>Enlace</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisons.map((comparison) => (
                    <Fragment key={comparison.productName}>
                      <tr className="product-group-row">
                        <td colSpan={5}>
                          <div className="product-group-header">
                            <div>
                              <p className="store-label">Producto</p>
                              <strong>{comparison.productName}</strong>
                            </div>
                            <span className="result-count">
                              {comparison.stores.length} tienda{comparison.stores.length === 1 ? "" : "s"}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {comparison.stores.map((store, index) => (
                        <tr
                          key={`${comparison.productName}-${store.providerId}-${store.supplier}`}
                          className="product-store-row"
                        >
                          <td>{index + 1}</td>
                          <td>
                            <strong>{store.supplier}</strong>
                          </td>
                          <td>{store.price.toFixed(2)} EUR</td>
                          <td>
                            <span className="availability-pill">{store.availability}</span>
                          </td>
                          <td>
                            <a
                              href={store.url}
                              target="_blank"
                              rel="noreferrer"
                              className="result-link"
                            >
                              Ver oferta
                            </a>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p>
              {products.length > 0
                ? "No hay resultados para mostrar. Revisa los errores y el modo debug para ver si la busqueda falla, si la respuesta llega vacia o si todos los resultados se estan descartando."
                : "Los resultados por producto apareceran cuando compares los productos cargados."}
            </p>
          </div>
        )}
      </section>

      {showDebug ? (
        <section className="card results-card">
          <div className="card-header">
            <h2>Debug</h2>
            <p>Resumen del flujo de busqueda, parseo, filtrado y entrega al frontend.</p>
          </div>

          {debugData ? (
            <div className="debug-panel">
              <div className="debug-summary">
                <span>Busqueda web: {debugData.webSearchAttempted ? "Si" : "No"}</span>
                <span>
                  Proveedores:{" "}
                  {debugData.activeProviders?.map((provider) => provider.label).join(", ") || "n/d"}
                </span>
                <span>Ejecucion: {debugData.searchExecution || "n/d"}</span>
                <span>Frontend externo: {debugData.frontendExternalRequests ? "Si" : "No"}</span>
                <span>CORS probable: {debugData.corsLikelyIssue ? "Si" : "No"}</span>
                <span>Modo mock/testing: {debugData.mockDataActive ? "Si" : "No"}</span>
                <span>Resultados aceptados: {debugData.totals?.resultsAccepted ?? 0}</span>
                <span>Resultados descartados: {debugData.totals?.resultsDiscarded ?? 0}</span>
              </div>

              {debugData.entries?.map((entry, index) => (
                <article
                  key={`${entry.providerId}-${entry.product}-${index}`}
                  className="debug-entry"
                >
                  <h3>{entry.product}</h3>
                  <p>
                    Proveedor: {entry.providerLabel} | Busqueda web: {entry.searched ? "Si" : "No"}
                  </p>
                  <p>Motor de busqueda: {entry.searchEngine || "n/d"}</p>
                  {entry.debugPreviewQuery ? (
                    <div className="debug-subpanel">
                      <strong>Vista previa sin filtros</strong>
                      <p>Query debug: {entry.debugPreviewQuery}</p>
                      {entry.debugPreviewLinks && entry.debugPreviewLinks.length > 0 ? (
                        <ul>
                          {entry.debugPreviewLinks.map((item, itemIndex) => (
                            <li key={`${entry.product}-preview-link-${itemIndex}`}>
                              {item.href} | {item.text || "Sin texto"}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>No se detectaron enlaces en la vista previa cruda del buscador.</p>
                      )}
                    </div>
                  ) : null}
                  <p>Query lanzada: {entry.launchedQuery || "No disponible"}</p>
                  <p>
                    Fase del fallo:{" "}
                    {entry.failureStage && entry.failureStage !== "none"
                      ? entry.failureStage
                      : "sin fallo detectado"}
                  </p>
                  <p>Status HTTP: {typeof entry.httpStatus === "number" ? entry.httpStatus : "n/d"}</p>
                  <p>Longitud HTML: {typeof entry.htmlLength === "number" ? entry.htmlLength : 0}</p>
                  <p>Enlaces detectados antes de filtros: {entry.linksDetectedBeforeFilters ?? 0}</p>
                  <p>URL/Fuente consultada: {entry.requestUrl || "No aplica"}</p>
                  {entry.htmlPreview ? (
                    <div className="debug-subpanel">
                      <strong>Primeros 1000 caracteres del HTML</strong>
                      <pre className="debug-pre">{entry.htmlPreview}</pre>
                    </div>
                  ) : null}
                  {entry.firstDetectedLinks && entry.firstDetectedLinks.length > 0 ? (
                    <div className="debug-subpanel">
                      <strong>Primeros 10 enlaces detectados</strong>
                      <ul>
                        {entry.firstDetectedLinks.map((item, itemIndex) => (
                          <li key={`${entry.product}-link-${itemIndex}`}>
                            {item.href} | {item.text || "Sin texto"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : entry.linksDetectedBeforeFilters === 0 ? (
                    <div className="debug-subpanel">
                      <strong>Parser</strong>
                      <p>No se detectaron enlaces candidatos en el HTML recibido.</p>
                    </div>
                  ) : null}
                  <p>
                    Tiendas consultadas:{" "}
                    {entry.consultedSources.length > 0
                      ? entry.consultedSources.join(", ")
                      : "Sin fuentes registradas"}
                  </p>
                  <p>
                    Resultados encontrados: {entry.resultCount} | Aceptados: {entry.acceptedCount} |
                    Descartados: {entry.discardedCount}
                  </p>
                  {entry.discardedByCause ? (
                    <div className="debug-subpanel">
                      <strong>Descartes por causa</strong>
                      <ul>
                        {Object.entries(entry.discardedByCause).map(([cause, count]) => (
                          <li key={`${entry.product}-cause-${cause}`}>
                            {cause}: {count}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {entry.errors.length > 0 ? (
                    <div className="debug-subpanel">
                      <strong>Errores</strong>
                      <ul>
                        {entry.errors.map((item, itemIndex) => (
                          <li key={`${entry.product}-error-${itemIndex}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {entry.discarded.length > 0 ? (
                    <div className="debug-subpanel">
                      <strong>Resultados descartados</strong>
                      <ul>
                        {entry.discarded.map((item, itemIndex) => (
                          <li key={`${entry.product}-discarded-${itemIndex}`}>
                            {item.source || "Sin fuente"}: {item.reason}
                            {item.url ? ` (${item.url})` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">Aun no hay informacion de debug. Ejecuta una comparacion.</p>
          )}
        </section>
      ) : null}
    </main>
  );
}
