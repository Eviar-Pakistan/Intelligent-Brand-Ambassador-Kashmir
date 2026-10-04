"""
Pre-create today (+ tomorrow by default) ShiftAssignment rows for all active BAs.

Does not delete or clear clocks on existing shifts — only inserts missing day rows.
Run after midnight via cron, e.g.:

  5 0 * * * cd /path/to/backend && .venv/bin/python manage.py ensure_daily_shifts
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from api.shifts import ensure_daily_shifts_for_all


class Command(BaseCommand):
    help = 'Ensure each BA has shift rows for today and the next N days.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days-ahead',
            type=int,
            default=1,
            help='Also create shifts for the next N days (default 1 = tomorrow).',
        )

    def handle(self, *args, **options):
        days_ahead = max(0, int(options['days_ahead']))
        result = ensure_daily_shifts_for_all(days_ahead=days_ahead)
        self.stdout.write(
            self.style.SUCCESS(
                f"BAs={result['bas']} days={result['days']} "
                f"ensured={result['ensured']} newly_created={result['created']}"
            )
        )
