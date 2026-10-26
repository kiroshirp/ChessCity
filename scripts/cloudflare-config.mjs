export function validateDatabaseId(value) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    ) ||
    value === "00000000-0000-4000-8000-000000000000"
  ) {
    throw new Error(
      "Falta CHESSCITY_D1_ID: configura el identificador real de la base D1 en las variables de compilación de Cloudflare. No es una clave secreta.",
    );
  }
  return value;
}
