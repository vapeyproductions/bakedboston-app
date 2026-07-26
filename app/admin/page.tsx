import { requireAdministrator } from "../admin-auth";
import AdminDashboard from "./AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdministrator();
  return <AdminDashboard user={{ name: "BakedBoston Admin", email: "Administrator" }} />;
}
