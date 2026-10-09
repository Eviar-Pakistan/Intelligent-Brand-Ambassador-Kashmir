import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('api', '0019_userinterception'),
        ('core', '0003_user_type_mis'),
    ]

    operations = [
        migrations.CreateModel(
            name='MisAuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(choices=[('edit_daily_report', 'Edit daily report'), ('edit_attendance', 'Edit attendance'), ('edit_ambassador', 'Edit ambassador'), ('edit_store', 'Edit store'), ('edit_supervisor_stores', 'Edit supervisor stores'), ('swap_bas', 'Swap BAs')], db_index=True, max_length=40)),
                ('summary', models.CharField(max_length=500)),
                ('before_json', models.JSONField(blank=True, default=dict)),
                ('after_json', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('ambassador', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='mis_audit_logs', to='api.ambassador')),
                ('mis_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='mis_audit_logs', to=settings.AUTH_USER_MODEL)),
                ('report', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='mis_audit_logs', to='api.badailyreport')),
                ('store', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='mis_audit_logs', to='api.store')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
