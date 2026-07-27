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

It returns only the operational network data needed for optimization: active organization addresses and cached geocodes, schedules, one-time windows, pauses, exceptions, and route status history.
