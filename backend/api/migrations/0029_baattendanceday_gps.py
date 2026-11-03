from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0028_ambassador_preferred_weekly_off'),
    ]

    operations = [
        migrations.AddField(
            model_name='baattendanceday',
            name='check_in_lat',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='baattendanceday',
            name='check_in_lng',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='baattendanceday',
            name='check_out_lat',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='baattendanceday',
            name='check_out_lng',
            field=models.FloatField(blank=True, null=True),
        ),
    ]
