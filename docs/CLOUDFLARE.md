# Cloudflare Workers

ChessCity está publicado en https://chesscity.kiroshirp.workers.dev, con su propia base D1 `chesscity-db` y binding `DB`. La configuración no depende de GitHub Pages. El UUID público de la base está en `wrangler.jsonc`; las credenciales permanecen fuera del repositorio.

## Despliegue

Workers Builds debe tener `node scripts/cloudflare-build.mjs` como comando de compilación, tanto en Producción como en Base de vistas previas. Producción usa `node scripts/cloudflare-deploy.mjs` como comando de despliegue; las ramas de vista previa usan `npx wrangler preview --config dist/server/wrangler.json`. La compilación genera el archivo de código fuente y los archivos de cliente/servidor. El despliegue de producción aplica las migraciones pendientes. No requiere definir CHESSCITY_D1_ID manualmente. Se necesita que la conexión de Cloudflare tenga permisos Workers y D1.

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
- Clave restringida de Stripe guardada en `STRIPE_SECRET_KEY` como secreto del Worker, nunca en Git ni en el chat.
- Webhook hacia `https://chesscity.kiroshirp.workers.dev/api/stripe/webhook`, con API `2026-09-30.endive` y eventos checkout.session.completed/expired/async_payment_succeeded, customer.subscription.created/updated/deleted, invoice.paid/payment_failed/finalized/voided/marked_uncollectible y charge.refunded/dispute.created/dispute.closed.
- `STRIPE_WEBHOOK_SECRET` guardado como secreto del Worker.
- Pruebas integrales en modo de prueba, incluida recuperación y devolución de aportaciones.
- Activación deliberada de `STRIPE_PAYMENTS_ENABLED`, después de validar el ciclo mensual. La configuración de esta versión lo activa; requiere los dos secretos del servidor.

El origen canónico se configura mediante `CHESSCITY_PUBLIC_ORIGIN`. La autorización del plugin de Stripe no proporciona una clave de API a la aplicación. Los secretos `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` se han guardado cifrados en el Worker. El destino de producción `we_1UV5wdRBnPDD6EfRTGKduHnG` usa API 2026-09-30.endive y 18 eventos. No se crean reembolsos automáticamente: se verifica el estado que comunica Stripe.

Referencias: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/ y https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts

El Worker comprueba los vencimientos cada 15 minutos. Solo procesa expansiones con una fecha de alquiler pagado guardada en servidor. Al vencer se reubica a los propietarios en parcelas gratuitas y se registra la demolición/construcción visual. La prueba de integración usa los mismos parámetros de Checkout que producción y verifica facturas y cargos de prueba reales del proveedor, además de conciliación en SQLite aislado.

## Estado del enlace GitHub

La publicación manual está verificada. El panel autenticado permitió identificar el fallo automático: las ramas ejecutaban `wrangler preview` sin compilación previa y faltaba `dist/client`. Se han configurado explícitamente compilación y despliegue tanto para Producción como para Base de vistas previas. Las vistas previas ya creadas conservan su configuración propia: también hay que corregir los comandos en su selector de rama > Configuración > Compilaciones. Cambiar la base no actualiza esas ramas existentes. Reintentar una compilación antigua reutiliza su configuración anterior: la comprobación debe hacerse con un nuevo commit. pnpm está fijado a 11.25.0.

## Conciliación mensual

SDK oficial Stripe 23.0.1, API 2026-09-30.endive. No se fijan métodos de pago: Checkout los selecciona dinámicamente. La pertenencia se resuelve desde Checkout, Subscription e Invoice; los metadatos solo sirven como recuperación explícita si llega una factura antes que el aviso de Checkout.

Se registra el período real del servicio indicado en la línea de factura. Una factura o notificación repetida no añade meses ni parcelas. Dos aportantes de 0,50 €/mes mantienen únicamente el tramo de tiempo pagado por ambos. Cancelar desde «Mis alquileres» detiene las próximas renovaciones al terminar el período pagado. Las reservas incluyen compromisos ya suscritos para no permitir más de 1 €/mes por ampliación.

Los vencimientos consultan Stripe antes de trasladar jugadores. Una factura aún en borrador, un intento pendiente o un error del proveedor no prueba impago y no provoca una demolición. Los recibos marcados manualmente como pagados no bastan: se comprueba su pago real; los reembolsos y disputas pendientes bloquean el período afectado. Una resolución favorable verificada puede restablecerlo.

Antes de abrir cobros hay que revisar también el tratamiento de impuestos. No se ha activado Stripe Tax ni se afirma que los importes estén fiscalmente configurados.

Para un Worker de prueba separado, configurar `STRIPE_PRODUCT_ID` con el producto de prueba y `CHESSCITY_PUBLIC_ORIGIN` con su origen. Si no se define producto, se usa el producto real verificado de TopChess. Nunca usar una clave real en pruebas ni mezclar bases de datos entre los entornos.

La comprobación optativa `node scripts/check-stripe-sandbox.mjs` exige una clave de prueba fuera del código público y módulos generados por `node scripts/test.mjs`. Crea su propio reloj, cliente y producto de prueba; valida Checkout, pago inicial, renovación, impago y recuperación, cancelación con traslado, aportaciones compartidas y reembolso. El reloj y sus suscripciones se eliminan al terminar y el producto se archiva. El entorno temporal sin reclamar no permitía Test Clocks; la verificación se completó en el modo de prueba existente de TopChess con recursos propios, sin modificar recursos ajenos ni realizar cargos reales.
