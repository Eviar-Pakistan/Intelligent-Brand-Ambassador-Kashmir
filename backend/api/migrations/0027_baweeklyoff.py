from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0026_ambassador_inactive_reason'),
    ]

    operations = [
        migrations.CreateModel(
            name='BaWeeklyOff',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('week_start', models.DateField(db_index=True, help_text='Monday of the week this off day applies to.')),
                (
                    'off_day',
                    models.CharField(
                        choices=[
                            ('Mon', 'Monday'),
                            ('Tue', 'Tuesday'),
                            ('Wed', 'Wednesday'),
                            ('Thu', 'Thursday'),
                            ('Fri', 'Friday'),
                            ('Sat', 'Saturday'),
                            ('Sun', 'Sunday'),
                        ],
                        max_length=3,
                    ),
                ),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                (
                    'ambassador',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='weekly_offs',
                        to='api.ambassador',
                    ),
                ),
            ],
            options={
                'ordering': ['-week_start', 'ambassador_id'],
            },
        ),
        migrations.AddConstraint(
            model_name='baweeklyoff',
            constraint=models.UniqueConstraint(
                fields=('ambassador', 'week_start'),
                name='uniq_ba_weekly_off_week',
            ),
        ),
        migrations.AddIndex(
            model_name='baweeklyoff',
            index=models.Index(fields=['week_start', 'off_day'], name='api_baweekl_week_st_idx'),
        ),
    ]
