# Generated for BaIncentivePayout

from django.conf import settings
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('api', '0008_incentive_kpi_settings'),
    ]

    operations = [
        migrations.CreateModel(
            name='BaIncentivePayout',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('week_start', models.DateField(db_index=True, help_text='Monday of the incentive week')),
                ('week_end', models.DateField(help_text='Sunday of the incentive week')),
                (
                    'status',
                    models.CharField(
                        choices=[('Pending', 'Pending'), ('Approved', 'Approved'), ('Paid', 'Paid')],
                        db_index=True,
                        default='Pending',
                        max_length=20,
                    ),
                ),
                ('base_pkr', models.PositiveIntegerField(default=0)),
                ('conversion_pay', models.PositiveIntegerField(default=0)),
                ('session_pay', models.PositiveIntegerField(default=0)),
                ('incentive_pkr', models.PositiveIntegerField(default=0)),
                ('total_pkr', models.PositiveIntegerField(default=0)),
                ('conversion_pct', models.FloatField(default=0)),
                ('sessions', models.PositiveIntegerField(default=0)),
                ('rank', models.PositiveIntegerField(default=0)),
                ('approved_at', models.DateTimeField(blank=True, null=True)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                (
                    'ambassador',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='incentive_payouts',
                        to='api.ambassador',
                    ),
                ),
                (
                    'updated_by',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='incentive_payout_updates',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                'ordering': ['-week_start', 'ambassador_id'],
            },
        ),
        migrations.AddConstraint(
            model_name='baincentivepayout',
            constraint=models.UniqueConstraint(
                fields=('ambassador', 'week_start'),
                name='uniq_ba_incentive_payout_week',
            ),
        ),
    ]
