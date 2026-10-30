import { describe, expect, it } from "vitest";
import {
  canonicalUom,
  convertPrice,
  loadItemUomMap,
  type ItemUomMap,
} from "./uom";

function makeMap(entries: Array<[string, { shipUom: string; priceUom: string; unitsPerPriceUom: number | null }]>): ItemUomMap {
  return new Map(entries);
}

describe("loadItemUomMap", () => {
  it("builds a lookup keyed by item_number and coerces the factor to a number", async () => {
    const rows = [
      { item_number: "A1", ship_uom: "BD", price_uom: "SQ", units_per_price_uom: "3" },
      { item_number: "A2", ship_uom: "EA", price_uom: "EA", units_per_price_uom: 1 },
    ];
    const fetchAll = async () => rows;
    const map = await loadItemUomMap(fetchAll, {} as any);

    expect(map.size).toBe(2);
    expect(map.get("A1")).toEqual({ shipUom: "BD", priceUom: "SQ", unitsPerPriceUom: 3 });
    expect(map.get("A2")).toEqual({ shipUom: "EA", priceUom: "EA", unitsPerPriceUom: 1 });
  });

  it("skips rows without an item_number", async () => {
    const rows = [
      { item_number: "", ship_uom: "BD", price_uom: "SQ", units_per_price_uom: "3" },
      { item_number: null, ship_uom: "BD", price_uom: "SQ", units_per_price_uom: "3" },
      { item_number: "OK", ship_uom: "BD", price_uom: "SQ", units_per_price_uom: "3" },
    ];
    const map = await loadItemUomMap(async () => rows, {} as any);
    expect([...map.keys()]).toEqual(["OK"]);
  });

  it("normalizes a null / unparseable factor to null and missing units to empty strings", async () => {
    const rows = [
      { item_number: "N1", ship_uom: null, price_uom: null, units_per_price_uom: null },
      { item_number: "N2", ship_uom: "BD", price_uom: "SQ", units_per_price_uom: "not-a-number" },
      { item_number: "N3", ship_uom: "BD", price_uom: "SQ", units_per_price_uom: 0 },
    ];
    const map = await loadItemUomMap(async () => rows, {} as any);
    expect(map.get("N1")).toEqual({ shipUom: "", priceUom: "", unitsPerPriceUom: null });
    // Number("not-a-number") is NaN -> `|| null` collapses to null.
    expect(map.get("N2")?.unitsPerPriceUom).toBeNull();
    // Number(0) is falsy -> `|| null` collapses to null.
    expect(map.get("N3")?.unitsPerPriceUom).toBeNull();
  });

  it("passes a query builder to fetchAll", async () => {
    const select = () => "QUERY";
    const client = { from: (table: string) => ({ select: (cols: string) => ({ table, cols }) }) };
    let received: any;
    const fetchAll = async (make: () => any) => {
      received = make();
      return [];
    };
    await loadItemUomMap(fetchAll, client as any);
    expect(received).toEqual({
      table: "v_item_uom_map",
      cols: "item_number,ship_uom,price_uom,units_per_price_uom",
    });
    void select;
  });
});

describe("canonicalUom", () => {
  const map = makeMap([["A1", { shipUom: "BD", priceUom: "SQ", unitsPerPriceUom: 3 }]]);

  it("returns the item's price_uom when known", () => {
    expect(canonicalUom("A1", map)).toBe("SQ");
  });

  it("prefers price_uom over any fallback", () => {
    expect(canonicalUom("A1", map, "EA")).toBe("SQ");
  });

  it("falls back to the first truthy fallback when the item is unknown", () => {
    expect(canonicalUom("UNKNOWN", map, "", "EA", "BX")).toBe("EA");
  });

  it("returns empty string when nothing is known", () => {
    expect(canonicalUom("UNKNOWN", map)).toBe("");
  });
});

describe("convertPrice", () => {
  const map = makeMap([
    ["A1", { shipUom: "BD", priceUom: "SQ", unitsPerPriceUom: 3 }],
    ["NOFACTOR", { shipUom: "BD", priceUom: "SQ", unitsPerPriceUom: null }],
    ["ZERO", { shipUom: "BD", priceUom: "SQ", unitsPerPriceUom: 0 }],
  ]);

  it("returns not-aligned null when the price is null", () => {
    expect(convertPrice(null, "BD", "SQ", "A1", map)).toEqual({ value: null, aligned: false });
  });

  it("passes the price through when target UOM is empty", () => {
    expect(convertPrice(10, "BD", "", "A1", map)).toEqual({ value: 10, aligned: true });
  });

  it("passes the price through when from and to are the same (case-insensitive)", () => {
    expect(convertPrice(10, "sq", "SQ", "A1", map)).toEqual({ value: 10, aligned: true });
  });

  it("passes the price through when the source UOM is empty", () => {
    expect(convertPrice(10, "", "SQ", "A1", map)).toEqual({ value: 10, aligned: true });
  });

  it("converts ship -> price by multiplying up by the factor", () => {
    // $59.32/BD * 3 BD per SQ = $177.96/SQ
    expect(convertPrice(59.32, "BD", "SQ", "A1", map)).toEqual({ value: 177.96, aligned: true });
  });

  it("converts price -> ship by dividing down by the factor", () => {
    expect(convertPrice(177.96, "SQ", "BD", "A1", map)).toEqual({ value: 59.32, aligned: true });
  });

  it("is case-insensitive on the from/to units", () => {
    expect(convertPrice(59.32, "bd", "sq", "A1", map)).toEqual({ value: 177.96, aligned: true });
  });

  it("refuses to convert an unknown item", () => {
    expect(convertPrice(59.32, "BD", "SQ", "UNKNOWN", map)).toEqual({ value: null, aligned: false });
  });

  it("refuses to convert when the factor is unknown", () => {
    expect(convertPrice(59.32, "BD", "SQ", "NOFACTOR", map)).toEqual({ value: null, aligned: false });
  });

  it("refuses to convert when the factor is zero", () => {
    expect(convertPrice(59.32, "BD", "SQ", "ZERO", map)).toEqual({ value: null, aligned: false });
  });

  it("refuses to convert between units that don't line up with the item's ship/price pair", () => {
    expect(convertPrice(59.32, "BX", "SQ", "A1", map)).toEqual({ value: null, aligned: false });
  });
});
