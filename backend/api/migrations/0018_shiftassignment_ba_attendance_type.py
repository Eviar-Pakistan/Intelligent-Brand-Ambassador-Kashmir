from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0017_ba_target_assigned_skus'),
    ]

    operations = [
        migrations.AddField(
            model_name='shiftassignment',
            name='ba_attendance_type',
            field=models.CharField(
                blank=True,
                default='',
                help_text="How the BA checked in today: 'store' or 'training' (blank until check-in).",
                max_length=16,
            ),
        ),
    ]
