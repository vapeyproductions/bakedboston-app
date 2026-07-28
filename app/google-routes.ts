type Coordinates = { latitude: number; longitude: number };

export async function trafficAwareDriveMinutes(origin: Coordinates, destination: Coordinates) {
  const apiKey = process.env.GOOGLE_ROUTES_API_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.duration",
      },
      body: JSON.stringify({
        origin: { location: { latLng: origin } },
        destination: { location: { latLng: destination } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        departureTime: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const data = await response.json() as { routes?: Array<{ duration?: string }> };
    const seconds = Number(data.routes?.[0]?.duration?.replace("s", ""));
    return Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds / 60)) : null;
  } catch {
    return null;
  }
}
