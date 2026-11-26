from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('api', '0036_supervisorstorevisit_offline_sync_source'),
    ]

    operations = [
        migrations.CreateModel(
            name='SupervisorPackage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('salary', models.PositiveIntegerField(help_text='Gross / base salary PKR')),
                ('fuel_da', models.PositiveIntegerField(help_text='Fuel / DA PKR')),
                ('discipline', models.PositiveIntegerField(help_text='Attendance / discipline allowance PKR')),
                ('mobile', models.PositiveIntegerField(help_text='Mobile / data allowance PKR')),
                ('updated_at', models.DateTimeField(auto_now=True)),
                (
                    'supervisor',
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='package',
                        to='api.supervisor',
                    ),
                ),
                (
                    'updated_by',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='supervisor_package_updates',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                'verbose_name': 'Supervisor package',
                'verbose_name_plural': 'Supervisor packages',
            },
        ),
    ]
