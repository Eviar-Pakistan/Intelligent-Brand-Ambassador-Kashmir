from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0027_baweeklyoff'),
    ]

    operations = [
        migrations.AddField(
            model_name='ambassador',
            name='preferred_weekly_off',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Standing weekly off day (Mon…Sun). Auto-copied into each new week until the BA changes it.',
                max_length=3,
            ),
        ),
    ]
