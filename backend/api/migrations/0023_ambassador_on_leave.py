from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0022_misauditlog_create_daily_report'),
    ]

    operations = [
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
                    ('On leave', 'On leave'),
                ],
                default='Pending',
                max_length=20,
            ),
        ),
    ]
