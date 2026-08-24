import type { Metadata } from "next";

import simulationData from "./simulation-data.json";
import { SimulatorClient } from "./SimulatorClient";

export const metadata: Metadata = {
  title: "Academic Routing Simulator | BakedBoston",
  description:
    "Replay a saved BakedBoston routing study or run a custom Gurobi experiment with your own network and driver counts.",
};

export default function SimulatorPage() {
  return <SimulatorClient data={simulationData} />;
}
