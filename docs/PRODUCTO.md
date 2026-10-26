# Producto

## Requisitos confirmados

ChessCity: ciudad de jugadores de Lichess, con el soporte de TopChess. Una puntuación visible, crecimiento lento desde una casita, elección de parcela, comunidades y ampliación mediante un objetivo conjunto de **1 €/mes en total**. Personalización de pago y jardines decorables son desarrollos futuros.

## Reglas de esta implementación (equilibrio inicial ajustable)

La media aritmética incluye rapid, blitz, bullet y clásicas con partidas y puntuación no provisional. Las modalidades ausentes no cuentan como cero. No es una puntuación oficial de Lichess.

Vincular una cuenta inicializa su contador sin recompensar el historial. Posteriores sincronizaciones conceden 20 XP por partida puntuada nueva, máximo 5 por día UTC. El exceso se descarta. Un día activo se acredita cuando una sincronización concede XP; no se deduce la fecha de las partidas desde un contador agregado. Si se juegan varios días sin sincronizar, no se reconstruyen esos días.

| Etapa                | XP mínimos | Días activos mínimos |
| -------------------- | ---------: | -------------------: |
| Casita               |          0 |                    0 |
| Casa ampliada        |        120 |                    3 |
| Casa de dos plantas  |        360 |                    7 |
| Bloque residencial   |        800 |                   14 |
| Edificio emblemático |       1800 |                   30 |

Se exigen ambos mínimos. El rating no cambia la altura. Jardín desde la segunda etapa; corona desde la cuarta. Estas cifras y los nombres de las tres comunidades son decisiones de implementación, pendientes de equilibrio con uso real.

## Parcelas y ampliaciones

Tres comunidades iniciales de 16 parcelas: Alameda, El Mirador y La Ribera. Elegir o cambiar a una parcela libre es gratuito en esta versión. La dirección elegida es persistente, con ocupación exclusiva protegida en base de datos. Los perfiles sin parcela usan una distribución provisional que puede cambiar.

Solo miembros pueden solicitar ampliar su comunidad. Una solicitud por tramo, alquiler conjunto de 100 céntimos al mes y 4 parcelas adicionales, máximo 64 por comunidad en esta versión. Stripe está preparado con el producto `prod_U4PzEucod6LCRJ`, pero los cobros permanecen desactivados hasta verificar la cuenta y configurar secretos. Una persona o club puede asumir 1 €/mes, o dos personas 0,50 €/mes cada una. El servidor reserva los importes pendientes para que varios participantes no superen el objetivo de 1 €. La vuelta desde Stripe no acredita fondos: el webhook firmado y la consulta a Stripe verifican sesión, producto, importe, moneda y destinatario.

## Límites

No están implementados reembolsos/disputas automáticos, tienda, jardines decorables ni compra de cosméticos. Antes de activar cobros hay que completar una prueba integral con Stripe, incluyendo devoluciones y recuperación de reservas ambiguas. La conexión de ChatGPT con Stripe no proporciona credenciales al Worker. El límite visual sigue siendo 250 perfiles recientes; no equivale a validar una ciudad masiva. La ciudad no se rellena con edificios ficticios. Solo se representa a propietarios verificados con parcela elegida. Buscar un perfil o vincular una cuenta sin elegir parcela no construye una casa.

## Alquileres para escuelas y clubes

La ampliación permite reunir alumnos o miembros en una misma comunidad. Al vencer el alquiler, el terreno ampliado se libera: las casas se trasladan automáticamente a parcelas gratuitas conservando propietario, progreso y personalización. Primero se usan parcelas gratuitas libres; si faltan se habilita una zona pública gratuita. El jugador no conserva la pertenencia a la parcela alquilada ni paga por conservar su progreso.

El cambio se representa con bola de demolición en el lugar anterior y obra en el destino gratuito. Elegir parcela muestra operarios, andamios y grúa; subir de etapa anima la mejora. Estas escenas duran nueve segundos y respetan la preferencia de movimiento reducido. No se activan con datos inventados ni llenan una ciudad vacía.

La infraestructura de vencimientos usa fechas del servidor y registra eventos idempotentes. La conciliación automática de facturas y renovaciones de Stripe aún no está terminada; `RENTAL_LIFECYCLE_READY=false` impide abrir cobros incluso si se añaden claves. No se está vendiendo un alquiler sin seguimiento mensual fiable.
