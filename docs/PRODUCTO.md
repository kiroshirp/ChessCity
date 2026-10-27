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

Se exigen ambos mínimos. El rating no cambia la altura. Jardín desde la segunda etapa; corona desde la cuarta. Estas cifras son decisiones de implementación, pendientes de equilibrio con uso real. Los jugadores eligen el nombre y la ubicación de sus comunidades.

## Parcelas y ampliaciones

El terreno público está vacío: se elige un punto libre del mapa, se muestra una casa de vista previa y se confirma antes de guardar. No se precargan parcelas ni comunidades. La colocación se ajusta internamente a calles de 16 unidades para evitar solapamientos; el área urbanizable actual abarca ±2048 unidades por eje, fuera de la plaza central. También se puede elegir por coordenadas con teclado. El servidor confirma disponibilidad de forma transaccional; los registros históricos vacíos no bloquean el terreno.

Un jugador con casa puede fundar gratuitamente una comunidad con nombre alrededor de su edificio. Empieza con una única dirección, la del fundador. El edificio fundador mantiene su ubicación. Para reunir al club o escuela, cada ampliación reserva cuatro sitios próximos libres y cuesta **1 €/mes en total**. Solo se muestran como plazas disponibles tras verificar el pago. Se conserva el límite de 64 direcciones por comunidad en esta versión (las ampliaciones se añaden de cuatro en cuatro).

Una persona puede asumir 1 €/mes, o dos personas 0,50 €/mes cada una. El servidor limita los importes pendientes y suscritos al objetivo conjunto. Las comunidades y suscripciones existentes son compatibles. La nueva migración solo añade campos e índices: no borra, desactiva ni desplaza datos de producción. Los antiguos lotes vacíos se excluyen mediante consultas, conservando los registros originales.

Los formularios, campos, validaciones y menús de selección usan los colores carbón/marfil, bordes y relieve de la web. Los selectores se comparten en `CitySelect` y admiten teclado, lectores de pantalla y Escape sin cerrar la ventana que los contiene.

## Límites

No están implementados emisión automática de reembolsos, tienda, jardines decorables ni compra de cosméticos. Los reembolsos y disputas comunicados por Stripe sí bloquean/restablecen la cobertura correspondiente tras verificarla. La integración mensual está verificada con la API de prueba de Stripe; no se ha realizado ningún cobro real de verificación. La conexión de ChatGPT con Stripe no proporciona credenciales al Worker. El límite visual sigue siendo 250 perfiles recientes; no equivale a validar una ciudad masiva. La ciudad no se rellena con edificios ficticios. Solo se representa a propietarios verificados con parcela elegida. Buscar un perfil o vincular una cuenta sin elegir parcela no construye una casa.

## Alquileres para escuelas y clubes

La ampliación permite reunir alumnos o miembros en una misma comunidad. Al vencer el alquiler, el terreno ampliado se libera: las casas se trasladan automáticamente a parcelas gratuitas conservando propietario, progreso y personalización. Primero se usan parcelas gratuitas libres; si faltan se habilita una zona pública gratuita. El jugador no conserva la pertenencia a la parcela alquilada ni paga por conservar su progreso.

El cambio se representa con bola de demolición en el lugar anterior y obra en el destino gratuito. Elegir parcela muestra operarios, andamios y grúa; subir de etapa anima la mejora. Estas escenas duran nueve segundos y respetan la preferencia de movimiento reducido. No se activan con datos inventados ni llenan una ciudad vacía.

La infraestructura de vencimientos usa fechas del servidor y registra eventos idempotentes. Los cobros están habilitados con secretos cifrados en Cloudflare y avisos firmados de Stripe. La validación detallada está en `docs/VALIDACION.md`.
