from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0024_ambassador_disabled_label'),
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
                    ('swap_bas', 'Swap BAs'),
                    ('revamp_bas', 'Revamp BAs'),
                ],
                db_index=True,
                max_length=40,
            ),
        ),
    ]
