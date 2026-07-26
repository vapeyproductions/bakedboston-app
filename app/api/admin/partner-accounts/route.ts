import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { partnerAccounts } from "../../../../db/schema";
import { isAdministrator } from "../../../admin-auth";

export async function DELETE(request: Request) {
  if (!(await isAdministrator())) return Response.json({ error: "Sign in required." }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Valid account id required." }, { status: 400 });
  await getDb().delete(partnerAccounts).where(eq(partnerAccounts.id, id));
  return Response.json({ ok: true });
}
