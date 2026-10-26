"use client";
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
}: {
  data: NeighborhoodData;
  me: Player | null;
  busy: boolean;
  onPick: (plot: Plot) => void;
  onMap: () => void;
  onExpand: () => void;
  onContribute: (expansionId: string, amountCents: number) => void;
}) {
  return (
    <>
      <div className="eyebrow">UN LUGAR PARA CRECER JUNTOS</div>
      <h2 id="dialog-title">Comunidades de ChessCity</h2>
      <p>
        Explora Ciudad abierta y elige tu parcela gratuita en el mapa. El
        terreno público crece cuando hace falta espacio. También puedes vivir
        junto a tu club o escuela en una comunidad.
      </p>
      {!me && (
        <p className="panel-note">
          Puedes explorar los terrenos. Para ocupar una parcela tendrás que
          vincular tu cuenta de Lichess.
        </p>
      )}
      {data.communities.length === 0 && (
        <p role="status">Todavía no se han podido cargar las comunidades.</p>
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
              <select
                id={"plot-" + community.id}
                defaultValue=""
                disabled={!free.length}
                onChange={(event) => {
                  const plot = free.find(
                    (item) => item.id === event.target.value,
                  );
                  if (plot) onPick(plot);
                }}
              >
                <option value="" disabled>
                  {free.length ? "Elegir una parcela…" : "Comunidad completa"}
                </option>
                {free.map((plot) => (
                  <option key={plot.id} value={plot.id}>
                    Parcela {plot.slot + 1}
                  </option>
                ))}
              </select>
              {own &&
                NEIGHBORHOODS.some((item) => item.id === community.id) && (
                  <button
                    className="secondary full"
                    onClick={onExpand}
                    disabled={busy || community.capacity >= 64}
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
      <button className="primary full" onClick={onMap}>
        Ver parcelas sobre el mapa <span>↗</span>
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
}: {
  plot: Plot;
  me: Player | null;
  busy: boolean;
  onConfirm: () => void;
}) {
  const community = NEIGHBORHOODS.find((item) => item.id === plot.communityId);
  return (
    <>
      <div className="eyebrow">TU DIRECCIÓN EN CHESSCITY</div>
      <h2 id="dialog-title">
        Parcela {plot.slot + 1} · {community?.name}
      </h2>
      <p>
        {plot.ownerId
          ? "Esta parcela ya tiene propietario."
          : "Esta parcela está libre. Al elegirla, tu casa pertenecerá a esta comunidad."}
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
