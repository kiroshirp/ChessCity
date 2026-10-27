import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

export const players = sqliteTable(
  "players",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    profile: text("profile").notNull(),
    xp: integer("xp").notNull().default(0),
    accent: text("accent").notNull().default("jade"),
    roof: text("roof").notNull().default("antenna"),
    claimed: integer("claimed").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
    buildingXp: integer("building_xp").notNull().default(0),
    activeDays: integer("active_days").notNull().default(0),
    ratedBaseline: integer("rated_baseline"),
    progressDay: text("progress_day"),
    dailyGames: integer("daily_games").notNull().default(0),
    progressStartedAt: integer("progress_started_at"),
    plotId: text("plot_id"),
  },
  (table) => [uniqueIndex("players_plot_unique").on(table.plotId)],
);

export const communities = sqliteTable("communities", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull().default(16),
  founderId: text("founder_id").unique(),
  originX: integer("origin_x"),
  originZ: integer("origin_z"),
});
export const plots = sqliteTable(
  "plots",
  {
    id: text("id").primaryKey(),
    communityId: text("community_id").notNull(),
    slot: integer("slot").notNull(),
    x: integer("x").notNull(),
    z: integer("z").notNull(),
    rentalExpansionId: text("rental_expansion_id"),
  },
  (table) => [
    uniqueIndex("plots_community_slot").on(table.communityId, table.slot),
  ],
);
export const expansions = sqliteTable("expansions", {
  id: text("id").primaryKey(),
  communityId: text("community_id").notNull(),
  addedSlots: integer("added_slots").notNull().default(4),
  goalCents: integer("goal_cents").notNull().default(100),
  paidCents: integer("paid_cents").notNull().default(0),
  status: text("status").notNull().default("awaiting_payment"),
  createdAt: integer("created_at").notNull(),
  appliedAt: integer("applied_at"),
  rentPaidUntil: integer("rent_paid_until"),
});
export const payments = sqliteTable("expansion_payments", {
  eventId: text("event_id").primaryKey(),
  expansionId: text("expansion_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  refundedCents: integer("refunded_cents").notNull().default(0),
  receivedAt: integer("received_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  hash: text("hash").primaryKey(),
  playerId: text("player_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const oauth = sqliteTable("oauth", {
  hash: text("hash").primaryKey(),
  verifier: text("verifier").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const limits = sqliteTable("limits", {
  key: text("key").primaryKey(),
  nextAt: integer("next_at").notNull(),
});

export const checkouts = sqliteTable("expansion_checkouts", {
  id: text("id").primaryKey(),
  expansionId: text("expansion_id").notNull(),
  playerId: text("player_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull().default("creating"),
  sessionId: text("session_id").unique(),
  checkoutUrl: text("checkout_url"),
  createdAt: integer("created_at").notNull(),
});

export const cityEvents = sqliteTable(
  "city_events",
  {
    id: text("id").primaryKey(),
    playerId: text("player_id").notNull(),
    kind: text("kind").notNull(),
    payload: text("payload").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("city_events_created_at").on(table.createdAt)],
);

export const rentalSubscriptions = sqliteTable("rental_subscriptions", {
  id: text("id").primaryKey(),
  checkoutId: text("checkout_id").notNull().unique(),
  expansionId: text("expansion_id").notNull(),
  playerId: text("player_id").notNull(),
  customerId: text("customer_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull(),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" })
    .notNull()
    .default(false),
  observedAt: integer("observed_at").notNull(),
});
export const rentalInvoices = sqliteTable(
  "rental_invoices",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    periodStart: integer("period_start").notNull(),
    periodEnd: integer("period_end").notNull(),
    blocked: integer("blocked", { mode: "boolean" }).notNull().default(false),
    observedAt: integer("observed_at").notNull().default(0),
  },
  (table) => [index("rental_invoices_subscription").on(table.subscriptionId)],
);
