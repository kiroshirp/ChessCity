"use client";
import MyRentalsPanel from "./MyRentalsPanel";
import CitySelect from "./CitySelect";
import type { CityEvent } from "../lib/city-events";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
const CityViewport = lazy(() => import("./CityViewport"));
import {
  CommunityPanel,
  PlotPanel,
  EMPTY_NEIGHBORHOODS,
  type NeighborhoodData,
} from "./CommunityPanel";
import { combinedRating } from "../lib/progression";
import { type Plot } from "../lib/neighborhoods";
import { cityResidents } from "../lib/city-layout";
import {
  ACCENTS,
  MODES,
  ROOFS,
  progressFor,
  unlockedRoofs,
  type Player,
  type Mode,
} from "../lib/model";

const format = (value: number) => value.toLocaleString("es-ES");
const modeName = {
  rapid: "Rapid",
  blitz: "Blitz",
  bullet: "Bullet",
  classical: "Clásicas",
};
const roofName = { antenna: "Antena", garden: "Jardín", crown: "Corona" };
const accentName = {
  jade: "Jade",
  amber: "Ámbar",
  violet: "Violeta",
  ice: "Hielo",
};
type Dialog =
  | "progress"
  | "customize"
  | "credits"
  | "compare"
  | "rentals"
  | "communities"
  | "plot"
  | null;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "El servicio no ha respondido. Prueba de nuevo en unos instantes.",
    );
  }
  if (!response.ok)
    throw new Error(
      data && typeof data === "object" && "error" in data
        ? String(data.error)
        : "No se ha podido completar la operación.",
    );
  return data as T;
}

function Rook() {
  return (
    <svg viewBox="0 0 32 36" aria-hidden="true">
      <path
        d="M5 3h5v7h4V3h5v7h4V3h5v12l-5 4v10h4v5H5v-5h4V19l-4-4Z"
        fill="currentColor"
      />
      <path d="M13 21h6v8h-6Z" fill="#12272c" />
    </svg>
  );
}

