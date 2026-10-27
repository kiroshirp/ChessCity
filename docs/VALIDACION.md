# Validación de la versión 0.2

## Comprobaciones realizadas

- 39 pruebas de dominio y SQLite superadas: normalización, límites de crecimiento, exclusión del historial, media de puntuaciones, coordenadas, propiedad exclusiva, crecimiento del terreno público y liquidación idempotente del objetivo conjunto de 100 céntimos.
- TypeScript sin errores y compilación completa satisfactoria. Three.js mantiene un bloque superior a 500 kB; falta medir rendimiento en dispositivos modestos.
- Siete migraciones aplicadas correctamente a la nueva base D1 de ChessCity en Cloudflare.
- HTTP en la web Cloudflare publicada: ciudad, sesión anónima/falsificada, PKCE, estado OAuth inválido, origen ajeno, 48 parcelas iniciales, operaciones protegidas y checkout desactivado.
- Navegador local: tres comunidades con 16 plazas, elección desde lista y desde una parcela iluminada del mapa, aviso de vinculación para visitantes, tejados pequeños y haz de selección.

## Límites

Las pruebas de liquidación usan recibos ficticios en una base aislada; no se ha realizado ningún cobro ni conectado un proveedor. Falta probar concurrencia real distribuida, carga masiva y equilibrio a largo plazo. La vinculación con Lichess fue confirmada por el usuario en el alojamiento anterior; no se ha repetido su consentimiento ni probado una reserva desde su sesión real en este entorno nuevo.

Despliegue Cloudflare completado: https://chesscity.kiroshirp.workers.dev. Base D1 propia y cobros desactivados. El alojamiento anterior de Sites permanece independiente. Se han eliminado los archivos y paquetes locales del antiguo prototipo de gestión. La integración de Sites no ofrece una operación de eliminación del sitio remoto.

Las pruebas de Stripe cubren firma HMAC, rechazo de cuerpo alterado o caducado, comprobación de producto/sesión/importe/moneda/miembro, reserva del objetivo total y ampliación de cuatro parcelas con un solo pago o dos aportaciones. No se han creado cargos ni completado un checkout real.

La ciudad de producción ya no usa maquetas: la selección de residentes exige cuenta verificada y parcela. Se ha añadido una prueba que evita construir edificios al consultar perfiles o vincular cuentas sin parcela. La interfaz adopta las referencias aportadas: carbón, marfil, bordes oscuros y controles elevados.

Pruebas adicionales: fin de alquiler, reubicación gratuita sin pérdida de progreso, idempotencia del vencimiento, finalización de animaciones y movimiento reducido. La grúa y la bola se revisaron en una escena local aislada, sin usuarios ficticios en producción. La integración mensual con Stripe permanece bloqueada expresamente hasta probar el ciclo completo en un sandbox separado.

## Ampliación de pruebas de Stripe

Se sustituyó el liquidador inicial de pagos puntuales por un registro mensual de suscripciones y facturas; la tabla histórica se conserva. Las pruebas verifican períodos reales, renovaciones sin duplicados, dos aportaciones mensuales de 50 céntimos, cancelación al fin del período, bloqueo por reembolso, recuperación verificada, identidad inmutable, reservas que incluyen compromisos ya suscritos, rechazo de facturas sin pago real y firma con el SDK oficial. No se han creado pagos, suscripciones ni reembolsos en Stripe real.

La verificación integral de Checkout, cobro, renovación y entrega de webhooks desde un sandbox de Stripe sigue pendiente. La conexión del chat a Stripe no instala credenciales en el Worker. El pago permanece bloqueado por configuración y por la guarda de validación integral.

También se verifica que una observación de pago atrasada no deshace un reembolso posterior; las observaciones de cobertura se ordenan por su instante de consulta.
