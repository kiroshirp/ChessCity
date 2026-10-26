# Cloudflare Workers

La captura muestra un Worker vinculado a GitHub, pero detenido en inicialización; no confirma un despliegue completado. GitHub Pages solo sirve contenido estático: OAuth, sesiones y datos compartidos de esta aplicación necesitan el Worker y D1.

## Configuración prevista

El repositorio debe contener esta aplicación y Cloudflare apuntar a su rama publicada. Configuración de Workers Builds:

- Directorio raíz: `/`.
- Compilación: `pnpm run build:cloudflare`.
- Despliegue: `pnpm run deploy:cloudflare`.
- Variable de compilación: `CHESSCITY_D1_ID`, UUID real de una base D1 propia.
- Nombre del Worker: `chesscity`. Binding de la base: `DB`.

Crear/seleccionar D1 en la cuenta real y obtener su identificador. No confundirlo con el identificador de cuenta. El script rechaza un identificador ausente o de ejemplo, aplica migraciones pendientes y despliega el Worker compilado. Los permisos del token de Cloudflare deben permitir Workers y esa base D1.

No se ha modificado la cuenta de Cloudflare ni ejecutado un despliegue remoto durante este cambio. No hay credenciales ni un UUID de producción inventado en el repositorio. El alojamiento anterior de Sites es independiente; estos cambios no lo actualizan automáticamente.

Referencia: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
