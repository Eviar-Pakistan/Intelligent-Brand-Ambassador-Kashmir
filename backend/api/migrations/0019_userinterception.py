from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0018_shiftassignment_ba_attendance_type'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserInterception',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('ba_name', models.CharField(blank=True, default='', max_length=120)),
                ('store_name', models.CharField(blank=True, default='', max_length=200)),
                ('status', models.CharField(choices=[('Productive', 'Productive'), ('Trialist', 'Trialist'), ('Non-productive', 'Non-productive')], db_index=True, max_length=20)),
                ('name', models.CharField(max_length=120)),
                ('contact', models.CharField(blank=True, default='', max_length=40)),
                ('city_area', models.CharField(blank=True, default='', max_length=200)),
                ('previous_brand', models.CharField(blank=True, default='', max_length=120)),
                ('previous_sku', models.CharField(blank=True, default='', max_length=120)),
                ('current_sku', models.CharField(blank=True, default='', max_length=120)),
                ('feedback', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('ambassador', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='user_interceptions', to='api.ambassador')),
                ('store', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='user_interceptions', to='api.store')),
            ],
            options={
                'ordering': ['-created_at'],
                'indexes': [models.Index(fields=['ambassador', '-created_at'], name='api_userint_ambassa_8f2e1a_idx')],
            },
        ),
    ]
