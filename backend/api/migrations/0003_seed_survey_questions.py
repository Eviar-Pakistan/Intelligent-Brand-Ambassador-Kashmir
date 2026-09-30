from django.db import migrations


QUESTIONS = [
    {
        'order': 1,
        'text': 'Which cooking oil do you currently use at home?',
        'options': ['Kashmir Oil', 'Dalda', 'Sufi', 'Kisan', 'Other / Local brand'],
    },
    {
        'order': 2,
        'text': 'How often do you buy cooking oil?',
        'options': ['Weekly', 'Every 2 weeks', 'Monthly', 'Rarely'],
    },
    {
        'order': 3,
        'text': 'What pack size do you usually buy?',
        'options': ['1 litre', '5 kg', '16 kg tin', 'Other'],
    },
    {
        'order': 4,
        'text': 'What matters most when choosing cooking oil?',
        'options': ['Taste & aroma', 'Price', 'Brand trust', 'Health benefits'],
    },
    {
        'order': 5,
        'text': 'Would you consider switching to Kashmir Oil?',
        'options': ['Yes, definitely', 'Maybe', 'Not sure', 'No'],
    },
]


def seed_questions(apps, schema_editor):
    SurveyQuestion = apps.get_model('api', 'SurveyQuestion')
    for q in QUESTIONS:
        SurveyQuestion.objects.update_or_create(
            store=None,
            order=q['order'],
            defaults={
                'text': q['text'],
                'options': q['options'],
                'is_active': True,
            },
        )


def unseed_questions(apps, schema_editor):
    SurveyQuestion = apps.get_model('api', 'SurveyQuestion')
    SurveyQuestion.objects.filter(store__isnull=True, order__in=[1, 2, 3, 4, 5]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('api', '0002_initial'),
    ]

    operations = [
        migrations.RunPython(seed_questions, unseed_questions),
    ]
