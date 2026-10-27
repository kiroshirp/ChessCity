# Validación de la versión 0.2

## Comprobaciones realizadas

- 41 pruebas de dominio y SQLite superadas: normalización, límites de crecimiento, exclusión del historial, media de puntuaciones, coordenadas, propiedad exclusiva, crecimiento del terreno público, cancelación segura de Checkout y liquidación idempotente del objetivo conjunto de 100 céntimos.
- TypeScript sin errores y compilación completa satisfactoria. Three.js mantiene un bloque superior a 500 kB; falta medir rendimiento en dispositivos modestos.
- Siete migraciones aplicadas correctamente a la nueva base D1 de ChessCity en Cloudflare.
- HTTP en la web Cloudflare publicada: ciudad, sesión anónima/falsificada, PKCE, estado OAuth inválido, origen ajeno, terreno público, operaciones protegidas y autenticación obligatoria para Checkout.
- Navegador local: tres comunidades con 16 plazas, elección desde lista y desde una parcela iluminada del mapa, aviso de vinculación para visitantes, tejados pequeños y haz de selección.

## Límites

Las pruebas unitarias usan una base aislada. Además se ha probado el ciclo mensual con la API de Stripe en modo de prueba y recursos propios. No se han realizado cobros reales. Falta probar concurrencia distribuida, carga masiva y equilibrio a largo plazo.

Despliegue Cloudflare completado: https://chesscity.kiroshirp.workers.dev. Base D1 propia y Stripe configurado. El alojamiento anterior de Sites permanece independiente. Se han eliminado los archivos y paquetes locales del antiguo prototipo de gestión. La integración de Sites no ofrece una operación de eliminación del sitio remoto.

Las pruebas de Stripe cubren firma HMAC, rechazo de cuerpo alterado o caducado, comprobación de producto/sesión/importe/moneda/miembro, reserva del objetivo total y ampliación de cuatro parcelas con un solo pago o dos aportaciones. No se han creado cargos ni completado un checkout real.

La ciudad de producción ya no usa maquetas: la selección de residentes exige cuenta verificada y parcela. Se ha añadido una prueba que evita construir edificios al consultar perfiles o vincular cuentas sin parcela. La interfaz adopta las referencias aportadas: carbón, marfil, bordes oscuros y controles elevados.

Pruebas adicionales: fin de alquiler, reubicación gratuita sin pérdida de progreso, idempotencia del vencimiento, finalización de animaciones y movimiento reducido. La grúa y la bola se revisaron en una escena local aislada, sin usuarios ficticios en producción.

## Ampliación de pruebas de Stripe

Se sustituyó el liquidador inicial de pagos puntuales por un registro mensual de suscripciones y facturas; la tabla histórica se conserva. Las pruebas verifican períodos reales, renovaciones sin duplicados, dos aportaciones mensuales de 50 céntimos, cancelación al fin del período, bloqueo por reembolso, recuperación verificada, identidad inmutable, reservas que incluyen compromisos ya suscritos, rechazo de facturas sin pago real y firma con el SDK oficial. No se han creado pagos, suscripciones ni reembolsos en Stripe real.

La prueba de integración con Stripe verifica los parámetros reales de Checkout, pago simulado inicial, renovación con Test Clocks, impago y recuperación, cancelación al fin del período con traslado gratuito, dos aportaciones de 0,50 € y un reembolso simulado. La aplicación usa los mismos parámetros de Checkout probados. Las credenciales de producción y la firma del webhook se han instalado como secretos del Worker. Se verificó OAuth público desde la sesión existente de Lichess y la apertura de Checkout real desde la ampliación existente: producto correcto y 1 €/mes, sin introducir tarjeta ni completar el pago. Volver mediante el enlace de cancelar de Checkout caduca únicamente la reserva propia pendiente; una sesión ya pagada se concilia sin cancelar su suscripción.

También se verifica que una observación de pago atrasada no deshace un reembolso posterior; las observaciones de cobertura se ordenan por su instante de consulta.

Comprobación publicada: la reserva real de verificación quedó `expired`, sin suscripciones reales creadas. Stripe entregó `checkout.session.expired` al webhook con respuesta HTTP 200. No se introdujo ninguna tarjeta ni se completó ningún pago real. Las pruebas de compilación de GitHub y Workers Builds finalizaron correctamente.