export default function ChessCity() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [total, setTotal] = useState(0);
  const [cityEvents, setCityEvents] = useState<CityEvent[]>([]);
  const [me, setMe] = useState<Player | null>(null);
  const [selected, setSelected] = useState<Player | null>(null);
  const [query, setQuery] = useState("");
  const mode: Mode = "rapid";
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [daylight, setDaylight] = useState(false);
  const [command, setCommand] = useState({ name: "none", id: 0 });
  const [accent, setAccent] = useState<Player["accent"]>("jade");
  const [roof, setRoof] = useState<Player["roof"]>("antenna");
  const [neighborhoods, setNeighborhoods] =
    useState<NeighborhoodData>(EMPTY_NEIGHBORHOODS);
  const [placing, setPlacing] = useState(false);
  const [pendingPlot, setPendingPlot] = useState<Plot | null>(null);
  const [compare, setCompare] = useState<string>("");
  const dialogRef = useRef<HTMLElement>(null);
  const cityPlayers = useMemo(() => cityResidents(players), [players]);
  const progress = selected && !selected.demo ? progressFor(selected) : null;
  const performance = selected ? combinedRating(selected.profile) : null;
  const ordered = useMemo(
    () =>
      [...players].sort((a, b) => (b.buildingXp ?? 0) - (a.buildingXp ?? 0)),
    [players],
  );

  function upsert(player: Player) {
    setPlayers((current) =>
      [player, ...current.filter((item) => item.id !== player.id)].slice(
        0,
        250,
      ),
    );
    setSelected(player);
    setMe((current) => (current?.id === player.id ? player : current));
  }
  useEffect(() => {
    let active = true;
    Promise.allSettled([
      api<{ players: Player[]; total: number; events: CityEvent[] }>(
        "/api/city",
      ),
      api<{ player: Player | null }>("/api/me"),
      api<NeighborhoodData>("/api/neighborhoods"),
    ]).then((results) => {
      if (!active) return;
      const city = results[0],
        account = results[1];
      if (city.status === "fulfilled") {
        setPlayers(city.value.players);
        setCityEvents(city.value.events ?? []);
        setTotal(city.value.total);
      } else setMessage(city.reason.message);
      if (account.status === "fulfilled" && account.value.player) {
        setMe(account.value.player);
        setSelected(account.value.player);
      }
      if (results[2].status === "fulfilled") setNeighborhoods(results[2].value);
      setLoaded(true);
    });
    const params = new URLSearchParams(location.search);
    if (params.has("payment")) {
      setDialog("communities");
      setMessage(
        "Consultando el estado de tu aportación. Volver de Stripe no acredita el pago por sí solo.",
      );
      api<{ status: string }>("/api/contributions", {
        method: "POST",
        body: JSON.stringify({ cancel: params.get("payment") === "cancel" }),
      })
        .then(async () => {
          await refreshNeighborhoods();
          setMessage(
            "Estado de la comunidad actualizado. Solo cuentan los pagos verificados por Stripe.",
          );
        })
        .catch((error) => setMessage(error.message));
      history.replaceState(null, "", location.pathname);
    }
    if (params.get("auth") === "failed")
      setMessage(
        "No se completó la vinculación con Lichess. Puedes volver a intentarlo.",
      );
    if (params.has("auth") || params.has("welcome"))
      history.replaceState(null, "", location.pathname);
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    const timer = setInterval(() => {
      if (document.hidden) return;
      api<{ players: Player[]; total: number; events: CityEvent[] }>(
        "/api/city",
      )
        .then((data) => {
          if (!live) return;
          setPlayers((previous) =>
            JSON.stringify(previous) === JSON.stringify(data.players)
              ? previous
              : data.players,
          );
          setCityEvents((previous) =>
            JSON.stringify(previous) === JSON.stringify(data.events)
              ? previous
              : data.events,
          );
          setTotal(data.total);
          setSelected((previous) =>
            previous
              ? (data.players.find((player) => player.id === previous.id) ??
                previous)
              : previous,
          );
          setMe((previous) =>
            previous
              ? (data.players.find((player) => player.id === previous.id) ??
                previous)
              : previous,
          );
        })
        .catch(() => {});
    }, 15000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const name = new URLSearchParams(location.search).get("player");
    if (name && /^[a-z0-9_-]{2,30}$/i.test(name)) void lookup(name);
  }, [loaded]);
  useEffect(() => {
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],select,input",
        ) ?? [],
      );
    focusable()[0]?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDialog(null);
      if (event.key === "Tab") {
        const items = focusable(),
          first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
      if (previous?.isConnected) previous.focus();
    };
  }, [dialog]);

  async function lookup(name = query) {
    if (busy) return;
    if (!/^[a-z0-9_-]{2,30}$/i.test(name.trim())) {
      setMessage("Escribe un nombre de usuario válido de Lichess.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { player } = await api<{ player: Player }>(
        "/api/player?username=" + encodeURIComponent(name.trim()),
      );
      upsert(player);
      setQuery("");
      const city = await api<{
        players: Player[];
        total: number;
        events: CityEvent[];
      }>("/api/city");
      setPlayers(city.players);
      setCityEvents(city.events ?? []);
      setTotal(city.total);
      setMessage(
        player.plot
          ? `${player.username} ya tiene un lugar en ChessCity.`
          : `${player.username} todavía no ha elegido una parcela.`,
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function refreshNeighborhoods() {
    const data = await api<NeighborhoodData>("/api/neighborhoods");
    setNeighborhoods(data);
    setTotal(data.plots.filter((plot) => !!plot.ownerId).length);
  }
  function pickPlot(plot: Plot) {
    setMessage("");
    setPendingPlot(plot);
    setDialog("plot");
  }
  async function placeHouse() {
    if (!pendingPlot || !me) return;
    setBusy(true);
    setMessage("");
    try {
      const { player, event } = await api<{
        player: Player;
        event?: CityEvent;
      }>("/api/placement", {
        method: "POST",
        body: JSON.stringify(
          pendingPlot.id.startsWith("site:")
            ? { x: pendingPlot.x, z: pendingPlot.z }
            : { plotId: pendingPlot.id },
        ),
      });
      setMe(player);
      if (event) setCityEvents((current) => [event, ...current].slice(0, 12));
      upsert(player);
      await refreshNeighborhoods();
      setPlacing(false);
      setDialog(null);
      setMessage("Tu casa ya tiene su lugar en ChessCity.");
    } catch (error) {
      setMessage((error as Error).message);
      await refreshNeighborhoods().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function expandCommunity() {
    setBusy(true);
    setMessage("");
    try {
      await api("/api/expansions", { method: "POST" });
      await refreshNeighborhoods();
      setMessage(
        "Solicitud creada: 4 parcelas por 1 €/mes en total. Consulta las opciones de aportación de tu comunidad.",
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createCommunity(name: string) {
    setBusy(true);
    setMessage("");
    try {
      const { player } = await api<{ player: Player }>("/api/communities", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      upsert(player);
      setMe(player);
      await refreshNeighborhoods();
      setMessage("Tu comunidad ya tiene nombre y un edificio fundador.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function contribute(expansionId: string, amountCents: number) {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ url: string }>("/api/checkout", {
        method: "POST",
        body: JSON.stringify({ expansionId, amountCents }),
      });
      if (new URL(result.url).hostname !== "checkout.stripe.com")
        throw new Error("Destino de pago no válido.");
      location.assign(result.url);
    } catch (error) {
      setMessage((error as Error).message);
      await refreshNeighborhoods().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  function camera(name: string) {
    setCommand((current) => ({ name, id: current.id + 1 }));
  }
  function openCustomize() {
    if (!me) {
      location.assign("/auth/start");
      return;
    }
    setMessage("");
    setAccent(me.accent);
    setRoof(me.roof);
    setDialog("customize");
  }
  async function customize() {
    setBusy(true);
    try {
      const { player } = await api<{ player: Player }>("/api/customize", {
        method: "POST",
        body: JSON.stringify({ accent, roof }),
      });
      setMe(player);
      upsert(player);
      setDialog(null);
      setMessage("Tu edificio ya tiene su nueva identidad.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await api("/api/logout", { method: "POST" });
      setMe(null);
      setMessage("Has cerrado tu sesión de ChessCity.");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function share() {
    if (!selected || selected.demo) return;
    const url =
      location.origin + "/?player=" + encodeURIComponent(selected.username);
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Enlace al edificio copiado.");
    } catch {
      setMessage("Enlace al edificio: " + url);
    }
  }
  const own = selected?.id === me?.id;
  const compared = players.find((player) => player.id === compare);

  return (
    <main className="chesscity">
      <Suspense
        fallback={<div className="city-loading">Levantando la ciudad…</div>}
      >
        <CityViewport
          players={cityPlayers}
          selected={selected?.id ?? null}
          mode={mode}
          daylight={daylight}
          command={command}
          onSelect={setSelected}
          plots={neighborhoods.plots}
          communities={neighborhoods.communities}
          events={cityEvents}
          placing={placing}
          onPlotSelect={pickPlot}
        />
      </Suspense>
      <div className="city-vignette" />
      {placing && (
        <div className="placement-banner" role="status">
          Explora el terreno y pulsa donde quieras construir. La vista previa
          indica si está libre.
          <button onClick={() => setDialog("communities")}>Ver lista</button>
          <button onClick={() => setPlacing(false)}>Terminar</button>
        </div>
      )}
      <header className="topbar">
        <a href="/" className="brand" aria-label="ChessCity inicio">
          <span className="brand-icon">
            <Rook />
          </span>
          <span>
            Chess<span className="brand-light">City</span>
            <small>EL AJEDREZ DEJA HUELLA</small>
          </span>
        </a>
        <form
          className="search"
          onSubmit={(event) => {
            event.preventDefault();
            void lookup();
          }}
        >
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Buscar jugador de Lichess"
            placeholder="Encuentra tu usuario de Lichess…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={30}
          />
          <button type="submit" disabled={busy}>
            {busy ? "…" : "Buscar"}
            <kbd>↵</kbd>
          </button>
        </form>
        <div className="top-actions">
          {me && (
            <button className="text-link" onClick={() => setDialog("rentals")}>
              Mis alquileres
            </button>
          )}
          <span className="lichess-label">
            <i /> Datos de Lichess
          </span>
          {me ? (
            <button
              className="connect"
              onClick={() => {
                setSelected(me);
                camera("none");
              }}
            >
              {me.username}
              <span className="verified">✓</span>
            </button>
          ) : (
            <a className="connect" href="/auth/start">
              Vincular Lichess <span>↗</span>
            </a>
          )}
        </div>
      </header>
      <nav className="rail" aria-label="Navegación de ChessCity">
        <button
          className="rail-button active"
          title="Explorar ciudad"
          aria-label="Explorar ciudad"
          onClick={() => {
            setSelected(null);
            camera("reset");
          }}
        >
          <span>▦</span>
        </button>
        <button
          className="rail-button"
          title="Mi edificio"
          aria-label="Mi edificio"
          onClick={() =>
            me ? setSelected(me) : location.assign("/auth/start")
          }
        >
          <span>♜</span>
        </button>
        <button
          className="rail-button"
          title="Cómo evolucionar"
          aria-label="Cómo evolucionar"
          onClick={() => setDialog("progress")}
        >
          <span>↗</span>
        </button>
        <div className="rail-divider" />
        <button
          className="rail-button rail-help"
          title="Acerca del proyecto"
          aria-label="Acerca del proyecto"
          onClick={() => setDialog("credits")}
        >
          <span>?</span>
        </button>
      </nav>
      <section className="city-heading">
        <div className="eyebrow">
          <i />{" "}
          {cityPlayers.length
            ? "UNA CIUDAD DE AJEDRECISTAS"
            : "LA CIUDAD EMPIEZA CONTIGO"}
        </div>
        <h1>
          Una partida más.
          <br />
          <em>Una historia más alta.</em>
        </h1>
        <p>Tu trayectoria en Lichess, convertida en ciudad.</p>
        <div className="sponsor">
          <span className="topchess-mark">TC</span>
          <span>
            CON EL SOPORTE DE<strong>TopChess</strong>
          </span>
        </div>
      </section>
      <aside className="profile-panel">
        <div className="panel-kicker">
          <span>
            {selected && !selected.demo
              ? "EL EDIFICIO DE UN JUGADOR"
              : "TU PRÓXIMA JUGADA"}
          </span>
          <span>♟</span>
        </div>
        {selected && !selected.demo ? (
          <>
            <div className="player-heading">
              <div className={`avatar accent-${selected.accent}`}>
                {selected.username.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <span className="small muted">
                  {selected.profile.title ?? "JUGADOR DE LICHESS"}
                </span>
                <h2>
                  {selected.username}
                  {selected.claimed && (
                    <span
                      className="verified"
                      title="Cuenta vinculada por su propietario"
                    >
                      ✓
                    </span>
                  )}
                </h2>
              </div>
            </div>
            <div className="level-line">
              <span>{progress!.name}</span>
              <b>{progress!.level.toString().padStart(2, "0")}</b>
            </div>
            <div className="progress-track">
              <span style={{ width: `${progress!.fraction * 100}%` }} />
            </div>
            <div className="progress-caption">
              <span>{format(selected.buildingXp ?? 0)} XP</span>
              <span>
                {progress!.next
                  ? `${format(Math.max(0, progress!.next - (selected.buildingXp ?? 0)))} XP · ${Math.max(0, (progress!.nextDays ?? 0) - (selected.activeDays ?? 0))} días activos`
                  : "Nivel máximo"}
              </span>
            </div>
            <div className="player-stats">
              <div>
                <b>
                  {performance?.rating !== null &&
                  performance?.rating !== undefined
                    ? format(performance.rating)
                    : "—"}
                </b>
                <span>
                  Media ChessCity · {performance?.modes.length ?? 0} modalidades
                </span>
              </div>
              <div>
                <b>{format(selected.profile.rated)}</b>
                <span>Partidas puntuadas</span>
              </div>
              <div>
                <b>{format(selected.profile.wins)}</b>
                <span>Victorias totales</span>
              </div>
              <div>
                <b>{format(selected.profile.draws)}</b>
                <span>Tablas totales</span>
              </div>
            </div>
            <div className="panel-note">
              Media aritmética de las modalidades disponibles con puntuación
              consolidada. No es una clasificación oficial de Lichess.
            </div>
            <p className="stage-caption">
              {progress!.nextName
                ? `Próximo cambio: ${progress!.nextName}.`
                : "Has alcanzado la última etapa de esta versión."}{" "}
              {selected.activeDays ?? 0} días activos desde tu vinculación.
            </p>
            {own && (
              <>
                <button
                  className="secondary full"
                  onClick={() => {
                    setMessage("");
                    setDialog("communities");
                  }}
                >
                  {me?.plot
                    ? "Mi comunidad y parcela"
                    : "Elegir dónde colocar mi casita"}{" "}
                  <span>⌖</span>
                </button>
                <p className="small muted">
                  {me?.plot
                    ? (neighborhoods.communities.find(
                        (item) => item.id === me.plot!.communityId,
                      )?.name ?? "Terreno libre · Puedes fundar tu comunidad")
                    : "Tu casa aún está en la zona de bienvenida."}
                </p>
              </>
            )}
            <button
              className="primary full"
              onClick={() =>
                own ? openCustomize() : void lookup(selected.username)
              }
              disabled={busy}
            >
              {own ? "Personalizar mi edificio" : "Sincronizar perfil"}
              <span>↗</span>
            </button>
            <div className="profile-links">
              <a
                href={`https://lichess.org/@/${encodeURIComponent(selected.username)}`}
                target="_blank"
                rel="noreferrer"
              >
                Ver en Lichess ↗
              </a>
              <button onClick={() => void share()}>Compartir</button>
              {players.length > 1 && (
                <button
                  onClick={() => {
                    setCompare(
                      players.find((item) => item.id !== selected.id)?.id ?? "",
                    );
                    setDialog("compare");
                  }}
                >
                  Comparar
                </button>
              )}
            </div>
            <p className="sync-time">
              Actualizado{" "}
              {new Date(selected.updatedAt).toLocaleString("es-ES", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              · caché de 15 min
            </p>
          </>
        ) : (
          <>
            <div className="welcome-rook">
              <Rook />
              <span className="orbit-dot" />
            </div>
            <h2>
              Tu ajedrez.
              <br />
              Tu lugar en la ciudad.
            </h2>
            <p className="panel-copy">
              Cada partida cuenta una historia. Vincula tu cuenta y descubre
              cómo se ve la tuya.
            </p>
            <a className="primary full" href="/auth/start">
              Elegir mi parcela <span>↗</span>
            </a>
            <div className="three-benefits">
              <span>
                <i>01</i> Crece con tu experiencia
              </span>
              <span>
                <i>02</i> Descubre otros jugadores
              </span>
              <span>
                <i>03</i> Hazlo tuyo
              </span>
            </div>
            <button className="text-link" onClick={() => setDialog("progress")}>
              ¿Cómo evoluciona mi edificio? →
            </button>
          </>
        )}
      </aside>
      <section className="city-ledger">
        <div className="ledger-label">EN ESTA CIUDAD</div>
        <strong>
          {loaded ? format(total) : "—"}
          <span>{total === 1 ? "jugador real" : "jugadores reales"}</span>
        </strong>
        <div className="ledger-divider" />
        <p>
          {cityPlayers.length
            ? "Cada casa pertenece a un jugador que ha elegido su parcela."
            : "La ciudad está vacía. Vincula Lichess y elige tu parcela para construir la primera casa."}
        </p>
      </section>
      {message && (
        <div className="notice" role="status">
          <span>{message}</span>
          <button aria-label="Cerrar aviso" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
      <div className="map-footer">
        <div className="map-controls">
          <button aria-label="Acercar ciudad" onClick={() => camera("zoomIn")}>
            ＋
          </button>
          <button aria-label="Alejar ciudad" onClick={() => camera("zoomOut")}>
            −
          </button>
          <span />
          <button
            aria-label="Centrar ciudad"
            onClick={() => {
              setSelected(null);
              camera("reset");
            }}
          >
            ⌖
          </button>
          <button
            aria-label={daylight ? "Activar noche" : "Activar día"}
            onClick={() => setDaylight((value) => !value)}
          >
            {daylight ? "☾" : "☀"}
          </button>
        </div>
        <span className="map-instructions">
          ARRASTRA PARA EXPLORAR <i>·</i> RUEDA PARA ACERCAR
        </span>
        <button
          className="community-shortcut"
          onClick={() => {
            setMessage("");
            setDialog("communities");
          }}
        >
          Comunidades · elegir parcela <span>⌖</span>
        </button>
      </div>
      <footer className="credits-bar">
        <span>
          CHESSCITY <b>♜</b> CON EL SOPORTE DE TOPCHESS
        </span>
        <button onClick={() => setDialog("credits")}>
          Basado en Git City · Código y créditos ↗
        </button>
        {me && <button onClick={() => void logout()}>Cerrar sesión</button>}
      </footer>

      {dialog && (
        <div className="dialog-backdrop" onClick={() => setDialog(null)}>
          <section
            ref={dialogRef}
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="dialog-close"
              onClick={() => setDialog(null)}
              aria-label="Cerrar ventana"
            >
              ×
            </button>
            {dialog === "progress" && (
              <>
                <div className="eyebrow">UNA TRAYECTORIA CON PERSONALIDAD</div>
                <h2 id="dialog-title">Así crece ChessCity.</h2>
                <p>
                  La experiencia construye. Tu puntuación cuenta otra parte de
                  la historia.
                </p>
                <div className="rule">
                  <span>01</span>
                  <div>
                    <h3>Partidas que se convierten en altura</h3>
                    <p>
                      Todo jugador vinculado empieza con una casita. Solo
                      cuentan las partidas puntuadas nuevas detectadas desde la
                      vinculación: 20 XP por partida, hasta 5 al día UTC. Las
                      partidas antiguas se conservan como historial, no dan
                      plantas de golpe.
                    </p>
                  </div>
                </div>
                <div className="rule">
                  <span>02</span>
                  <div>
                    <h3>Una puntuación fácil de leer</h3>
                    <p>
                      La puntuación ChessCity es la media, con el mismo peso, de
                      rapid, blitz, bullet y clásicas disponibles y
                      consolidadas. Se excluyen las ausentes y provisionales; no
                      se sustituyen por ceros. No es una puntuación oficial de
                      Lichess.
                    </p>
                  </div>
                </div>
                <div className="rule">
                  <span>03</span>
                  <div>
                    <h3>Una identidad propia</h3>
                    <p>
                      Casa ampliada: 120 XP y 3 días activos; dos plantas: 360
                      XP y 7 días; bloque: 800 XP y 14 días; edificio
                      emblemático: 1800 XP y 30 días. Hace falta cumplir ambos
                      requisitos. Un día activo es un día UTC en que sincronizas
                      partidas nuevas con recompensa disponible.
                    </p>
                  </div>
                </div>
                <div className="panel-note">
                  Primera versión: progreso agregado por partidas puntuadas.
                  Entrenamiento, retos por partida y temporadas aún no están
                  incorporados.
                </div>
              </>
            )}
            {dialog === "rentals" && <MyRentalsPanel />}
            {dialog === "communities" && (
              <>
                <CommunityPanel
                  data={neighborhoods}
                  me={me}
                  busy={busy}
                  onPick={pickPlot}
                  onMap={() => {
                    setPlacing(true);
                    setSelected(null);
                    setDialog(null);
                    camera("reset");
                  }}
                  onExpand={() => void expandCommunity()}
                  onFound={(name) => void createCommunity(name)}
                  onContribute={(id, amount) => void contribute(id, amount)}
                />
                {message && <p role="status">{message}</p>}
              </>
            )}
            {dialog === "plot" && pendingPlot && (
              <>
                <PlotPanel
                  plot={pendingPlot}
                  me={me}
                  busy={busy}
                  communityName={
                    neighborhoods.communities.find(
                      (c) => c.id === pendingPlot.communityId,
                    )?.name
                  }
                  onConfirm={() => void placeHouse()}
                />
                {message && <p role="alert">{message}</p>}
              </>
            )}
            {dialog === "customize" && me && (
              <>
                <div className="eyebrow">TU EDIFICIO, A TU MANERA</div>
                <h2 id="dialog-title">Hazlo reconocible.</h2>
                {message && <p role="alert">{message}</p>}
                <p>Los cambios se guardan en tu cuenta vinculada.</p>
                <h3>Color de identidad</h3>
                <div className="accent-picker">
                  {ACCENTS.map((value) => (
                    <button
                      key={value}
                      className={`swatch accent-${value} ${accent === value ? "chosen" : ""}`}
                      onClick={() => setAccent(value)}
                      aria-pressed={accent === value}
                    >
                      {accentName[value]}
                    </button>
                  ))}
                </div>
                <h3>En lo más alto</h3>
                <div className="roof-picker">
                  {ROOFS.map((value) => (
                    <button
                      key={value}
                      className={roof === value ? "chosen" : ""}
                      onClick={() => setRoof(value)}
                      disabled={!unlockedRoofs(me).includes(value)}
                    >
                      {roofName[value]}
                      {!unlockedRoofs(me).includes(value) && (
                        <small>Etapa {value === "garden" ? 2 : 4}</small>
                      )}
                    </button>
                  ))}
                </div>
                <button
                  className="primary full"
                  disabled={busy}
                  onClick={() => void customize()}
                >
                  {busy ? "Guardando…" : "Guardar identidad"}
                  <span>↗</span>
                </button>
              </>
            )}
            {dialog === "credits" && (
              <>
                <div className="eyebrow">UN PROYECTO CON COMUNIDAD</div>
                <h2 id="dialog-title">ChessCity × TopChess</h2>
                <p>
                  ChessCity cuenta con el soporte de <strong>TopChess</strong>.
                </p>
                <p>
                  Adaptación de componentes gráficos de{" "}
                  <a
                    href="https://github.com/srizzon/git-city"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Git City
                  </a>
                  , de Samuel Rizzon y sus colaboradores. La integración,
                  progresión e interfaz de ChessCity se han desarrollado para
                  Lichess.
                </p>
                <p>
                  ChessCity es un proyecto independiente. Lichess es el
                  proveedor de datos y de autenticación; no se presenta como
                  patrocinador.
                </p>
                <div className="credit-links">
                  <a href="/source/chesscity.tar.gz" download>
                    Descargar código fuente ↗
                  </a>
                  <a href="/LICENSE.txt" target="_blank">
                    Licencia AGPL-3.0 ↗
                  </a>
                </div>
                <div className="panel-note">
                  La ciudad solo muestra edificios de propietarios verificados
                  que han elegido una parcela. No se generan casas de muestra.
                </div>
              </>
            )}
            {dialog === "compare" && selected && (
              <>
                <div className="eyebrow">DOS TRAYECTORIAS, DOS EDIFICIOS</div>
                <h2 id="dialog-title">Comparar jugadores</h2>
                <label className="small" htmlFor="compare-player">
                  Elige otro jugador de la ciudad
                </label>
                <CitySelect
                  id="compare-player"
                  value={compare}
                  onChange={setCompare}
                  options={ordered
                    .filter((item) => item.id !== selected.id)
                    .map((item) => ({ value: item.id, label: item.username }))}
                />
                {compared && (
                  <div className="comparison">
                    {[selected, compared].map((item) => (
                      <div key={item.id}>
                        <h3>{item.username}</h3>
                        <b>{progressFor(item).level}</b>
                        <span>Nivel de edificio</span>
                        <strong>{format(item.profile.rated)}</strong>
                        <span>Partidas puntuadas</span>
                        <strong>
                          {combinedRating(item.profile).rating ?? "—"}
                        </strong>
                        <span>Media ChessCity</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
