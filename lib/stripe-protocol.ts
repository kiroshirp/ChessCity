import { STRIPE_PRODUCT_ID, CONTRIBUTION_AMOUNTS } from "./neighborhoods";

export async function boundedRequestText(request: Request, maxBytes: number) {
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new Error("Petición demasiado grande.");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let total = 0,
    text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Petición demasiado grande.");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export function contributionAmount(value: unknown) {
  if (!CONTRIBUTION_AMOUNTS.some((amount) => amount === value))
    throw new Error("La aportación debe ser de 0,50 € o 1 €.");
  return value as number;
}

/** Verify the untouched request bytes with Stripe's timestamped HMAC, including key rotation. */
export async function verifyStripeSignature(
  body: string,
  header: string | null,
  secret: string,
  now = Date.now(),
) {
  if (!header || !secret) throw new Error("Firma ausente.");
  const fields = header.split(",").map((part) => part.trim().split("="));
  const timestamp = fields.find(([key]) => key === "t")?.[1] ?? "";
  if (
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    throw new Error("Firma caducada.");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const payload = encoder.encode(`${timestamp}.${body}`);
  for (const [name, signature] of fields) {
    if (name !== "v1" || !/^[a-f0-9]{64}$/i.test(signature ?? "")) continue;
    const bytes = Uint8Array.from(signature.match(/../g)!, (value) =>
      parseInt(value, 16),
    );
    if (await crypto.subtle.verify("HMAC", key, bytes, payload)) return;
  }
  throw new Error("Firma no válida.");
}

export function validateRentalCheckout(
  session: any,
  checkout: {
    id: string;
    expansion_id: string;
    player_id: string;
    amount_cents: number;
    session_id: string | null;
  },
  lines: any,
  live: boolean,
  requirePaid = true,
  productId = STRIPE_PRODUCT_ID,
) {
  if (
    session.id !== checkout.session_id ||
    session.mode !== "subscription" ||
    session.status !== "complete" ||
    (requirePaid && session.payment_status !== "paid") ||
    session.currency !== "eur" ||
    session.amount_total !== checkout.amount_cents ||
    session.livemode !== live ||
    session.client_reference_id !== checkout.id ||
    session.metadata?.checkoutId !== checkout.id ||
    session.metadata?.expansionId !== checkout.expansion_id ||
    session.metadata?.playerId !== checkout.player_id ||
    !Array.isArray(lines?.data) ||
    lines.has_more ||
    lines.data.length !== 1 ||
    lines.data[0].price?.product !== productId ||
    lines.data[0].quantity !== 1 ||
    lines.data[0].amount_total !== checkout.amount_cents
  )
    throw new Error("El pago no corresponde a esta aportación.");
}

export const validatePaidCheckout = validateRentalCheckout;
