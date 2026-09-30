# Generated for IncentiveKpiSettings

from django.conf import settings
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('api', '0007_ba_target'),
    ]

    operations = [
        migrations.CreateModel(
            name='IncentiveKpiSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('base_pay', models.PositiveIntegerField(default=1000)),
                ('conversion_target', models.FloatField(default=100)),
                ('conversion_amount', models.PositiveIntegerField(default=500)),
                ('session_target', models.FloatField(default=50)),
                ('session_amount', models.PositiveIntegerField(default=500)),
                ('sup_base_pay', models.PositiveIntegerField(default=2000)),
                ('sup_conversion_target', models.FloatField(default=100)),
                ('sup_conversion_amount', models.PositiveIntegerField(default=1000)),
                ('sup_coverage_target', models.FloatField(default=100)),
                ('sup_coverage_amount', models.PositiveIntegerField(default=1000)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                (
                    'updated_by',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='incentive_kpi_updates',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                'verbose_name': 'Incentive KPI settings',
                'verbose_name_plural': 'Incentive KPI settings',
            },
        ),
    ]
