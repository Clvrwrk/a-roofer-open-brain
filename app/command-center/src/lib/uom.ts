// Canonical UOM normalization — the ONE place TypeScript surfaces convert a price into an
// item's pricing UOM so that every item-level screen shows a single, comparable unit.
//
// This mirrors the SQL contract in schemas/cleverwork-roofer/121-order-audit-canonical-uom.sql
// and docs/46-uom-pricing-normalization.md. DO NOT re-derive the rule per surface — import this.
//
//   The "Global Price List UOM" for an item = its price_uom (ABC's pricing unit, e.g. SQ).
//   A price quoted in the ship/stocking unit (e.g. BD) is converted UP to price_uom by
//   multiplying by units_per_price_uom (e.g. 3 BD per SQ → $59.32/BD × 3 = $177.96/SQ).
//   We only ever compare/age prices once they are expressed in the same canonical unit;
//   if the relationship is unknown we refuse to convert (aligned=false) rather than show a
//   misleading number.
//
// Data source: v_item_uom_map (item_number → ship_uom, price_uom, units_per_price_uom),
// learned from the invoice feed (migrations 119–122).

export interface ItemUom {
  shipUom: string;
  priceUom: string;
  unitsPerPriceUom: number | null;
}

export type ItemUomMap = Map<string, ItemUom>;

const up = (s: unknown) => String(s ?? "").trim().toUpperCase();

/**
 * Load v_item_uom_map into a lookup. `fetchAll` is the caller's paginated fetch helper
 * (so this reuses the same Supabase client + pagination the surface already has).
 */
export async function loadItemUomMap(
  fetchAll: (make: () => any) => Promise<any[]>,
  client: any,
): Promise<ItemUomMap> {
  const rows = await fetchAll(() =>
    client.from("v_item_uom_map").select("item_number,ship_uom,price_uom,units_per_price_uom"),
  );
  const map: ItemUomMap = new Map();
  for (const r of rows as any[]) {
    if (!r.item_number) continue;
    const factor = r.units_per_price_uom == null ? null : Number(r.units_per_price_uom) || null;
    map.set(r.item_number, {
      shipUom: r.ship_uom ?? "",
      priceUom: r.price_uom ?? "",
      unitsPerPriceUom: factor,
    });
  }
  return map;
}

/** The canonical display UOM for an item = its price_uom, falling back to any source unit. */
export function canonicalUom(itemNumber: string, map: ItemUomMap, ...fallbacks: string[]): string {
  const priceUom = map.get(itemNumber)?.priceUom;
  if (priceUom) return priceUom;
  for (const f of fallbacks) if (f) return f;
  return "";
}

export interface ConvertedPrice {
  value: number | null; // price expressed in `toUom`, or null when it can't be aligned
  aligned: boolean;      // true when the value is trustworthy in `toUom`
}

/**
 * Express `price` (quoted in `fromUom`) in `toUom` for the given item.
 * Symmetric ship⇄price conversion via units_per_price_uom; mirrors migration 121's CASE.
 * Returns aligned=false (value=null) when the units don't line up and no factor is known —
 * callers must then suppress variance and flag the mismatch instead of rendering a wrong number.
 */
export function convertPrice(
  price: number | null,
  fromUom: string,
  toUom: string,
  itemNumber: string,
  map: ItemUomMap,
): ConvertedPrice {
  if (price == null) return { value: null, aligned: false };
  const from = up(fromUom);
  const to = up(toUom);
  if (!to || from === to || !from) return { value: price, aligned: true };

  const um = map.get(itemNumber);
  if (!um) return { value: null, aligned: false };
  const ship = up(um.shipUom);
  const priceU = up(um.priceUom);
  const f = um.unitsPerPriceUom;

  if (f && f !== 0) {
    // ship → price: multiply up to the larger priced unit (e.g. BD → SQ).
    if (from === ship && to === priceU) return { value: price * f, aligned: true };
    // price → ship: divide down.
    if (from === priceU && to === ship) return { value: price / f, aligned: true };
  }
  return { value: null, aligned: false };
}
