# Optimizer data integration

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
