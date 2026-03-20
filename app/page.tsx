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
      setStatusMessage("Comparacion completada. Ya tienes hasta 10 tiendas por producto.");
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
        ) : (
          <p className="empty-state">
            Los resultados por producto apareceran cuando compares los productos cargados.
          </p>
        )}
      </section>
    </main>
  );
}
