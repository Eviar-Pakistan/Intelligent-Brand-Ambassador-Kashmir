# Add MIS user_type = 6

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_user_type_supervisor'),
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
                    (6, 'MIS'),
                ],
                db_index=True,
                default=4,
                help_text=(
                    '1=Head Office, 2=Admin, 3=Store Manager, 4=Brand Ambassador, '
                    '5=Supervisor, 6=MIS'
                ),
            ),
        ),
    ]
