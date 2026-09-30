# Add Supervisor user_type = 5

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='user_type',
            field=models.PositiveSmallIntegerField(
                choices=[
                    (1, 'Head Office'),
                    (2, 'Administrator'),
                    (3, 'Store Manager'),
                    (4, 'Brand Ambassador'),
                    (5, 'Supervisor'),
                ],
                db_index=True,
                default=4,
                help_text='1=Head Office, 2=Admin, 3=Store Manager, 4=Brand Ambassador, 5=Supervisor',
            ),
        ),
    ]
