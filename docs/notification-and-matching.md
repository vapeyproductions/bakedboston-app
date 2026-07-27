# Notification and advance-matching system

## Operational distinctions

- A recurring pickup window is a scheduled opportunity, not a promise that food exists.
- A confirmed future pickup is a dated commitment that food will be available and may be reserved.
- Pickup ready is a later handoff state indicating that food is packaged for the assigned driver.
- “Not enough food today” closes only the dated occurrence and never changes recurring hours.

## Implemented foundation

- Bakeries store business hours separately from food-ready and pickup-deadline times.
- Web and mobile bakery portals create a dated pickup occurrence from today’s recurring window.
- Bakeries can confirm a pickup, decide later, or report insufficient leftover food.
- Drivers can save date, time, starting-ZIP, and destination-ZIP preferences.
- Confirming a pickup evaluates all active requests for that date.
- Feasible pantry candidates are limited to active, registered, validated locations accepting deliveries at the estimated arrival time.
- Candidates balance pantry priority, approximate travel distance, time-window feasibility, and destination-ZIP fit.
- The best matching driver receives a five-minute offer; later candidates remain queued.
- Accepting an offer atomically reserves the unique bakery pickup.
- Bakery, pantry, and driver in-app notifications include the parties, full route, and current ETAs.
- The private optimizer feed includes confirmed pickups, ride requests, and route-offer state.

## Next notification layer

- Scheduled jobs for bakery opening prompts, driver one-hour confirmations, and readiness reminders.
- Push-notification device registration and delivery.
- Resend operational email templates.
- SMS and automated-call escalation through a provider such as Twilio.
- Driver arrival, pickup handoff, pantry arrival, and attended/unattended completion actions.
- Traffic-aware ETA recalculation through Google Routes.
- Notification-channel preferences and quiet-hour rules.

External notifications are informational or escalations. Actions are satisfied only by the associated in-app confirmation.
