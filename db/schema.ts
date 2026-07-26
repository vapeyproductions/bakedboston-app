import { boolean, integer, pgTable, serial, text, timestamp, doublePrecision, uniqueIndex } from "drizzle-orm/pg-core";

export const bakeries = pgTable("bakeries", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  dropoffInstructions: text("dropoff_instructions").notNull().default(""),
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

export const bakeryAccessPhotos = pgTable("bakery_access_photos", {
  id: serial("id").primaryKey(),
  bakeryId: integer("bakery_id").notNull(),
  imageUrl: text("image_url").notNull(),
  pathname: text("pathname").notNull(),
  caption: text("caption").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pantries = pgTable("pantries", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  dropoffInstructions: text("dropoff_instructions").notNull().default(""),
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

export const pantryAccessPhotos = pgTable("pantry_access_photos", {
  id: serial("id").primaryKey(),
  pantryId: integer("pantry_id").notNull(),
  imageUrl: text("image_url").notNull(),
  pathname: text("pathname").notNull(),
  caption: text("caption").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const availabilityWindows = pgTable("availability_windows", {
  id: serial("id").primaryKey(),
  organizationType: text("organization_type", { enum: ["bakery", "pantry"] }).notNull(),
  organizationId: integer("organization_id").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  latestArrival: timestamp("latest_arrival", { withTimezone: true }).notNull(),
  paused: boolean("paused").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const availabilityPauses = pgTable("availability_pauses", {
  id: serial("id").primaryKey(),
  organizationType: text("organization_type", { enum: ["bakery", "pantry"] }).notNull(),
  organizationId: integer("organization_id").notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
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

export const adminAccounts = pgTable("admin_accounts", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  isMaster: boolean("is_master").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("admin_accounts_email_unique").on(table.email),
]);

export const adminInvitations = pgTable("admin_invitations", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull(),
  invitedByAdminId: integer("invited_by_admin_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("admin_invitations_token_unique").on(table.tokenHash),
]);

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actorType: text("actor_type", { enum: ["admin", "partner", "system"] }).notNull(),
  actorId: integer("actor_id"),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  entityName: text("entity_name").notNull().default(""),
  details: text("details").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationContacts = pgTable("organization_contacts", {
  id: serial("id").primaryKey(),
  organizationType: text("organization_type", { enum: ["bakery", "pantry"] }).notNull(),
  organizationId: integer("organization_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
