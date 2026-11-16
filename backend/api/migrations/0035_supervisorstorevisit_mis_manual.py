from django.db import migrations, models

import api.models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0034_aioptimizationrun'),
    ]

    operations = [
        migrations.AlterField(
            model_name='misauditlog',
            name='action',
            field=models.CharField(
                choices=[
                    ('edit_daily_report', 'Edit daily report'),
                    ('create_daily_report', 'Create daily report'),
                    ('edit_attendance', 'Edit attendance'),
                    ('edit_ambassador', 'Edit ambassador'),
                    ('edit_store', 'Edit store'),
                    ('edit_supervisor_stores', 'Edit supervisor stores'),
                    ('create_supervisor_visit', 'Create supervisor visit'),
                    ('swap_bas', 'Swap BAs'),
                    ('revamp_bas', 'Remap BAs'),
                ],
                db_index=True,
                max_length=40,
            ),
        ),
        migrations.AddField(
            model_name='supervisorstorevisit',
            name='source',
            field=models.CharField(
                choices=[('app', 'Supervisor app'), ('mis_manual', 'MIS manual')],
                db_index=True,
                default='app',
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='supervisorstorevisit',
            name='checked_in_at',
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AlterField(
            model_name='supervisorstorevisit',
            name='check_in_lat',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='supervisorstorevisit',
            name='check_in_lng',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='supervisorstorevisit',
            name='check_in_photo',
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to=api.models.supervisor_visit_photo_upload_to,
            ),
        ),
        migrations.AlterModelOptions(
            name='supervisorstorevisit',
            options={'ordering': ['-checked_in_at', '-id']},
        ),
    ]
