"use client";
import { useState, useEffect } from "react";
interface Rental {
  id: string;
  expansionId: string;
  amountCents: number;
  status: string;
  cancelAtPeriodEnd: boolean | number;
  paidUntil: number | null;
}
async function request(id?: string) {
  const response = await fetch(
    "/api/rentals",
    id
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        }
      : undefined,
  );
  const result = (await response.json()) as {
    rentals: Rental[];
    error?: string;
  };
  if (!response.ok)
    throw new Error(result.error ?? "No se ha podido consultar la aportación.");
  return result.rentals as Rental[];
}
export default function MyRentalsPanel() {
  const [rentals, setRentals] = useState<Rental[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    request()
      .then((data) => {
        if (active) setRentals(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function cancel(id: string) {
    setBusy(id);
    setError("");
    try {
      setRentals(await request(id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <div className="eyebrow">APORTACIONES A COMUNIDADES</div>
      <h2 id="dialog-title">Mis alquileres</h2>
      <p>
        Tu aportación mantiene plazas dentro de una comunidad. Cancelar detiene
        los próximos cobros al terminar el período ya pagado.
      </p>
      {error && <p role="alert">{error}</p>}
      {!rentals && !error && <p role="status">Consultando aportaciones…</p>}
      {rentals?.length === 0 && (
        <p className="panel-note">
          No tienes alquileres activos. Los cobros todavía no están habilitados
          en esta versión.
        </p>
      )}
      <div className="community-list">
        {rentals?.map((rental) => (
          <article key={rental.id} className="community-card">
            <h3>
              {rental.expansionId.split(":")[0]} ·{" "}
              {(rental.amountCents / 100).toLocaleString("es-ES", {
                style: "currency",
                currency: "EUR",
              })}
              /mes
            </h3>
            {rental.paidUntil && (
              <p>
                Período pagado hasta{" "}
                {new Date(rental.paidUntil).toLocaleDateString("es-ES")}.
              </p>
            )}
            {rental.cancelAtPeriodEnd ||
            ["canceled", "incomplete_expired"].includes(rental.status) ? (
              <p className="panel-note">
                Sin próxima renovación. El período ya pagado se conserva.
              </p>
            ) : (
              <button
                className="secondary full"
                disabled={busy !== null}
                onClick={() => void cancel(rental.id)}
              >
                {busy === rental.id
                  ? "Actualizando…"
                  : "Cancelar al terminar el período"}
              </button>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
