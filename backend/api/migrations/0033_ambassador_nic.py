from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0032_assessmentanswer_ambassador'),
    ]

    operations = [
        migrations.AddField(
            model_name='ambassador',
            name='nic',
            field=models.CharField(
                blank=True,
                default='',
                help_text='National Identity Card number (optional).',
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='ambassador',
            name='status',
            field=models.CharField(
                choices=[
                    ('Pending', 'Pending'),
                    ('Training', 'Training'),
                    ('Assessed', 'Assessed'),
                    ('Certified', 'Certified'),
                    ('Rejected', 'Rejected'),
                    ('Deployed', 'Deployed'),
                    ('Disabled', 'Inactive'),
                ],
                default='Pending',
                max_length=20,
            ),
        ),
    ]
