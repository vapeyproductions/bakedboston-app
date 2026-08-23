import type { Metadata } from "next";

import simulationData from "./simulation-data.json";
import { SimulatorClient } from "./SimulatorClient";

export const metadata: Metadata = {
  title: "Academic Routing Simulator | BakedBoston",
  description:
    "Replay a five-day BakedBoston routing experiment and inspect the routes recommended to each driver by the Gurobi optimization model.",
};

export default function SimulatorPage() {
  return <SimulatorClient data={simulationData} />;
}
