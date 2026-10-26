declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    STRIPE_PAYMENTS_ENABLED?: string;
    CHESSCITY_PUBLIC_ORIGIN?: string;
    BUCKET?: R2Bucket;
  }
}
