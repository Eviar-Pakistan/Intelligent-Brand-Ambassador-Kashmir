from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('api', '0033_ambassador_nic'),
    ]

    operations = [
        migrations.CreateModel(
            name='AiOptimizationRun',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('week_start', models.DateField(db_index=True, unique=True)),
                ('week_end', models.DateField()),
                ('recommendations', models.JSONField(blank=True, default=list)),
                ('facts_snapshot', models.JSONField(blank=True, default=dict)),
                ('model_name', models.CharField(blank=True, default='', max_length=80)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                (
                    'created_by',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='ai_optimization_runs',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                'ordering': ['-week_start'],
            },
        ),
    ]
