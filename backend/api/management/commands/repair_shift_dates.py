"""
Align ShiftAssignment.date with the day the shift was last active.

Example: month template dated 1 Oct whose updated_at / checkout is 4 Oct
→ set shift.date to 4 Oct (never deletes the row).

Also moves linked BaDailyReport.date when it still matches the old shift date.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.utils import timezone

from api.models import BaDailyReport, ShiftAssignment
from api.shifts import day_key_for


class Command(BaseCommand):
    help = 'Set shift.date to last activity / updated_at day without deleting shifts.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would change without writing.',
        )

    def handle(self, *args, **options):
        dry = bool(options['dry_run'])
        moved = 0
        skipped = 0
        reports_moved = 0

        qs = (
            ShiftAssignment.objects.filter(ambassador_id__isnull=False)
            .exclude(status=ShiftAssignment.Status.OPEN)
            .order_by('id')
        )

        for shift in qs.iterator():
            # Prefer check-out day, then check-in day, then updated_at
            # when it falls on a different calendar day than shift.date
            # (month templates dated the 1st that were last used later).
            activity = None
            if shift.checked_out_at:
                activity = timezone.localtime(shift.checked_out_at).date()
            elif shift.checked_in_at:
                activity = timezone.localtime(shift.checked_in_at).date()
            elif shift.updated_at:
                upd = timezone.localtime(shift.updated_at).date()
                today = timezone.localdate()
                # Month templates (dated the 1st) last touched on a later day —
                # ignore "today" which is often just migrate/save noise.
                if shift.date.day == 1 and shift.date < upd < today:
                    activity = upd

            if activity is None or activity == shift.date:
                skipped += 1
                continue

            # Only advance a template/old date forward to the activity day
            # (e.g. 1 Oct → 4 Oct). Never move a shift backward.
            if activity < shift.date:
                skipped += 1
                continue

            clash = (
                ShiftAssignment.objects.filter(
                    ambassador_id=shift.ambassador_id,
                    store_id=shift.store_id,
                    date=activity,
                )
                .exclude(pk=shift.pk)
                .exists()
            )
            if clash:
                self.stdout.write(
                    self.style.WARNING(
                        f'skip shift {shift.id}: already have a row on {activity} '
                        f'for BA {shift.ambassador_id}'
                    )
                )
                skipped += 1
                continue

            old_date = shift.date
            self.stdout.write(
                f'shift {shift.id} BA={shift.ambassador_id}: {old_date} → {activity}'
            )
            if not dry:
                shift.date = activity
                shift.day_key = day_key_for(activity)
                shift.save(update_fields=['date', 'day_key', 'updated_at'])
                updated = BaDailyReport.objects.filter(shift=shift, date=old_date).update(
                    date=activity
                )
                reports_moved += updated
            moved += 1

        verb = 'Would move' if dry else 'Moved'
        self.stdout.write(
            self.style.SUCCESS(
                f'{verb} {moved} shift(s); skipped {skipped}; '
                f'reports date-aligned {reports_moved}'
            )
        )
