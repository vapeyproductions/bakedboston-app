import { boolean, integer, pgTable, serial, text, timestamp, doublePrecision, uniqueIndex } from "drizzle-orm/pg-core";

export const bakeries = pgTable("bakeries", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  contactName: text("contact_name").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  businessPhone: text("business_phone").notNull().default(""),
  notificationPhone: text("notification_phone").notNull().default(""),
  recurringDays: text("recurring_days").notNull(),
  readyTime: text("ready_time").notNull(),
  arrivalDeadline: text("arrival_deadline").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pantries = pgTable("pantries", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  contactName: text("contact_name").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  businessPhone: text("business_phone").notNull().default(""),
  notificationPhone: text("notification_phone").notNull().default(""),
  recurringDays: text("recurring_days").notNull(),
  openTime: text("open_time").notNull(),
  closeTime: text("close_time").notNull(),
  latestArrival: text("latest_arrival").notNull(),
  deliveriesSevenDays: integer("deliveries_seven_days").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rescueRoutes = pgTable("rescue_routes", {
  id: serial("id").primaryKey(),
  bakeryName: text("bakery_name").notNull(),
  pantryName: text("pantry_name").notNull(),
  driverName: text("driver_name").notNull().default("Unassigned"),
  scheduledArrival: text("scheduled_arrival").notNull(),
  status: text("status", { enum: ["reserved", "ongoing", "completed"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const partnerAccounts = pgTable("partner_accounts", {
  id: serial("id").primaryKey(),
  organizationType: text("organization_type", { enum: ["bakery", "pantry"] }).notNull(),
  organizationId: integer("organization_id").notNull(),
  accountEmail: text("account_email").notNull(),
  passwordHash: text("password_hash").notNull(),
  administratorName: text("administrator_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("partner_accounts_email_unique").on(table.accountEmail),
]);

export const partnerInvitations = pgTable("partner_invitations", {
  id: serial("id").primaryKey(),
  organizationType: text("organization_type", { enum: ["bakery", "pantry"] }).notNull(),
  organizationId: integer("organization_id").notNull(),
  accountEmail: text("account_email").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("partner_invitations_token_unique").on(table.tokenHash),
]);
