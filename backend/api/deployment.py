"""Keep Ambassador.store / Deployed in sync with actual shift assignments."""

from __future__ import annotations

from django.utils import timezone

from .models import Ambassador, ShiftAssignment, Store


def reconcile_ambassador_deployments() -> dict:
    """
    Deployed + store only for BAs who currently have a scheduled shift.
    Anyone else still marked Deployed (or holding a store) is cleared → Certified.
    Home store is set from their soonest upcoming scheduled shift (else latest past).
    """
    assigned_ids = set(
        ShiftAssignment.objects.filter(
            ambassador_id__isnull=False,
            status__in=(ShiftAssignment.Status.SCHEDULED, ShiftAssignment.Status.CONFLICT),
        ).values_list('ambassador_id', flat=True)
    )

    today = timezone.localdate()
    future_pick: dict[int, tuple[int, object]] = {}
    past_pick: dict[int, tuple[int, object]] = {}
    shifts = (
        ShiftAssignment.objects.filter(
            ambassador_id__isnull=False,
            status__in=(ShiftAssignment.Status.SCHEDULED, ShiftAssignment.Status.CONFLICT),
        )
        .order_by('date', 'id')
        .values_list('ambassador_id', 'store_id', 'date')
    )
    for ba_id, store_id, d in shifts:
        if ba_id is None or store_id is None:
            continue
        if d >= today:
            if ba_id not in future_pick or d < future_pick[ba_id][1]:
                future_pick[ba_id] = (store_id, d)
        else:
            if ba_id not in past_pick or d > past_pick[ba_id][1]:
                past_pick[ba_id] = (store_id, d)

    home_store: dict[int, int] = {ba_id: store_id for ba_id, (store_id, _) in past_pick.items()}
    home_store.update({ba_id: store_id for ba_id, (store_id, _) in future_pick.items()})

    cleared = 0
    updated = 0
    touched_stores: set[int] = set()

    for ba in Ambassador.objects.all():
        if ba.id in assigned_ids:
            want_store = home_store.get(ba.id)
            changed = False
            if want_store and ba.store_id != want_store:
                if ba.store_id:
                    touched_stores.add(ba.store_id)
                ba.store_id = want_store
                touched_stores.add(want_store)
                changed = True
            if ba.status != Ambassador.Status.DEPLOYED:
                ba.status = Ambassador.Status.DEPLOYED
                if not ba.deployed_at:
                    ba.deployed_at = timezone.now()
                changed = True
            if changed:
                ba.save(update_fields=['store', 'status', 'deployed_at', 'updated_at'])
                updated += 1
            continue

        if ba.store_id or ba.status == Ambassador.Status.DEPLOYED:
            if ba.store_id:
                touched_stores.add(ba.store_id)
            ba.store = None
            if ba.status == Ambassador.Status.DEPLOYED:
                ba.status = Ambassador.Status.CERTIFIED
            ba.deployed_at = None
            ba.save(update_fields=['store', 'status', 'deployed_at', 'updated_at'])
            cleared += 1

    for sid in touched_stores:
        store = Store.objects.filter(pk=sid).first()
        if not store:
            continue
        store.bas = Ambassador.objects.filter(
            store_id=store.id,
            status=Ambassador.Status.DEPLOYED,
        ).count()
        store.save(update_fields=['bas', 'updated_at'])

    return {'cleared': cleared, 'updated': updated, 'assigned': len(assigned_ids)}
