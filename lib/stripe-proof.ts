import type Stripe from "stripe";
import { stripeId } from "./rental-protocol";

/** A paid invoice alone can include manually recorded payments; verify its actual payment graph. */
export async function verifyInvoicePayment(
  client: Pick<
    Stripe,
    "invoicePayments" | "paymentIntents" | "charges" | "disputes"
  >,
  invoiceId: string,
  expected: number,
) {
  const payments = await client.invoicePayments.list({
    invoice: invoiceId,
    status: "paid",
    limit: 5,
  });
  if (payments.has_more || !payments.data.length)
    return { verified: false, blocked: false };
  let paid = 0,
    blocked = false;
  for (const payment of payments.data) {
    if (payment.currency !== "eur" || !payment.amount_paid)
      return { verified: false, blocked: false };
    let chargeId: string | null = null;
    if (payment.payment.type === "payment_intent") {
      const intent = await client.paymentIntents.retrieve(
        stripeId(payment.payment.payment_intent)!,
        { expand: ["latest_charge"] },
      );
      if (intent.status !== "succeeded")
        return { verified: false, blocked: false };
      chargeId = stripeId(intent.latest_charge);
    } else if (payment.payment.type === "charge")
      chargeId = stripeId(payment.payment.charge);
    if (!chargeId) return { verified: false, blocked: false };
    const charge = await client.charges.retrieve(chargeId);
    if (!charge.paid || !charge.captured)
      return { verified: false, blocked: false };
    let disputed = charge.disputed;
    if (disputed) {
      const disputes = await client.disputes.list({
        charge: chargeId,
        limit: 5,
      });
      disputed =
        disputes.has_more ||
        disputes.data.some(
          (dispute) => !["won", "warning_closed"].includes(dispute.status),
        );
    }
    blocked ||= charge.amount_refunded > 0 || disputed;
    paid += payment.amount_paid;
  }
  return { verified: paid === expected, blocked };
}
