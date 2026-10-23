from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0025_misauditlog_revamp_bas'),
    ]

    operations = [
        migrations.AddField(
            model_name='ambassador',
            name='inactive_reason',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Reason when status is Disabled (e.g. Weekly Off, Sick Leave).',
                max_length=120,
            ),
        ),
    ]
