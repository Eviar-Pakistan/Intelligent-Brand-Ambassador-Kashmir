from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0014_store_code_manual'),
    ]

    operations = [
        migrations.AddField(
            model_name='supervisor',
            name='login_password',
            field=models.CharField(blank=True, default='', max_length=128),
        ),
    ]
