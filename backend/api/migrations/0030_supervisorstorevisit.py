import django.db.models.deletion
from django.db import migrations, models

import api.models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0029_baattendanceday_gps'),
    ]

    operations = [
        migrations.CreateModel(
            name='SupervisorStoreVisit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('checked_in_at', models.DateTimeField(db_index=True)),
                ('checked_out_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('check_in_lat', models.FloatField()),
                ('check_in_lng', models.FloatField()),
                ('check_in_accuracy_m', models.FloatField(blank=True, null=True)),
                ('check_out_lat', models.FloatField(blank=True, null=True)),
                ('check_out_lng', models.FloatField(blank=True, null=True)),
                ('check_out_accuracy_m', models.FloatField(blank=True, null=True)),
                ('check_in_photo', models.ImageField(upload_to=api.models.supervisor_visit_photo_upload_to)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                (
                    'store',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='supervisor_visits',
                        to='api.store',
                    ),
                ),
                (
                    'supervisor',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='store_visits',
                        to='api.supervisor',
                    ),
                ),
            ],
            options={
                'ordering': ['-checked_in_at'],
            },
        ),
        migrations.AddIndex(
            model_name='supervisorstorevisit',
            index=models.Index(fields=['supervisor', 'checked_out_at'], name='api_ssv_sup_open_idx'),
        ),
        migrations.AddIndex(
            model_name='supervisorstorevisit',
            index=models.Index(
                fields=['supervisor', 'store', 'checked_in_at'],
                name='api_ssv_sup_store_idx',
            ),
        ),
        migrations.AddConstraint(
            model_name='supervisorstorevisit',
            constraint=models.UniqueConstraint(
                condition=models.Q(('checked_out_at__isnull', True)),
                fields=('supervisor',),
                name='one_open_supervisor_store_visit',
            ),
        ),
    ]
