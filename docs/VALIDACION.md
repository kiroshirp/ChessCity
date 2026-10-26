# Validación de la versión 0.2

## Comprobaciones realizadas

- 18 pruebas de dominio y SQLite superadas: normalización, límites de crecimiento, exclusión del historial, media de puntuaciones, coordenadas, propiedad exclusiva y liquidación idempotente del objetivo conjunto de 100 céntimos.
- TypeScript sin errores y compilación completa satisfactoria. Three.js mantiene un bloque superior a 500 kB; falta medir rendimiento en dispositivos modestos.
- Dos migraciones aplicadas correctamente a una base D1 local vacía.
- HTTP local: ciudad, sesión anónima/falsificada, PKCE, estado OAuth inválido, origen ajeno, 48 parcelas iniciales, operaciones protegidas y checkout desactivado.
- Navegador local: tres comunidades con 16 plazas, elección desde lista y desde una parcela iluminada del mapa, aviso de vinculación para visitantes, tejados pequeños y haz de selección.

## Límites

Las pruebas de liquidación usan recibos ficticios en una base aislada; no se ha realizado ningún cobro ni conectado un proveedor. Falta probar concurrencia real distribuida, carga masiva y equilibrio a largo plazo. La vinculación con Lichess fue confirmada por el usuario en el alojamiento anterior; no se ha repetido su consentimiento ni probado una reserva desde su sesión real en este entorno nuevo.

No se ha desplegado esta versión en Cloudflare ni modificado el alojamiento anterior de Sites. El despliegue requiere el UUID real de D1 y la configuración de Workers Builds descrita en CLOUDFLARE.md.
