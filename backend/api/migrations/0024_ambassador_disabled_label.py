from django.db import migrations, models


def forwards(apps, schema_editor):
    Ambassador = apps.get_model('api', 'Ambassador')
    Ambassador.objects.filter(status='On leave').update(status='Disabled')


def backwards(apps, schema_editor):
    Ambassador = apps.get_model('api', 'Ambassador')
    Ambassador.objects.filter(status='Disabled').update(status='On leave')


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0023_ambassador_on_leave'),
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
                    ('Disabled', 'Disabled'),
                ],
                default='Pending',
                max_length=20,
            ),
        ),
        migrations.RunPython(forwards, backwards),
    ]
