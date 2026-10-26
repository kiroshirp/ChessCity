# Producto

## Requisitos confirmados

ChessCity: ciudad de jugadores de Lichess, con el soporte de TopChess. Una puntuación visible, crecimiento lento desde una casita, elección de parcela, comunidades y ampliación mediante un objetivo conjunto de **1 € en total**. Personalización de pago y jardines decorables son desarrollos futuros.

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

Solo miembros pueden solicitar ampliar su comunidad. Una solicitud por tramo, objetivo conjunto de 100 céntimos y 16 parcelas nuevas, máximo 64 por comunidad en esta versión. Los pagos están desactivados. Existe una función interna para aplicar recibos verificados de forma idempotente, sin ruta pública que permita fingir un pago.

## Límites

No se han implementado proveedor de pagos, reparto entre participantes, reembolsos, tienda, jardines decorables ni compra de cosméticos. El proveedor deberá verificar firma, estado, importe, pertenencia, exceso de aportaciones concurrentes y devoluciones antes de activar cobros. El límite visual sigue siendo 250 perfiles recientes; no equivale a validar una ciudad masiva. Las maquetas se identifican como muestras.
