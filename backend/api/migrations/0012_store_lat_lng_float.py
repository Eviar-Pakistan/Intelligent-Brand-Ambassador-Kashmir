# Generated manually — store lat/lng as float (no 6-decimal cap)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0011_batarget_sales_kg_nullable'),
    ]

    operations = [
        migrations.AlterField(
            model_name='store',
            name='latitude',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='store',
            name='longitude',
            field=models.FloatField(blank=True, null=True),
        ),
    ]
