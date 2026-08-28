import { NextResponse } from "next/server";

import { requestCustomSimulation, type CustomSimulationInput } from "../../../optimizer-service";

export const maxDuration = 60;

const boundedInteger = (value: unknown, label: string, minimum: number, maximum: number) => {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${label} must be a whole number from ${minimum} to ${maximum}.`);
  }
  return Number(value);
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as Partial<CustomSimulationInput>;
    const input: CustomSimulationInput = {
      driversPerDay: boundedInteger(body.driversPerDay, "Drivers per day", 1, 12),
      bakeryCount: boundedInteger(body.bakeryCount, "Bakeries", 2, 9),
      pantryCount: boundedInteger(body.pantryCount, "Pantries", 2, 9),
      horizonDays: 5,
      randomSeed: boundedInteger(body.randomSeed, "Random seed", 1, 999_999_999),
      maxSimultaneousDrivers: boundedInteger(
        body.maxSimultaneousDrivers,
        "Maximum simultaneous drivers",
        2,
        3,
      ) as 2 | 3,
    };

    return NextResponse.json(await requestCustomSimulation(input));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The custom simulation could not be completed.";
    const isValidationError = /must be a whole number/.test(message);
    return NextResponse.json({ error: message }, { status: isValidationError ? 400 : 502 });
  }
}
