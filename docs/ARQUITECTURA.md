# Arquitectura

## Interfaz y representación

`app/ChessCity.tsx` contiene los recorridos de búsqueda, perfil, comparación, personalización y créditos. `app/CityViewport.tsx` carga Three.js en un bloque separado. Renderiza fachadas con un `InstancedMesh` y una textura compartida. El atlas adaptado de Git City está aislado en `lib/vendor/window-atlas.ts`.

La geometría se reconstruye al cambiar el conjunto de jugadores o la modalidad, no en cada fotograma. La cámara dibuja bajo demanda con amortiguación, un máximo de 30 fotogramas por segundo y densidad de píxeles limitada a 1,5. Se pausa en pestañas ocultas. Al desmontar se liberan materiales, texturas, controles y geometrías. Sin introducción obligatoria ni movimientos de cámara automáticos continuos.

No se han medido FPS, consumo de GPU o rendimiento en miles de edificios. El cliente admite una lista de hasta 250 perfiles reales; no reutiliza el sistema de LOD completo del proyecto original.

## Modelo y datos

`lib/model.ts` normaliza exclusivamente los campos públicos utilizados y define normalización y desbloqueos; `lib/progression.ts` calcula la media y el crecimiento por actividad nueva. `lib/city-layout.ts` genera geometría a partir de jugadores o maquetas identificadas. La puntuación no controla la altura permanente.

Cloudflare D1 conserva perfiles públicos normalizados, XP máximo, preferencias y propiedad verificada. `db/schema.ts` declara tablas; `drizzle/` contiene migraciones. No se almacenan correos, biografías, partidas completas ni tokens de Lichess.

## Identidad y permisos

`/auth/start` genera estado y verificador aleatorios de 256 bits. El verificador vive temporalmente en el servidor; el navegador recibe una cookie HttpOnly para enlazar el estado. Se solicita OAuth con PKCE S256 y sin permisos adicionales. El retorno comprueba estado, cookie y caducidad, consume una única vez la solicitud y consulta `/api/account` con el token recibido.

La cuenta se marca vinculada únicamente después de esa verificación. Se crea una sesión de ChessCity de siete días: cookie HttpOnly/SameSite=Lax y Secure en HTTPS; en base se guarda su hash. El token Lichess se usa en memoria y se intenta revocar después; no se conserva. No se han probado los consentimientos de una cuenta real sin intervención del usuario.

Las escrituras de parcelas, ampliaciones y personalización comprueban origen, sesión y desbloqueos en servidor. El identificador de destino procede de la sesión, nunca del cuerpo enviado por el cliente. La sesión se elimina al salir. Los tokens, verificador y códigos OAuth no se registran en archivos ni respuestas de diagnóstico.

## API y carga

Las consultas de perfiles se almacenan quince minutos. Una concesión atómica en D1 serializa el acceso saliente a Lichess y evita peticiones simultáneas entre instancias mientras están dentro del tiempo de espera de doce segundos. Tras HTTP 429, se impone una pausa global de un minuto. Se devuelven errores explícitos; no se sustituyen respuestas fallidas por datos inventados.

Falta probar carga sostenida, revisar retención y eliminación de datos de usuarios, reforzar cuotas por cliente y completar una auditoría antes de abrir un servicio comercial. El alojamiento previo de Sites es independiente de Cloudflare.

## Procedencia y distribución

Ver `NOTICE.md`. El archivo público `/source/chesscity.tar.gz` contiene el código correspondiente a la compilación y excluye secretos y datos de ejecución. No se ha copiado el backend de GitHub, criptomonedas, publicidad o economía del proyecto original.

## Comunidades y cobros

`lib/neighborhoods.ts` define capacidades y coordenadas; `lib/community-server.ts` crea los registros iniciales y solicitudes. Una restricción única en `players.plot_id` evita doble ocupación. Cada ampliación añade 4 plazas por 100 céntimos en total.

`lib/checkout-store.ts` reserva aportaciones de 50 o 100 céntimos con un único INSERT condicional en D1. Las reservas abiertas no se liberan por una redirección del navegador ni por su reloj: se consulta su estado en Stripe. Los reintentos de creación reutilizan la clave de idempotencia. Si un resultado ambiguo excede 23 horas, se retiene para revisión en vez de arriesgar otro cobro.

`lib/stripe-protocol.ts` verifica HMAC sobre el cuerpo original y valida producto, sesión, importe, moneda, modo y propietario. `lib/stripe-server.ts` consulta Stripe desde el servidor y aplica recibos idempotentes por ID de sesión. El webhook no acepta afirmaciones de pago del cliente. El despliegue mantiene `STRIPE_PAYMENTS_ENABLED=false`; sin secretos y origen canónico no se abre checkout. No se ha completado una prueba integral con Stripe ni implementado el tratamiento automático de disputas/reembolsos.

## Animaciones y vencimientos

`lib/city-events.ts` registra obras y mejoras reales, y reubica al vencer un alquiler conservando el perfil del alumno. Se generan dos eventos: demolición en origen y obra en una parcela gratuita. La operación es transaccional e idempotente, con una zona gratuita de reserva si todas las parcelas iniciales están ocupadas. El Worker comprueba vencimientos cada quince minutos.

`app/city-animation.ts` usa geometrías compartidas y elementos temporales para grúa, bola, operarios y andamios. El render continuo solo se mantiene durante las animaciones; se vuelve a dibujar bajo demanda al terminar. Los eventos recientes se consultan cada quince segundos en pestañas visibles; si no cambian los datos no se reconstruye la escena. La conciliación mensual está implementada, pero no habilita cobros hasta completar la prueba integral.

## Facturas y suscripciones

`lib/rental-store.ts` mantiene `rental_subscriptions` y `rental_invoices`. Las escrituras de estado, cobertura y parcelas son transaccionales. Los IDs de factura son inmutables y el acceso usa fechas de servicio, no un contador acumulado de cobros. `lib/rental-protocol.ts` valida producto, moneda, importe y periodicidad; `lib/stripe-proof.ts` comprueba el grafo de pagos de las facturas para no aceptar simplemente un estado «paid» marcado manualmente.

`lib/stripe-server.ts` usa una instancia del SDK oficial, Checkout en modo subscription, lectura de estado actual para webhook y cron y cancelación al final del período. Los webhooks se firman/verifican con el SDK y se vinculan por IDs de Stripe a registros propios. No se almacenan métodos de pago ni datos de tarjeta; solo IDs, importes y períodos necesarios. «Mis alquileres» consulta y cancela exclusivamente las aportaciones de la sesión autenticada. Se mantienen los cobros desactivados.
