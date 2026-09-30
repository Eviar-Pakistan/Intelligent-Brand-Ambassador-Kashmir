# Generated manually for BaTarget

from django.conf import settings
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('api', '0006_ba_daily_report'),
    ]

    operations = [
        migrations.CreateModel(
            name='BaTarget',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('month', models.CharField(db_index=True, help_text='Calendar month as YYYY-MM', max_length=7)),
                ('sku', models.CharField(blank=True, default='', max_length=80)),
                ('target_kg', models.FloatField(default=0)),
                ('sales_kg', models.FloatField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                (
                    'ambassador',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='targets',
                        to='api.ambassador',
                    ),
                ),
                (
                    'created_by',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='created_ba_targets',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                'ordering': ['-month', 'ambassador_id', 'sku'],
            },
        ),
        migrations.AddIndex(
            model_name='batarget',
            index=models.Index(fields=['ambassador', 'month'], name='api_batarge_ambassa_idx'),
        ),
        migrations.AddConstraint(
            model_name='batarget',
            constraint=models.UniqueConstraint(
                fields=('ambassador', 'month', 'sku'),
                name='uniq_ba_target_month_sku',
            ),
        ),
    ]
