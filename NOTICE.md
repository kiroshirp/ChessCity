# Attribution and modifications

ChessCity is a derivative adaptation of selected Git City rendering components.

- Upstream: https://github.com/srizzon/git-city
- Author: Samuel Rizzon and Git City contributors.
- Inspected upstream revision: `d09d5052124d2f9b4b1f8f342f9a53b056019147`.
- Project license: GNU Affero General Public License v3; see `LICENSE`.

Modified components, 26 October 2026:

- `lib/vendor/window-atlas.ts` adapts the window atlas creation and pixel conversion from upstream `src/components/Building3D.tsx`. The atlas was isolated from React/GitHub and reduced from 2048 to 512 pixels per side.
- The deterministic identity hash in `lib/model.ts` follows upstream `src/lib/city-layout-core.ts`.
- `app/CityViewport.tsx` is a ChessCity-specific Three.js renderer using that adapted atlas. It is not the complete original Git City renderer and does not inherit all its LOD, social or multiplayer systems.
- The Lichess integration, authorization, progression, shared registry, interface and TopChess support mention were authored for this adaptation.

Silkscreen font files are distributed under the SIL Open Font License; see `public/fonts/OFL.txt`. The Sites/Vinext scaffold retains its bundled tooling license under `scripts/vite/sites-vite-plugin.LICENSE`.

TopChess is credited as supporting the project at the user's explicit request. The TC monogram is a typographic presentation, not a supplied official logo. Lichess is a data/authentication provider, not a claimed sponsor.

Corresponding application source is available from the in-app Credits dialog at `/source/chesscity.tar.gz`, alongside the license at `/LICENSE.txt`. The archive excludes credentials, databases, dependencies and generated runtime state.

El repositorio GitHub original contenía únicamente un README y una licencia MIT. Esa licencia se conserva en `LICENSE.repository-original`. La aplicación derivada de Git City se distribuye bajo la licencia AGPL indicada arriba; conservar la licencia inicial no cambia la licencia de estos componentes derivados.
