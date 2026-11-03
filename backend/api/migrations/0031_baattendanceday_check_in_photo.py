from django.db import migrations, models

import api.models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0030_supervisorstorevisit'),
    ]

    operations = [
        migrations.AddField(
            model_name='baattendanceday',
            name='check_in_photo',
            field=models.ImageField(
                blank=True,
                help_text='Face-gated selfie captured at check-in (media/bas/).',
                null=True,
                upload_to=api.models.ba_check_in_photo_upload_to,
            ),
        ),
    ]
