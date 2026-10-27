# ChessCity

Tu trayectoria en Lichess, convertida en una ciudad. **Con el soporte de TopChess.** Adaptación de componentes de [Git City](https://github.com/srizzon/git-city), bajo AGPL-3.0.

## Bloques

- [Producto y equilibrio inicial](docs/PRODUCTO.md)
- [Arquitectura](docs/ARQUITECTURA.md)
- [Publicación en Cloudflare](docs/CLOUDFLARE.md)
- [Validación y límites](docs/VALIDACION.md)
- [Procedencia y licencias](NOTICE.md)

## Funciones

Ciudad 3D, selección con haz de luz, OAuth Lichess PKCE, media de puntuaciones consolidadas, crecimiento desde casita por actividad nueva y parcelas persistentes. Ciudad abierta ofrece 256 parcelas gratuitas iniciales y añade terreno según la ocupación; las comunidades de clubes tienen capacidad propia. Ampliaciones de **1 €/mes total** por 4 plazas, con aportaciones mensuales de 0,50 € o 1 € mediante Stripe. Incluye conciliación de facturas, renovaciones, cancelación y reubicación gratuita al vencer el alquiler. El servidor exige sus claves privadas y firma del webhook; no se incluyen credenciales en el código.

## Desarrollo local

Node.js >=22.13 y pnpm (las pruebas SQLite requieren Node >=22.13).

```text
pnpm install --frozen-lockfile
pnpm source:archive
pnpm build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config wrangler.jsonc --persist-to .wrangler/state
pnpm dev --port 5173
```

Aplicar las migraciones pendientes antes de usar la aplicación. La base local es independiente de producción.

```text
pnpm test
pnpm exec tsc --noEmit
node tests/http-check.mjs
```

La última comprobación requiere el servidor activo. Conservar el archivo de código fuente generado y las atribuciones al publicar.

## Web publicada

https://chesscity.kiroshirp.workers.dev
