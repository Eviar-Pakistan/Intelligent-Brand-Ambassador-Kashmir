from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0020_misauditlog'),
    ]

    operations = [
        migrations.AddField(
            model_name='shiftassignment',
            name='check_out_accuracy_m',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='shiftassignment',
            name='check_out_lat',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='shiftassignment',
            name='check_out_lng',
            field=models.FloatField(blank=True, null=True),
        ),
    ]
