"""BA checkout sales_json — pack keys and category totals derived from SKU units."""

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


def _f(val) -> float:
    try:
        if val is None or val == '':
            return 0.0
        return float(val)
    except (TypeError, ValueError):
        return 0.0


def _sum_keys(sales: dict, keys: tuple[str, ...]) -> float:
    return sum(_f(sales.get(k)) for k in keys)


def category_sales_from_json(sales: dict | None) -> dict[str, float]:
    """Per-category sales: pack unit fields win; else legacy stored category totals."""
    sales = sales if isinstance(sales, dict) else {}
    oil_packs = _sum_keys(sales, OIL_PACK_KEYS)
    ghee_packs = _sum_keys(sales, GHEE_PACK_KEYS)
    waadi_packs = _sum_keys(sales, WAADI_PACK_KEYS)

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
    Derive salesOil / salesGhee / salesWaadi from pack unit fields.
    BAs no longer enter manual category or grand totals on the form.
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
