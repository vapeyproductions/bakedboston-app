import { getDb } from "../db";
import { auditLog } from "../db/schema";

export async function writeAudit(entry: {
  actorType: "admin" | "partner" | "system";
  actorId?: number | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId?: number | null;
  entityName?: string;
  details?: string;
}) {
  await getDb().insert(auditLog).values({
    actorType: entry.actorType,
    actorId: entry.actorId ?? null,
    actorName: entry.actorName,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    entityName: entry.entityName ?? "",
    details: entry.details ?? "",
  });
}
