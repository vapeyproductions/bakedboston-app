import { requireAdministrator } from "../admin-auth";
import AdminDashboard from "./AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const administrator = await requireAdministrator();
  return <AdminDashboard user={{ name: administrator.displayName, email: administrator.email, isMaster: administrator.isMaster }} />;
}
