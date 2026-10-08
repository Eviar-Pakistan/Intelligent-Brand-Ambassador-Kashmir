"""BA checkout sales_json — pack keys and category totals in kg from SKU units."""

from __future__ import annotations

OIL_PACK_KEYS = (
    'kpgoCan10',
    'kpgoBtl3',
    'kpgoBtl45',
    'kpgoTin5',
    'kpgoPouch1x5',
    'kpgoSup1x5',
    'kpgoBkt16',
)

GHEE_PACK_KEYS = (
    'kbpBkt10',
    'kbpBkt25',
    'kbpBkt5',
    'kbpTin5',
    'kbpPouch1x5',
    'kbpBkt16',
)

WAADI_PACK_KEYS = (
    'wbpBkt5',
    'wbpPouch1x5',
    'wbpBkt25',
    'wbpBkt16',
)

CATEGORY_PACK_KEYS = {
    'Kashmir Cooking Oil': OIL_PACK_KEYS,
    'Kashmir Banaspati': GHEE_PACK_KEYS,
    'Waadi Banaspati': WAADI_PACK_KEYS,
}

# kg (or LTR treated as kg) per form unit. BA still enters units; totals convert here.
PACK_KG_PER_UNIT: dict[str, float] = {
    # Kashmir Cooking Oil
    'kpgoCan10': 10.0,
    'kpgoBtl3': 3.0,
    'kpgoBtl45': 4.5,
    'kpgoTin5': 5.0,
    'kpgoPouch1x5': 5.0,  # 1×5 pack
    'kpgoSup1x5': 5.0,
    'kpgoBkt16': 16.0,
    # Kashmir Banaspati
    'kbpBkt10': 10.0,
    'kbpBkt25': 2.5,
    'kbpBkt5': 5.0,
    'kbpTin5': 5.0,
    'kbpPouch1x5': 5.0,
    'kbpBkt16': 16.0,
    # Waadi Banaspati
    'wbpBkt5': 5.0,
    'wbpPouch1x5': 5.0,
    'wbpBkt25': 2.5,
    'wbpBkt16': 16.0,
}

PACK_KEY_LABELS: dict[str, str] = {
    'kpgoCan10': 'KPGO 10 LTR CAN Cons. RED',
    'kpgoBtl3': 'KPGO 3.0 LTR BOTTLE (3LTR X 6) Cons. RED',
    'kpgoBtl45': 'KPGO 4.5 LTR BOTTLE (4.5LTRX 4) Cons. RED',
    'kpgoTin5': 'KPGO 5 LTR TIN Cons. RED',
    'kpgoPouch1x5': 'KPGO POUCH (1LTR x 5) Cons. RED',
    'kpgoSup1x5': 'KPGO Stand Up Pouch (1LTR x 5)',
    'kpgoBkt16': 'KPGO 16 LTR BKT',
    'kbpBkt10': 'KBP GOLD 10 KG BKT',
    'kbpBkt25': 'KBP GOLD 2.5 KG BKT',
    'kbpBkt5': 'KBP GOLD 5 KG BKT',
    'kbpTin5': 'KBP GOLD 5 KG TIN',
    'kbpPouch1x5': 'KBP GOLD POUCH (1KG X 5)',
    'kbpBkt16': 'KBP 16 KG BKT',
    'wbpBkt5': 'WBP 5 KG BKT',
    'wbpPouch1x5': 'WBP POUCH (1KG X 5)',
    'wbpBkt25': 'WBP 2.5 KG BKT',
    'wbpBkt16': 'WBP 16 KG BKT',
}

PACK_LABEL_TO_KEY: dict[str, str] = {label: key for key, label in PACK_KEY_LABELS.items()}


def all_pack_keys() -> tuple[str, ...]:
    return OIL_PACK_KEYS + GHEE_PACK_KEYS + WAADI_PACK_KEYS



def _f(val) -> float:
    try:
        if val is None or val == '':
            return 0.0
        return float(val)
    except (TypeError, ValueError):
        return 0.0


def kg_for_pack_units(key: str, units) -> float:
    """Convert a single SKU's unit count to kg."""
    return round(_f(units) * PACK_KG_PER_UNIT.get(key, 0.0), 1)


def _sum_pack_kg(sales: dict, keys: tuple[str, ...]) -> float:
    return sum(kg_for_pack_units(k, sales.get(k)) for k in keys)


def category_sales_from_json(sales: dict | None) -> dict[str, float]:
    """
    Per-category sales in kg.
    Pack unit fields win (converted via PACK_KG_PER_UNIT); else legacy stored category totals.
    """
    sales = sales if isinstance(sales, dict) else {}
    oil_packs = _sum_pack_kg(sales, OIL_PACK_KEYS)
    ghee_packs = _sum_pack_kg(sales, GHEE_PACK_KEYS)
    waadi_packs = _sum_pack_kg(sales, WAADI_PACK_KEYS)

    oil = oil_packs if oil_packs > 0 else _f(sales.get('salesOil'))
    ghee = ghee_packs if ghee_packs > 0 else _f(sales.get('salesGhee'))
    waadi = waadi_packs if waadi_packs > 0 else _f(sales.get('salesWaadi'))

    return {
        'Kashmir Cooking Oil': round(oil, 1),
        'Kashmir Banaspati': round(ghee, 1),
        'Waadi Banaspati': round(waadi, 1),
    }


def normalize_sales_json(sales: dict | None) -> dict:
    """
    Derive salesOil / salesGhee / salesWaadi in kg from pack unit fields.
    Raw SKU keys stay as unit counts entered by the BA.
    """
    if not isinstance(sales, dict):
        return {}

    out = dict(sales)
    cats = category_sales_from_json(out)
    oil = cats['Kashmir Cooking Oil']
    ghee = cats['Kashmir Banaspati']
    waadi = cats['Waadi Banaspati']
    sku_sum = oil + ghee + waadi

    out['salesOil'] = oil
    out['salesGhee'] = ghee
    out['salesWaadi'] = waadi

    # Drop manual grand total when SKU units drive the report (legacy rows may still have it).
    if sku_sum > 0:
        out.pop('totalSalesLtrKg', None)

    return out
