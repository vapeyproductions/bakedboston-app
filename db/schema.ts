import { boolean, integer, pgTable, serial, text, timestamp, doublePrecision, uniqueIndex } from "drizzle-orm/pg-core";

export const bakeries = pgTable("bakeries", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  formattedAddress: text("formatted_address").notNull().default(""),
  googlePlaceId: text("google_place_id").notNull().default(""),
  addressValidationStatus: text("address_validation_status", { enum: ["unvalidated", "validated", "needs_review"] }).notNull().default("unvalidated"),
  dropoffInstructions: text("dropoff_instructions").notNull().default(""),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  contactName: text("contact_name").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  businessPhone: text("business_phone").notNull().default(""),
  notificationPhone: text("notification_phone").notNull().default(""),
  recurringDays: text("recurring_days").notNull(),
  businessOpenTime: text("business_open_time").notNull().default("{}"),
  businessCloseTime: text("business_close_time").notNull().default("{}"),
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
  formattedAddress: text("formatted_address").notNull().default(""),
  googlePlaceId: text("google_place_id").notNull().default(""),
  addressValidationStatus: text("address_validation_status", { enum: ["unvalidated", "validated", "needs_review"] }).notNull().default("unvalidated"),
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
  serviceModes: text("service_modes").notNull().default("[]"),
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
  serviceMode: text("service_mode", { enum: ["staffed", "unattended"] }).notNull().default("staffed"),
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

export const scheduleExceptions = pgTable("schedule_exceptions", {
  id: serial("id").primaryKey(),
  organizationType: text("organization_type", { enum: ["bakery", "pantry"] }).notNull(),
  organizationId: integer("organization_id").notNull(),
  exceptionDate: text("exception_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rescueRoutes = pgTable("rescue_routes", {
  id: serial("id").primaryKey(),
  bakeryName: text("bakery_name").notNull(),
  pantryName: text("pantry_name").notNull(),
  driverName: text("driver_name").notNull().default("Unassigned"),
  scheduledArrival: text("scheduled_arrival").notNull(),
  status: text("status", { enum: ["reserved", "ongoing", "completed", "cancelled"] }).notNull(),
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

export const driverAccounts = pgTable("driver_accounts", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull().default(""),
  phone: text("phone").notNull().default(""),
  homeAddress: text("home_address").notNull().default(""),
  homeZip: text("home_zip").notNull().default(""),
  dateOfBirth: text("date_of_birth").notNull().default(""),
  identityVerificationStatus: text("identity_verification_status", { enum: ["not_started", "pending", "verified", "needs_attention"] }).notNull().default("not_started"),
  identityVerificationReference: text("identity_verification_reference").notNull().default(""),
  active: boolean("active").notNull().default(true),
  lastLatitude: doublePrecision("last_latitude"),
  lastLongitude: doublePrecision("last_longitude"),
  lastLocationAt: timestamp("last_location_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("driver_accounts_email_unique").on(table.email),
]);

export const bakeryPickupOccurrences = pgTable("bakery_pickup_occurrences", {
  id: serial("id").primaryKey(),
  bakeryId: integer("bakery_id").notNull(),
  serviceDate: text("service_date").notNull(),
  pickupWindowStartsAt: timestamp("pickup_window_starts_at", { withTimezone: true }).notNull(),
  pickupDeadline: timestamp("pickup_deadline", { withTimezone: true }).notNull(),
  status: text("status", { enum: [
    "scheduled", "awaiting_confirmation", "confirmed", "decision_deferred",
    "insufficient_food", "reserved", "cancelled",
  ] }).notNull().default("awaiting_confirmation"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  commitmentReminderDueAt: timestamp("commitment_reminder_due_at", { withTimezone: true }),
  confirmationNote: text("confirmation_note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("bakery_pickup_occurrence_unique").on(table.bakeryId, table.pickupWindowStartsAt),
]);

export const driverRideRequests = pgTable("driver_ride_requests", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull(),
  serviceDate: text("service_date").notNull(),
  earliestStart: timestamp("earliest_start", { withTimezone: true }).notNull(),
  latestFinish: timestamp("latest_finish", { withTimezone: true }).notNull(),
  startZip: text("start_zip").notNull().default(""),
  endZip: text("end_zip").notNull().default(""),
  maximumExtraMinutes: integer("maximum_extra_minutes"),
  status: text("status", { enum: ["active", "paused", "matched", "expired", "cancelled"] }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const routeOffers = pgTable("route_offers", {
  id: serial("id").primaryKey(),
  pickupOccurrenceId: integer("pickup_occurrence_id").notNull(),
  driverRequestId: integer("driver_request_id").notNull(),
  driverId: integer("driver_id").notNull(),
  pantryId: integer("pantry_id").notNull(),
  rank: integer("rank").notNull().default(1),
  score: doublePrecision("score").notNull().default(0),
  estimatedBakeryArrival: timestamp("estimated_bakery_arrival", { withTimezone: true }).notNull(),
  estimatedPantryArrival: timestamp("estimated_pantry_arrival", { withTimezone: true }).notNull(),
  departureWindowStartsAt: timestamp("departure_window_starts_at", { withTimezone: true }),
  departureWindowEndsAt: timestamp("departure_window_ends_at", { withTimezone: true }),
  departureOpeningReminderSentAt: timestamp("departure_opening_reminder_sent_at", { withTimezone: true }),
  departureOpenedNotificationSentAt: timestamp("departure_opened_notification_sent_at", { withTimezone: true }),
  departureClosingReminderSentAt: timestamp("departure_closing_reminder_sent_at", { withTimezone: true }),
  departureEndedNotificationSentAt: timestamp("departure_ended_notification_sent_at", { withTimezone: true }),
  driverConfirmationDueAt: timestamp("driver_confirmation_due_at", { withTimezone: true }),
  driverConfirmationDeadlineAt: timestamp("driver_confirmation_deadline_at", { withTimezone: true }),
  driverConfirmationRequestedAt: timestamp("driver_confirmation_requested_at", { withTimezone: true }),
  driverConfirmedAt: timestamp("driver_confirmed_at", { withTimezone: true }),
  pickupReadyAt: timestamp("pickup_ready_at", { withTimezone: true }),
  readyReminder30SentAt: timestamp("ready_reminder_30_sent_at", { withTimezone: true }),
  readyReminder25SentAt: timestamp("ready_reminder_25_sent_at", { withTimezone: true }),
  readyReminder20SentAt: timestamp("ready_reminder_20_sent_at", { withTimezone: true }),
  readyReminder15SentAt: timestamp("ready_reminder_15_sent_at", { withTimezone: true }),
  bakeryHandoffConfirmedAt: timestamp("bakery_handoff_confirmed_at", { withTimezone: true }),
  bakeryHandoffDisputedAt: timestamp("bakery_handoff_disputed_at", { withTimezone: true }),
  status: text("status", { enum: ["queued", "offered", "accepted", "declined", "expired", "withdrawn", "cancelled"] }).notNull().default("queued"),
  offeredAt: timestamp("offered_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  deliveryStage: text("delivery_stage", { enum: [
    "reserved", "en_route_to_bakery", "arrived_at_bakery", "picked_up",
    "en_route_to_pantry", "arrived_at_pantry", "completed",
  ] }).notNull().default("reserved"),
  arrivedAtBakeryAt: timestamp("arrived_at_bakery_at", { withTimezone: true }),
  pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
  arrivedAtPantryAt: timestamp("arrived_at_pantry_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("route_offer_request_pickup_unique").on(table.driverRequestId, table.pickupOccurrenceId),
]);

export const inAppNotifications = pgTable("in_app_notifications", {
  id: serial("id").primaryKey(),
  recipientType: text("recipient_type", { enum: ["driver", "bakery", "pantry", "admin"] }).notNull(),
  recipientId: integer("recipient_id").notNull(),
  eventType: text("event_type").notNull(),
  threadKey: text("thread_key").notNull().default(""),
  title: text("title").notNull(),
  body: text("body").notNull(),
  actionRequired: boolean("action_required").notNull().default(false),
  actionKey: text("action_key").notNull().default(""),
  readAt: timestamp("read_at", { withTimezone: true }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  pushSentAt: timestamp("push_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pushDevices = pgTable("push_devices", {
  id: serial("id").primaryKey(),
  recipientType: text("recipient_type", { enum: ["driver", "bakery", "pantry"] }).notNull(),
  recipientId: integer("recipient_id").notNull(),
  expoPushToken: text("expo_push_token").notNull(),
  platform: text("platform").notNull().default("unknown"),
  active: boolean("active").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("push_devices_token_unique").on(table.expoPushToken),
]);

export const mobileSessions = pgTable("mobile_sessions", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  role: text("role", { enum: ["driver", "bakery", "pantry"] }).notNull(),
  accountId: integer("account_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("mobile_sessions_token_unique").on(table.tokenHash),
]);

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
