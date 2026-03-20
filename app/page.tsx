"use client";

import { ChangeEvent, FormEvent, useState } from "react";

type ProductFormData = {
  name: string;
  description: string;
  price: string;
  category: string;
  stock: string;
  supplier: string;
  url: string;
};

type ProductPayload = {
  name: string;
  description: string;
  price: number;
  category: string;
  stock: number;
  supplier: string;
  url: string;
};

type ComparisonResult = {
  productName: string;
  category: string;
  bestOption: {
    supplier: string;
    price: number;
    stock: number;
    description: string;
    url: string;
  };
  comparedOptions: number;
  priceRange: {
    min: number;
    max: number;
    savingsVsHighest: number;
  };
};

type ComparisonResponse = {
  ok: boolean;
  comparisons?: ComparisonResult[];
  error?: string;
};

const initialForm: ProductFormData = {
  name: "",
  description: "",
  price: "",
  category: "",
  stock: "",
  supplier: "",
  url: ""
};

export default function HomePage() {
  const [formData, setFormData] = useState<ProductFormData>(initialForm);
  const [products, setProducts] = useState<ProductPayload[]>([]);
  const [comparisons, setComparisons] = useState<ComparisonResult[]>([]);
  const [statusMessage, setStatusMessage] = useState("Añade varias ofertas y compara el mejor precio.");
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleAddProduct = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const newProduct: ProductPayload = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      price: Number(formData.price),
      category: formData.category,
      stock: Number(formData.stock),
      supplier: formData.supplier.trim(),
      url: formData.url.trim()
    };

    setProducts((current) => [...current, newProduct]);
    setFormData(initialForm);
    setStatusMessage("Oferta añadida. Puedes seguir cargando más tiendas o comparar ahora.");
  };

  const handleCompare = async () => {
    if (products.length === 0) {
      setStatusMessage("Necesitas al menos una oferta para comparar.");
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
      setStatusMessage("Comparacion completada. Ya tienes la mejor tienda por producto.");
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
        <h1>Encuentra la mejor tienda para cada producto</h1>
        <p className="lead">
          Registra varias ofertas del mismo producto y compara sus precios para quedarte
          con la mejor opcion. La tabla mostrara la tienda ganadora, el precio y su enlace.
        </p>
      </section>

      <section className="grid">
        <article className="card">
          <div className="card-header">
            <h2>Nueva oferta</h2>
            <p>Introduce una oferta por tienda para luego compararla con las demas.</p>
          </div>

          <form className="product-form" onSubmit={handleAddProduct}>
            <label>
              Producto
              <input
                name="name"
                type="text"
                placeholder="Ej. Camiseta basica"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              Descripción
              <textarea
                name="description"
                placeholder="Describe el producto"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                required
              />
            </label>

            <div className="form-row">
              <label>
                Precio
                <input
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.price}
                  onChange={handleChange}
                  required
                />
              </label>

              <label>
                Stock
                <input
                  name="stock"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={formData.stock}
                  onChange={handleChange}
                  required
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                Tienda
                <input
                  name="supplier"
                  type="text"
                  placeholder="Ej. Outlet Textil"
                  value={formData.supplier}
                  onChange={handleChange}
                  required
                />
              </label>

              <label>
                Categoría
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  required
                >
                  <option value="">Selecciona una categoría</option>
                  <option value="ropa">Ropa</option>
                  <option value="electronica">Electrónica</option>
                  <option value="hogar">Hogar</option>
                  <option value="alimentacion">Alimentación</option>
                </select>
              </label>
            </div>

            <label>
              Enlace
              <input
                name="url"
                type="url"
                placeholder="https://tienda.com/producto"
                value={formData.url}
                onChange={handleChange}
                required
              />
            </label>

            <div className="actions">
              <button type="submit">Añadir oferta</button>
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
            <h2>Ofertas cargadas</h2>
            <p>{statusMessage}</p>
          </div>

          {products.length > 0 ? (
            <ul className="offer-list">
              {products.map((product, index) => (
                <li key={`${product.name}-${product.supplier}-${index}`}>
                  <strong>{product.name}</strong>
                  <span>{product.supplier}</span>
                  <span>{product.price.toFixed(2)} EUR</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">
              Todavia no hay ofertas cargadas. Añade varias para obtener una comparacion.
            </p>
          )}
        </aside>
      </section>

      <section className="card results-card">
        <div className="card-header">
          <h2>Mejor precio por producto</h2>
          <p>Resultado de la comparacion de ofertas por nombre de producto.</p>
        </div>

        {comparisons.length > 0 ? (
          <div className="table-wrap">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Mejor tienda</th>
                  <th>Precio</th>
                  <th>Enlace</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((comparison) => (
                  <tr key={`${comparison.productName}-${comparison.bestOption.supplier}`}>
                    <td>
                      <strong>{comparison.productName}</strong>
                    </td>
                    <td>{comparison.bestOption.supplier}</td>
                    <td>{comparison.bestOption.price.toFixed(2)} EUR</td>
                    <td>
                      <a
                        href={comparison.bestOption.url}
                        target="_blank"
                        rel="noreferrer"
                        className="result-link"
                      >
                        Ver oferta
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            La tabla se completara cuando compares las ofertas cargadas.
          </p>
        )}
      </section>
    </main>
  );
}
