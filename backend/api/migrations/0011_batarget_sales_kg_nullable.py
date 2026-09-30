# Generated manually — allow blank BA target sales (null = not filled)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0010_supervisor'),
    ]

    operations = [
        migrations.AlterField(
            model_name='batarget',
            name='sales_kg',
            field=models.FloatField(blank=True, default=None, null=True),
        ),
    ]
