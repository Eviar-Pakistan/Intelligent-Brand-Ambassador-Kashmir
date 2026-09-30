# Generated manually — BA / Supervisor package KPIs

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0012_store_lat_lng_float'),
    ]

    operations = [
        migrations.AddField(
            model_name='incentivekpisettings',
            name='ba_salary',
            field=models.PositiveIntegerField(default=42000),
        ),
        migrations.AddField(
            model_name='incentivekpisettings',
            name='ba_discipline',
            field=models.PositiveIntegerField(default=1500),
        ),
        migrations.AddField(
            model_name='incentivekpisettings',
            name='ba_travel_per_day',
            field=models.PositiveIntegerField(
                default=300,
                help_text='Travelling allowance PKR per working day',
            ),
        ),
        migrations.AddField(
            model_name='incentivekpisettings',
            name='ba_travel_cap',
            field=models.PositiveIntegerField(
                default=7800,
                help_text='Max travelling allowance per month',
            ),
        ),
        migrations.AddField(
            model_name='incentivekpisettings',
            name='ba_grooming',
            field=models.PositiveIntegerField(default=2000),
        ),
        migrations.AddField(
            model_name='incentivekpisettings',
            name='ba_mobile',
            field=models.PositiveIntegerField(default=1000),
        ),
        migrations.AddField(
            model_name='incentivekpisettings',
            name='ba_target_slab_90',
            field=models.PositiveIntegerField(
                default=2400,
                help_text='Target Ach incentive at ≥90%',
            ),
        ),
        migrations.AddField(
            model_name='incentivekpisettings',
            name='ba_target_slab_100',
            field=models.PositiveIntegerField(
                default=3000,
                help_text='Target Ach incentive at ≥100%',
            ),
        ),
        migrations.AddField(
            model_name='incentivekpisettings',
            name='ba_target_slab_110',
            field=models.PositiveIntegerField(
                default=3600,
                help_text='Target Ach incentive at ≥110%',
            ),
        ),
        migrations.AddField(
            model_name='incentivekpisettings',
            name='ba_discipline_min_days',
            field=models.PositiveIntegerField(
                default=20,
                help_text='Min check-in days in month to earn full discipline amount',
            ),
        ),
        migrations.AddField(
            model_name='incentivekpisettings',
            name='sup_salary',
            field=models.PositiveIntegerField(default=50000),
        ),
        migrations.AddField(
            model_name='incentivekpisettings',
            name='sup_fuel_da',
            field=models.PositiveIntegerField(default=30000),
        ),
        migrations.AddField(
            model_name='incentivekpisettings',
            name='sup_discipline',
            field=models.PositiveIntegerField(default=20000),
        ),
        migrations.AddField(
            model_name='incentivekpisettings',
            name='sup_mobile',
            field=models.PositiveIntegerField(default=1000),
        ),
        migrations.RemoveField(
            model_name='incentivekpisettings',
            name='base_pay',
        ),
        migrations.RemoveField(
            model_name='incentivekpisettings',
            name='conversion_target',
        ),
        migrations.RemoveField(
            model_name='incentivekpisettings',
            name='conversion_amount',
        ),
        migrations.RemoveField(
            model_name='incentivekpisettings',
            name='session_target',
        ),
        migrations.RemoveField(
            model_name='incentivekpisettings',
            name='session_amount',
        ),
        migrations.RemoveField(
            model_name='incentivekpisettings',
            name='sup_base_pay',
        ),
        migrations.RemoveField(
            model_name='incentivekpisettings',
            name='sup_conversion_target',
        ),
        migrations.RemoveField(
            model_name='incentivekpisettings',
            name='sup_conversion_amount',
        ),
        migrations.RemoveField(
            model_name='incentivekpisettings',
            name='sup_coverage_target',
        ),
        migrations.RemoveField(
            model_name='incentivekpisettings',
            name='sup_coverage_amount',
        ),
    ]
