import { STRIPE_PRODUCT_ID } from "./neighborhoods";
import type { CheckoutRow } from "./checkout-store";
import type { RentalSnapshot } from "./rental-store";
export const stripeId = (value: any): string | null =>
  typeof value === "string"
    ? value
    : typeof value?.id === "string"
      ? value.id
      : null;

export function rentalSnapshot(
  subscription: any,
  invoice: any,
  checkout: CheckoutRow,
  live: boolean,
  observedAt: number,
  productId = STRIPE_PRODUCT_ID,
): RentalSnapshot {
  const items = subscription.items?.data,
    item = items?.[0],
    price = item?.price;
  if (
    !/^sub_[a-zA-Z0-9]+$/.test(subscription.id) ||
    subscription.livemode !== live ||
    !stripeId(subscription.customer) ||
    !Array.isArray(items) ||
    items.length !== 1 ||
    subscription.items.has_more ||
    item.quantity !== 1 ||
    price?.product !== productId ||
    price.currency !== "eur" ||
    price.unit_amount !== checkout.amount_cents ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1
  )
    throw new Error("La suscripción no corresponde al alquiler.");
  const result: RentalSnapshot = {
    id: subscription.id,
    checkoutId: checkout.id,
    customerId: stripeId(subscription.customer)!,
    amountCents: checkout.amount_cents,
    status: subscription.status,
    cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
    observedAt,
  };
  if (invoice?.status === "paid") {
    const line = invoice.lines?.data?.[0];
    if (
      invoice.livemode !== live ||
      stripeId(invoice.parent?.subscription_details?.subscription) !==
        subscription.id ||
      invoice.currency !== "eur" ||
      invoice.amount_paid !== checkout.amount_cents ||
      invoice.amount_due !== checkout.amount_cents ||
      invoice.lines?.has_more ||
      invoice.lines?.data?.length !== 1 ||
      line?.parent?.subscription_item_details?.subscription_item !== item.id ||
      line.quantity !== 1 ||
      !["subscription_create", "subscription_cycle"].includes(
        invoice.billing_reason,
      )
    )
      throw new Error("Factura de alquiler no válida.");
    result.invoice = {
      id: invoice.id,
      amountCents: invoice.amount_paid,
      from: line.period.start * 1000,
      until: line.period.end * 1000,
    };
  }
  return result;
}

/** A draft invoice or an unattempted renewal is not evidence of nonpayment. */
export function renewalProcessing(
  subscription: any,
  invoice: any,
  now: number,
) {
  if (
    ["canceled", "unpaid", "incomplete_expired", "paused"].includes(
      subscription.status,
    ) ||
    subscription.pause_collection
  )
    return false;
  if (!invoice) return true;
  if (
    invoice.status === "draft" ||
    (invoice.status === "open" && !invoice.attempted)
  )
    return true;
  return (
    subscription.status === "active" &&
    invoice.status === "paid" &&
    (invoice.lines?.data?.[0]?.period?.end ?? 0) * 1000 <= now
  );
}
