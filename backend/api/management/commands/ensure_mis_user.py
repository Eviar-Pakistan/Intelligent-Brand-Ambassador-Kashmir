"""Create or update the default MIS login: mis@gmail.com / Mis123?"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from core.models import UserType

User = get_user_model()

MIS_EMAIL = 'mis@gmail.com'
MIS_PASSWORD = 'Mis123?'


class Command(BaseCommand):
    help = 'Ensure MIS user mis@gmail.com exists with the shared password.'

    def handle(self, *args, **options):
        user, created = User.objects.get_or_create(
            email=MIS_EMAIL,
            defaults={
                'username': 'mis',
                'first_name': 'MIS',
                'last_name': 'User',
                'user_type': UserType.MIS,
                'is_active': True,
                'is_active_user': True,
            },
        )
        user.user_type = UserType.MIS
        user.is_active = True
        user.is_active_user = True
        if not user.username:
            user.username = 'mis'
        user.set_password(MIS_PASSWORD)
        user.save()
        verb = 'Created' if created else 'Updated'
        self.stdout.write(self.style.SUCCESS(f'{verb} MIS user {MIS_EMAIL}'))
