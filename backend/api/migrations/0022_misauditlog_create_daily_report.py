from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0021_shiftassignment_check_out_gps'),
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
                ],
                db_index=True,
                max_length=40,
            ),
        ),
    ]
