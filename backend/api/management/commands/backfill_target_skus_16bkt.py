"""
Append the new 16 LTR/KG bucket SKUs to existing BaTarget.assigned_skus
for BAs that already have a category target.

  KPGO 16 LTR BKT  → Kashmir Cooking Oil rows
  KBP 16 KG BKT    → Kashmir Banaspati rows
  WBP 16 KG BKT    → Waadi Banaspati rows

Usage:
  python manage.py backfill_target_skus_16bkt
  python manage.py backfill_target_skus_16bkt --dry-run
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from api.ba_targets_views import CATEGORY_NAMES, CATEGORY_PACK_LABELS, _category_for_sku
from api.models import BaTarget

NEW_BY_CATEGORY = {
    'Kashmir Cooking Oil': 'KPGO 16 LTR BKT',
    'Kashmir Banaspati': 'KBP 16 KG BKT',
    'Waadi Banaspati': 'WBP 16 KG BKT',
}


class Command(BaseCommand):
    help = 'Append 16 LTR/KG BKT SKUs to existing BaTarget.assigned_skus by category.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would change without writing.',
        )

    def handle(self, *args, **options):
        dry = bool(options.get('dry_run'))
        updated = 0
        skipped = 0

        qs = BaTarget.objects.filter(target_kg__gt=0).iterator(chunk_size=200)
        for row in qs:
            cat = _category_for_sku(row.sku)
            if not cat or cat not in NEW_BY_CATEGORY:
                skipped += 1
                continue

            new_label = NEW_BY_CATEGORY[cat]
            current = list(row.assigned_skus) if isinstance(row.assigned_skus, list) else []
            # If empty, seed from full current catalog for that category.
            if not current and row.sku in CATEGORY_NAMES:
                current = list(CATEGORY_PACK_LABELS.get(cat, []))
            elif not current and row.sku:
                current = [row.sku]

            if new_label in current:
                skipped += 1
                continue

            next_list = [*current, new_label]
            # Also ensure full catalog packs are present when this is a category target.
            if row.sku in CATEGORY_NAMES:
                for pack in CATEGORY_PACK_LABELS.get(cat, []):
                    if pack not in next_list:
                        next_list.append(pack)

            updated += 1
            if dry:
                self.stdout.write(
                    f'[dry-run] BaTarget#{row.id} ba={row.ambassador_id} '
                    f'month={row.month} sku={row.sku!r} → +{new_label}'
                )
                continue

            row.assigned_skus = next_list
            row.save(update_fields=['assigned_skus', 'updated_at'])

        verb = 'Would update' if dry else 'Updated'
        self.stdout.write(self.style.SUCCESS(f'{verb} {updated} target row(s); skipped {skipped}.'))
