"""Ensure Head Office login headoffice@kashmir.pk has user_type=HEAD_OFFICE."""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from core.models import UserType

User = get_user_model()

HO_EMAIL = 'headoffice@kashmir.pk'


class Command(BaseCommand):
    help = 'Ensure headoffice@kashmir.pk has user_type=Head Office (1).'

    def handle(self, *args, **options):
        try:
            user = User.objects.get(email=HO_EMAIL)
        except User.DoesNotExist:
            self.stderr.write(self.style.ERROR(f'No user with email {HO_EMAIL}'))
            return

        prev = user.user_type
        user.user_type = UserType.HEAD_OFFICE
        user.is_active = True
        user.is_active_user = True
        user.save(update_fields=['user_type', 'is_active', 'is_active_user'])
        self.stdout.write(
            self.style.SUCCESS(
                f'Updated {HO_EMAIL}: user_type {prev} → {UserType.HEAD_OFFICE} (Head Office)'
            )
        )
