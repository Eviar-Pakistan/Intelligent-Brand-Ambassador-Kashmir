from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0035_supervisorstorevisit_mis_manual'),
    ]

    operations = [
        migrations.AlterField(
            model_name='supervisorstorevisit',
            name='source',
            field=models.CharField(
                choices=[
                    ('app', 'Supervisor app'),
                    ('mis_manual', 'MIS manual'),
                    ('offline_sync', 'Offline sync'),
                ],
                db_index=True,
                default='app',
                max_length=20,
            ),
        ),
    ]
