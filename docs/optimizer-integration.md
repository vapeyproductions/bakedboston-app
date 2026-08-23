# Gurobi optimizer integration

BakedBoston uses a separate Python optimization service as the authoritative
production matcher. The web/mobile backend sends it live operational state,
the service builds a Gurobi mixed-integer assignment model, and the app saves
the selected driver–bakery–pantry offers.

Production does not silently substitute the former local heuristic when the
optimizer is unavailable. It returns no new assignment and writes a diagnostic
to the server logs. A deterministic local fallback can only be enabled outside
production with `ALLOW_NON_GUROBI_DEVELOPMENT_FALLBACK=true`.

The private optimizer feed is available at:

```text
GET /api/optimizer/network
Authorization: Bearer <OPTIMIZER_API_KEY>
```

Configure the same randomly generated `OPTIMIZER_API_KEY` in the BakedBoston Vercel project and in the secure environment that runs the optimizer. Never expose this key to the browser or mobile app.

The endpoint is read-only and intentionally excludes:

- account emails and password data;
- organization contacts;
- driver private information;
- access photographs and instructions.

It returns only the operational network data needed for optimization: active, registered organization addresses and cached geocodes, schedules, one-time windows, pauses, exceptions, and route status history.

An administrator-created bakery or pantry record is not eligible for address validation or optimization until its partner invitation has been accepted and an active `partner_accounts` record exists.

Validated addresses are written back through:

```text
PATCH /api/optimizer/locations
Authorization: Bearer <OPTIMIZER_API_KEY>
```

The endpoint independently confirms that the organization has an active registered partner account before saving the formatted address, Place ID, coordinates, and validation status.

## Assignment flow

1. A bakery confirms a pickup occurrence or a driver creates a ride request.
2. The app calls the optimizer once for that service date with
   `mode=network_assignments`.
3. The optimizer downloads the version-2 network snapshot, expands eligible
   pantry windows, and builds every feasible driver–pickup–pantry candidate.
4. Gurobi first maximizes assigned pickups and then maximizes pantry priority
   and route quality, subject to driver/request and pickup uniqueness.
5. The optimizer returns selected assignments and solver diagnostics.
6. The app persists offers and notifies the selected drivers.

Driver browse/search recommendations use the same service and Gurobi-backed
candidate scoring, but do not claim a pickup until a route is reserved.

## Main-app environment

Configure these values in the BakedBoston Vercel project:

```text
OPTIMIZER_BASE_URL=https://<deployed-optimizer-host>
OPTIMIZER_API_KEY=<same-random-secret-as-the-optimizer>
ALLOW_NON_GUROBI_DEVELOPMENT_FALLBACK=false
```

## Optimizer environment

Configure these values only in the Python optimizer project:

```text
BAKEDBOSTON_BASE_URL=https://www.baked-boston.com
OPTIMIZER_API_KEY=<same-random-secret-as-the-main-app>
GOOGLE_MAPS_API_KEY=<server-side-key>
GUROBI_WLSACCESSID=<wls-access-id>
GUROBI_WLSSECRET=<wls-secret>
GUROBI_LICENSEID=<numeric-license-id>
GUROBI_TIME_LIMIT_SECONDS=20
ALLOW_NON_GUROBI_DEVELOPMENT_FALLBACK=false
```

The three Gurobi values must belong to a deployable Web License Service license.
Do not put them in the mobile bundle or expose them through a public API.

## Operational verification

A successful `network_assignments` response includes:

- `solver.backend = "gurobi"`;
- a Gurobi status such as `optimal`;
- candidate and matched counts;
- aggregate route quality, runtime, and MIP gap when available.

An HTTP 503 from the optimizer means Gurobi could not initialize or solve. The
main application will not create a heuristic production assignment in that case.
