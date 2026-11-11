from django.db import migrations, models
import django.db.models.deletion


def backfill_answer_ambassador(apps, schema_editor):
    AssessmentAnswer = apps.get_model('api', 'AssessmentAnswer')
    AssessmentSession = apps.get_model('api', 'AssessmentSession')
    session_ba = dict(
        AssessmentSession.objects.values_list('id', 'ambassador_id')
    )
    to_update = []
    for answer in AssessmentAnswer.objects.all().only('id', 'session_id', 'ambassador_id'):
        ba_id = session_ba.get(answer.session_id)
        if ba_id and answer.ambassador_id != ba_id:
            answer.ambassador_id = ba_id
            to_update.append(answer)
    if to_update:
        AssessmentAnswer.objects.bulk_update(to_update, ['ambassador_id'], batch_size=500)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0031_baattendanceday_check_in_photo'),
    ]

    operations = [
        migrations.AddField(
            model_name='assessmentanswer',
            name='ambassador',
            field=models.ForeignKey(
                help_text='Denormalized from session for direct filtering/reporting.',
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='assessment_answers',
                to='api.ambassador',
            ),
        ),
        migrations.RunPython(backfill_answer_ambassador, noop_reverse),
        migrations.AlterField(
            model_name='assessmentanswer',
            name='ambassador',
            field=models.ForeignKey(
                help_text='Denormalized from session for direct filtering/reporting.',
                on_delete=django.db.models.deletion.CASCADE,
                related_name='assessment_answers',
                to='api.ambassador',
            ),
        ),
        migrations.AddIndex(
            model_name='assessmentanswer',
            index=models.Index(fields=['ambassador'], name='api_assessm_ambassa_idx'),
        ),
    ]
