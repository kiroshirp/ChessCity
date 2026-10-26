# Cloudflare Workers

ChessCity está publicado en https://chesscity.kiroshirp.workers.dev, con su propia base D1 `chesscity-db` y binding `DB`. La configuración no depende de GitHub Pages. El UUID público de la base está en `wrangler.jsonc`; las credenciales permanecen fuera del repositorio.

## Despliegue

El comando predeterminado de Workers Builds, `npx wrangler deploy`, ejecuta la preparación declarada en `wrangler.jsonc`: genera el archivo de código fuente, compila y aplica las migraciones pendientes antes de subir el Worker. No requiere definir CHESSCITY_D1_ID manualmente. Se necesita que la conexión de Cloudflare tenga permisos Workers y D1.

Para un despliegue manual con sesión autorizada:

```text
pnpm run build:cloudflare
pnpm run deploy:cloudflare
```

Las migraciones ya aplicadas no se repiten. El Worker usa `dist/server/index.js` y los archivos de `dist/client`. El alojamiento anterior de Sites es independiente y no se modifica con estos comandos.

## Stripe

Producto proporcionado: `prod_U4PzEucod6LCRJ`. Verificado en la segunda cuenta TopChess (`acct_1RzKQXRBnPDD6EfR`): producto activo, llamado «Ampliación de terreno». Su precio predeterminado existente es recurrente (1 €/mes). La ampliación es un alquiler mensual, tal como confirmó el usuario. El checkout está preparado en modo subscription con intervalo month. El precio predeterminado no se ha modificado.

El código prepara aportaciones mensuales de 50 céntimos o 1 euro, reservando el importe pendiente para no superar 1 euro al mes entre todos. Para activar checkout hacen falta:

- Cuenta y producto verificados.
- `STRIPE_SECRET_KEY` guardada como secreto del Worker, nunca en Git ni en el chat.
- Webhook hacia `https://chesscity.kiroshirp.workers.dev/api/stripe/webhook`, con los eventos checkout.session.completed y checkout.session.expired.
- `STRIPE_WEBHOOK_SECRET` guardado como secreto del Worker.
- Pruebas integrales en modo de prueba, incluida recuperación y devolución de aportaciones.
- Activación deliberada de `STRIPE_PAYMENTS_ENABLED`; actualmente está en `false`.

El origen canónico se configura mediante `CHESSCITY_PUBLIC_ORIGIN`. La autorización del plugin de Stripe sirve para gestionar la cuenta desde el chat, pero no proporciona una clave de API a la aplicación. Los reembolsos/disputas automáticos siguen pendientes, por lo que no se presentan los cobros como listos para explotación comercial.

Referencias: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/ y https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts

El Worker incluye una comprobación periódica de vencimientos cada 15 minutos. Solo procesa expansiones con una fecha de alquiler pagado guardada en servidor; no se toma la fecha del cliente. Al vencer se reubica a los propietarios en parcelas gratuitas y se registra la demolición/construcción visual. Falta completar la sincronización mensual de invoices/subscriptions con Stripe antes de activar checkout.
