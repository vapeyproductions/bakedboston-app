export type PantryWasteAllocation = {
  landfill: number;
  pigFarm: number;
  compost: 0;
};

/**
 * Return fixed, unique academic landfill/pig-farm scenarios for the supplied
 * pantry IDs. The paper's observed redistribution-stage baseline is 40/60 and
 * its sensitivity range is 20%–60% landfill; the live explanatory surfaces use
 * a conservative 28%–52% landfill band. These are not measured pantry values.
 */
export function fixedPantryWasteAllocations(ids: number[]) {
  const allocations = new Map<number, PantryWasteAllocation>();
  const usedSlots = new Set<number>();
  const slotCount = 241;

  for (const id of [...new Set(ids)].sort((left, right) => left - right)) {
    let slot = ((Math.imul(id + 1, 1_664_525) + 1_013_904_223) >>> 0) % slotCount;
    while (usedSlots.has(slot)) slot = (slot + 1) % slotCount;
    usedSlots.add(slot);
    const landfill = Math.round((0.28 + slot / 1000) * 1000) / 1000;
    allocations.set(id, {
      landfill,
      pigFarm: Math.round((1 - landfill) * 1000) / 1000,
      compost: 0,
    });
  }

  return allocations;
}
