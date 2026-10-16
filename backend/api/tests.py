from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from core.models import User, UserType

from .models import Ambassador, BaDailyReport, BaTarget, MisAuditLog, Store


class RevampBasTests(TestCase):
    def setUp(self):
        self.mis = User.objects.create_user(
            username='misrevamp',
            email='mis-revamp@test.com',
            password='test-pass',
            user_type=UserType.MIS,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.mis)
        self.store = Store.objects.create(
            code='RV1',
            name='Revamp Store',
            city='Lahore',
            address='Test address',
        )
        self.old = Ambassador.objects.create(
            name='Leaving BA',
            status=Ambassador.Status.DEPLOYED,
            store=self.store,
        )
        self.new = Ambassador.objects.create(
            name='Incoming BA',
            status=Ambassador.Status.CERTIFIED,
        )

    def _post(self, confirm=False, **extra):
        body = {
            'oldAmbassadorId': self.old.id,
            'newAmbassadorId': self.new.id,
            'fromDate': '2026-10-01',
            'toDate': '2026-10-15',
            'confirm': confirm,
            **extra,
        }
        return self.client.post('/api/mis/revamp-bas/', body, format='json')

    def test_collision_aborts_and_moves_nothing(self):
        BaDailyReport.objects.create(
            ambassador=self.old,
            store=self.store,
            date=date(2026, 10, 12),
            sales_json={'pouch1L': 10},
        )
        BaDailyReport.objects.create(
            ambassador=self.new,
            store=self.store,
            date=date(2026, 10, 12),
            sales_json={'pouch1L': 3},
        )
        preview = self._post(confirm=False)
        self.assertEqual(preview.status_code, 200)
        self.assertFalse(preview.data['ok'])
        self.assertIn('colliding', preview.data['collisionMessage'].lower())

        blocked = self._post(confirm=True)
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(BaDailyReport.objects.filter(ambassador=self.old).count(), 1)
        self.assertEqual(BaDailyReport.objects.filter(ambassador=self.new).count(), 1)
        self.assertFalse(MisAuditLog.objects.filter(action=MisAuditLog.Action.REVAMP_BAS).exists())

    def test_revamp_moves_reports_and_targets_and_logs(self):
        BaDailyReport.objects.create(
            ambassador=self.old,
            store=self.store,
            date=date(2026, 10, 5),
            sales_json={'pouch1L': 12},
        )
        BaTarget.objects.create(
            ambassador=self.old,
            month='2026-10',
            sku='pouch1L',
            target_kg=100,
        )
        applied = self._post(confirm=True)
        self.assertEqual(applied.status_code, 200, applied.data)
        self.assertEqual(BaDailyReport.objects.filter(ambassador=self.old).count(), 0)
        self.assertEqual(BaDailyReport.objects.filter(ambassador=self.new).count(), 1)
        self.assertEqual(BaTarget.objects.filter(ambassador=self.new, month='2026-10').count(), 1)
        self.old.refresh_from_db()
        self.new.refresh_from_db()
        self.assertEqual(self.old.status, Ambassador.Status.ON_LEAVE)
        self.assertEqual(self.new.status, Ambassador.Status.DEPLOYED)
        self.assertEqual(self.new.store_id, self.store.id)
        log = MisAuditLog.objects.filter(action=MisAuditLog.Action.REVAMP_BAS).first()
        self.assertIsNotNone(log)
        self.assertIn('Revamped', log.summary)
