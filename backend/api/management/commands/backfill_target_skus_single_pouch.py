"""
Append single-unit pouch SKUs to existing BaTarget.assigned_skus
for BAs that already have a category target.

  KPGO POUCH 1 LTR              → Kashmir Cooking Oil
  KPGO Stand Up Pouch 1 LTR     → Kashmir Cooking Oil
  KBP POUCH 1 KG                → Kashmir Banaspati
  WBP POUCH 1 KG                → Waadi Banaspati

Usage:
  python manage.py backfill_target_skus_single_pouch
  python manage.py backfill_target_skus_single_pouch --dry-run
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from api.ba_targets_views import CATEGORY_NAMES, CATEGORY_PACK_LABELS, _category_for_sku
from api.models import BaTarget

NEW_BY_CATEGORY: dict[str, list[str]] = {
    'Kashmir Cooking Oil': [
        'KPGO POUCH 1 LTR',
        'KPGO Stand Up Pouch 1 LTR',
    ],
    'Kashmir Banaspati': [
        'KBP POUCH 1 KG',
    ],
    'Waadi Banaspati': [
        'WBP POUCH 1 KG',
    ],
}


class Command(BaseCommand):
    help = 'Append single-unit 1 LTR/1 KG pouch SKUs to existing BaTarget.assigned_skus by category.'

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

            new_labels = NEW_BY_CATEGORY[cat]
            current = list(row.assigned_skus) if isinstance(row.assigned_skus, list) else []
            if not current and row.sku in CATEGORY_NAMES:
                current = list(CATEGORY_PACK_LABELS.get(cat, []))
            elif not current and row.sku:
                current = [row.sku]

            missing = [label for label in new_labels if label not in current]
            if not missing:
                skipped += 1
                continue

            next_list = [*current, *missing]
            if row.sku in CATEGORY_NAMES:
                for pack in CATEGORY_PACK_LABELS.get(cat, []):
                    if pack not in next_list:
                        next_list.append(pack)

            updated += 1
            if dry:
                self.stdout.write(
                    f'[dry-run] BaTarget#{row.id} ba={row.ambassador_id} '
                    f'month={row.month} sku={row.sku!r} → +{missing}'
                )
                continue

            row.assigned_skus = next_list
            row.save(update_fields=['assigned_skus', 'updated_at'])

        verb = 'Would update' if dry else 'Updated'
        self.stdout.write(self.style.SUCCESS(f'{verb} {updated} target row(s); skipped {skipped}.'))
