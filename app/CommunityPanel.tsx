"use client";
import { useState } from "react";
import CitySelect from "./CitySelect";
import { LAND_LIMIT, validSite, sitePlot } from "../lib/open-land";
import type { Player } from "../lib/model";
import {
  NEIGHBORHOODS,
  EXPANSION_PRICE_CENTS,
  EXPANSION_SLOTS,
  type Plot,
  type Community,
  type Expansion,
} from "../lib/neighborhoods";

export interface NeighborhoodData {
  communities: Community[];
  plots: Plot[];
  expansions: Expansion[];
  paymentsEnabled: boolean;
}
export const EMPTY_NEIGHBORHOODS: NeighborhoodData = {
  communities: [],
  plots: [],
  expansions: [],
  paymentsEnabled: false,
};

export function CommunityPanel({
  data,
  me,
  busy,
  onPick,
  onMap,
  onExpand,
  onContribute,
  onFound,
}: {
  data: NeighborhoodData;
  me: Player | null;
  busy: boolean;
  onPick: (plot: Plot) => void;
  onMap: () => void;
  onExpand: () => void;
  onContribute: (expansionId: string, amountCents: number) => void;
  onFound: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [coordinates, setCoordinates] = useState({ x: "", z: "" });
  const [formError, setFormError] = useState("");
  const founder = data.communities.some((c) => c.founderId === me?.id);
  return (
    <>
      <div className="eyebrow">UN LUGAR PARA CRECER JUNTOS</div>
      <h2 id="dialog-title">Comunidades de ChessCity</h2>
      <p>
        Elige un sitio libre en el mapa y coloca tu casa. No hay parcelas
        predefinidas: tu edificio es el punto de partida. Después puedes fundar
        una comunidad y ampliarla para tu club, escuela o amigos.
      </p>
      {!me && (
        <p className="panel-note">
          Puedes explorar los terrenos. Para ocupar una parcela tendrás que
          vincular tu cuenta de Lichess.
        </p>
      )}
      {data.communities.length === 0 && (
        <p role="status">
          Aún no hay comunidades. La primera puede empezar en tu casa.
        </p>
      )}
      <div className="community-list">
        {data.communities.map((community) => {
          const own = me?.plot?.communityId === community.id;
          const campaign = data.expansions.find(
            (item) =>
              item.communityId === community.id &&
              item.status === "awaiting_payment",
          );
          const free = data.plots.filter(
            (plot) =>
              plot.communityId === community.id &&
              !plot.ownerId &&
              (plot.available === undefined || !!plot.available),
          );
          return (
            <article className="community-card" key={community.id}>
              <div className="community-title">
                <h3>{community.name}</h3>
                <span>
                  {community.occupied}/{community.capacity} parcelas
                </span>
              </div>
              <p>
                {
                  NEIGHBORHOODS.find((item) => item.id === community.id)
                    ?.description
                }
                {own ? " · Tu comunidad" : ""}
              </p>
              <div className="progress-track">
                <span
                  style={{
                    width: `${(community.occupied / community.capacity) * 100}%`,
                  }}
                />
              </div>
              <label className="small" htmlFor={"plot-" + community.id}>
                Parcelas libres: {free.length}
              </label>
              <CitySelect
                id={"plot-" + community.id}
                value=""
                disabled={!free.length}
                onChange={(value) => {
                  const plot = free.find((item) => item.id === value);
                  if (plot) onPick(plot);
                }}
                placeholder={
                  free.length
                    ? "Elegir sitio en esta comunidad…"
                    : "Sin plazas disponibles"
                }
                options={free.map((plot) => ({
                  value: plot.id,
                  label: `Sitio ${plot.slot + 1}`,
                }))}
              />
              {own &&
                (community.founderId ||
                  NEIGHBORHOODS.some((item) => item.id === community.id)) && (
                  <button
                    className="secondary full"
                    onClick={onExpand}
                    disabled={busy || community.capacity + 4 > 64}
                  >
                    Solicitar ampliación · 1 €/mes en total
                  </button>
                )}
              {campaign && (
                <div className="campaign">
                  <b>Ampliación de {campaign.addedSlots} plazas</b>
                  <span>
                    {(campaign.paidCents / 100).toLocaleString("es-ES", {
                      style: "currency",
                      currency: "EUR",
                    })}{" "}
                    / 1,00 €/mes
                  </span>
                  <small>
                    Alquiler conjunto de 1 €/mes. Puede pagarlo una persona o
                    compartirse en dos aportaciones de 0,50 €/mes. Cada
                    aportación es recurrente; el terreno solo se activa al
                    cubrir el importe conjunto. Puedes cancelar desde «Mis
                    alquileres».
                  </small>
                  {!data.paymentsEnabled && (
                    <small>
                      Stripe pendiente de activación. No se realizará ningún
                      cargo.
                    </small>
                  )}
                  {data.paymentsEnabled && own && (
                    <div className="contribution-actions">
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => onContribute(campaign.id, 50)}
                      >
                        Aportar 0,50 €/mes
                      </button>
                      {campaign.paidCents === 0 && (
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => onContribute(campaign.id, 100)}
                        >
                          Asumir 1 €/mes
                        </button>
                      )}
                      {!!campaign.reservedCents && (
                        <small>
                          Hay importes reservados en Stripe. Puedes reanudar tu
                          aportación; las demás esperan su confirmación o
                          caducidad.
                        </small>
                      )}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {me?.plot && !founder && (
        <form
          noValidate
          className="city-form community-card"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length < 3 || name.trim().length > 50) {
              setFormError("Escribe un nombre entre 3 y 50 caracteres.");
              return;
            }
            setFormError("");
            onFound(name);
          }}
        >
          <h3>Tu casa, el inicio de una comunidad</h3>
          <p>
            Fundarla es gratuito. Empieza con tu edificio; cada ampliación añade
            4 sitios contiguos por 1 €/mes en total. El edificio fundador fija
            su ubicación.
          </p>
          <label htmlFor="community-name">Nombre de la comunidad</label>
          <input
            id="community-name"
            className="city-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={3}
            maxLength={50}
            required
            placeholder="El nombre de tu club o comunidad"
            disabled={busy}
          />
          <button
            type="submit"
            className="primary full"
            disabled={busy || name.trim().length < 3}
          >
            Fundar alrededor de mi edificio
          </button>
        </form>
      )}
      <details className="city-details">
        <summary>Elegir ubicación por coordenadas</summary>
        <form
          noValidate
          className="city-form"
          onSubmit={(e) => {
            e.preventDefault();
            const x = Number(coordinates.x),
              z = Number(coordinates.z);
            if (!coordinates.x || !coordinates.z || !validSite(x, z)) {
              setFormError(
                `Usa múltiplos de 16 entre −${LAND_LIMIT} y ${LAND_LIMIT}, fuera de la plaza central.`,
              );
              return;
            }
            setFormError("");
            onPick(sitePlot(x, z));
          }}
        >
          <p>
            También puedes indicar un lugar sin usar el mapa. Se comprobará que
            esté libre antes de guardar.
          </p>
          <div className="coordinate-fields">
            {(["x", "z"] as const).map((axis) => (
              <label key={axis} htmlFor={`site-${axis}`}>
                Eje {axis.toUpperCase()}
                <input
                  className="city-input"
                  id={`site-${axis}`}
                  type="number"
                  inputMode="numeric"
                  step={16}
                  min={-LAND_LIMIT}
                  max={LAND_LIMIT}
                  value={coordinates[axis]}
                  onChange={(e) =>
                    setCoordinates((c) => ({ ...c, [axis]: e.target.value }))
                  }
                />
              </label>
            ))}
          </div>
          <button className="secondary full" type="submit">
            Revisar este sitio
          </button>
        </form>
      </details>
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <button className="primary full" onClick={onMap}>
        Elegir sitio libre en el mapa <span>↗</span>
      </button>
      <p className="panel-note">
        Cada ampliación cuesta{" "}
        {(EXPANSION_PRICE_CENTS / 100).toLocaleString("es-ES", {
          style: "currency",
          currency: "EUR",
        })}{" "}
        al mes entre toda la comunidad y añade {EXPANSION_SLOTS} plazas. Sin un
        pago verificado no se desbloquea terreno.{" "}
        {data.paymentsEnabled
          ? "El pago se confirma en Stripe."
          : "Los cobros aún están desactivados."}
      </p>
    </>
  );
}

export function PlotPanel({
  plot,
  me,
  busy,
  onConfirm,
  communityName,
}: {
  plot: Plot;
  me: Player | null;
  busy: boolean;
  onConfirm: () => void;
  communityName?: string;
}) {
  const community = NEIGHBORHOODS.find((item) => item.id === plot.communityId);
  return (
    <>
      <div className="eyebrow">TU DIRECCIÓN EN CHESSCITY</div>
      <h2 id="dialog-title">
        {plot.communityId === "abierta"
          ? "Aquí empieza tu casa"
          : `Un sitio en ${communityName ?? community?.name ?? "tu comunidad"}`}
      </h2>
      <p>
        {plot.ownerId
          ? "Esta parcela ya tiene propietario."
          : plot.communityId === "abierta"
            ? "Has elegido este lugar del mapa. Tu casa se construirá aquí, sin pertenecer a una comunidad hasta que decidas fundarla."
            : "Este sitio pertenece a una ampliación activa. Al elegirlo te unirás a su comunidad."}
      </p>
      <p className="site-coordinates">
        Ubicación · {plot.x}, {plot.z}
      </p>
      <p>
        La elección inicial y el cambio a otra parcela libre son gratuitos en
        esta versión.
      </p>
      {me?.plot && (
        <p className="panel-note">
          Al confirmar se liberará tu parcela anterior. Se conservarán tu
          progreso y personalización.
        </p>
      )}
      {me ? (
        <button
          className="primary full"
          onClick={onConfirm}
          disabled={busy || !!plot.ownerId}
        >
          {busy ? "Reservando…" : "Elegir esta parcela"}
          <span>↗</span>
        </button>
      ) : (
        <a className="primary full" href="/auth/start">
          Vincular Lichess para colocar mi casa ↗
        </a>
      )}
    </>
  );
}
