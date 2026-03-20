"use client";

import { ChangeEvent, FormEvent, useState } from "react";

type ProductFormData = {
  name: string;
};

type ComparisonResult = {
  supplier: string;
  providerId: string;
  totalProducts: number;
  totalPrice: number;
  averagePrice: number;
  bestOffer: {
    productName: string;
    price: number;
    url: string;
  };
};

type ComparisonResponse = {
  ok: boolean;
  comparisons?: ComparisonResult[];
  error?: string;
};

const initialForm: ProductFormData = {
  name: ""
};

export default function HomePage() {
  const [formData, setFormData] = useState<ProductFormData>(initialForm);
  const [products, setProducts] = useState<string[]>([]);
  const [comparisons, setComparisons] = useState<ComparisonResult[]>([]);
  const [statusMessage, setStatusMessage] = useState(
    "Añade varios nombres de producto y compara el mejor precio."
  );
  const [isLoading, setIsLoading] = useState(false);
  const cheapestTotal = comparisons.length > 0 ? comparisons[0].totalPrice : null;

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
        body: JSON.stringify({ products })
      });

      const data = (await response.json()) as ComparisonResponse;

      if (!response.ok || !data.ok || !data.comparisons) {
        setComparisons([]);
        setStatusMessage(data.error || "No se pudo completar la comparacion.");
        return;
      }

      setComparisons(data.comparisons);
      setStatusMessage(
        "Comparacion completada. Solo se muestran tiendas con el catalogo completo."
      );
    } catch {
      setComparisons([]);
      setStatusMessage("Ha ocurrido un error al llamar al endpoint.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Comparador de precios</p>
        <h1>Compara resultados agrupados por tienda</h1>
        <p className="lead">
          Introduce los nombres de los productos que quieres consultar y compara los
          resultados agrupados por tienda. La tabla solo mostrara tiendas con catalogo
          completo, su suma total y la mejor oferta individual.
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
          <h2>Resumen por tienda</h2>
          <p>Resultado de la comparacion de tiendas que cubren todo el catalogo solicitado.</p>
        </div>

        {comparisons.length > 0 ? (
          <div className="store-results">
            {comparisons.map((comparison) => {
              const isCheapest = comparison.totalPrice === cheapestTotal;

              return (
                <article
                  key={`${comparison.providerId}-${comparison.supplier}`}
                  className={`store-card${isCheapest ? " store-card-featured" : ""}`}
                >
                  <div className="store-card-header">
                    <div>
                      <p className="store-label">Tienda</p>
                      <h3>{comparison.supplier}</h3>
                    </div>
                    {isCheapest ? <span className="best-badge">Mas barata</span> : null}
                  </div>

                  <div className="store-total">
                    <span>Total del carrito</span>
                    <strong>{comparison.totalPrice.toFixed(2)} EUR</strong>
                  </div>

                  <div className="store-metrics">
                    <div>
                      <span>Productos</span>
                      <strong>{comparison.totalProducts}</strong>
                    </div>
                    <div>
                      <span>Media</span>
                      <strong>{comparison.averagePrice.toFixed(2)} EUR</strong>
                    </div>
                  </div>

                  <div className="store-offer">
                    <span>Mejor oferta individual</span>
                    <a
                      href={comparison.bestOffer.url}
                      target="_blank"
                      rel="noreferrer"
                      className="result-link"
                    >
                      {comparison.bestOffer.productName} ({comparison.bestOffer.price.toFixed(2)} EUR)
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="empty-state">
            El resumen por tienda aparecera cuando compares los productos cargados.
          </p>
        )}
      </section>
    </main>
  );
}
