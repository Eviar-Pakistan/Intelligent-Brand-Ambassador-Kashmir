"""BA invite-token endpoints for today's shift check-in / check-out."""

from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import (
    Ambassador,
    AmbassadorComplaint,
    BaAttendanceDay,
    BaDailyReport,
    ShiftAssignment,
    Store,
    UserInterception,
)
from .serializers import AmbassadorComplaintSerializer


DAY_KEYS = ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')
_SHIFT_TIME_RE = re.compile(r'(\d{1,2}):(\d{2})\s*(AM|PM)', re.IGNORECASE)


def _day_key(d: date) -> str:
    return DAY_KEYS[d.weekday()]


def _parse_clock_token(hour: str, minute: str, ampm: str) -> time:
    h = int(hour) % 12
    if ampm.upper() == 'PM':
        h += 12
    return time(h, int(minute))


def _parse_shift_bounds(label: str) -> tuple[time | None, time | None]:
    """Parse '08:00 AM – 08:00 PM' → (start, end)."""
    parts = _SHIFT_TIME_RE.findall(label or '')
    if not parts:
        return None, None
    start = _parse_clock_token(*parts[0])
    end = _parse_clock_token(*parts[1]) if len(parts) >= 2 else None
    return start, end


def _attendance_status_for_day(
    *,
    day: date,
    today: date,
    now: datetime,
    checked_in,
    shift_label: str,
    has_report: bool = False,
) -> str:
    """
    Present (from today onward) = BA submitted the daily report after checkout.
    Legacy (days before today): keep prior Present-on-check-in so existing data stays unchanged.
    Scheduled = future day, or today before shift start with no Present yet.
    Absent = no Present after the applicable window.
    """
    if has_report:
        return 'Present'
    # Preserve historical attendance display (check-in counted as Present).
    if day < today and checked_in:
        return 'Present'
    if day > today:
        return 'Scheduled'
    if day < today:
        return 'Absent'

    # Today — don't mark Absent until the shift window has begun.
    start, _end = _parse_shift_bounds(shift_label)
    if start is not None:
        start_dt = timezone.make_aware(
            datetime.combine(day, start),
            timezone.get_current_timezone(),
        )
        if now < start_dt:
            return 'Scheduled'
    return 'Absent'


def upsert_attendance_from_shift(shift: ShiftAssignment) -> BaAttendanceDay | None:
    """
    Persist today's clocks onto BaAttendanceDay so history survives month-shift roll.
    Uses the local calendar date of checked_in_at (or shift.date as fallback).
    """
    if not shift.ambassador_id:
        return None
    if not shift.checked_in_at and not shift.checked_out_at:
        return None
    if shift.checked_in_at:
        day = timezone.localtime(shift.checked_in_at).date()
    else:
        day = timezone.localtime(shift.checked_out_at).date() if shift.checked_out_at else shift.date
    row, _ = BaAttendanceDay.objects.update_or_create(
        ambassador_id=shift.ambassador_id,
        date=day,
        defaults={
            'store_id': shift.store_id,
            'shift_id': shift.id,
            'day_key': _day_key(day),
            'shift_label': shift.shift_label or '',
            'checked_in_at': shift.checked_in_at,
            'checked_out_at': shift.checked_out_at,
            'early_leave_reason': shift.early_leave_reason or '',
        },
    )
    return row


def build_attendance_chart(ambassador: Ambassador, *, days: int = 30) -> dict:
    """Last N calendar days for one BA: Present / Scheduled / Absent."""
    days = max(1, min(int(days or 30), 90))
    now = timezone.localtime()
    today = now.date()
    start = today - timedelta(days=days - 1)

    # Capture live clocks in case roll has not yet written history.
    live = _today_shift_for(ambassador)
    if live and (live.checked_in_at or live.checked_out_at):
        upsert_attendance_from_shift(live)

    logs = {
        row.date: row
        for row in BaAttendanceDay.objects.filter(
            ambassador=ambassador,
            date__gte=start,
            date__lte=today,
        ).select_related('store')
    }

    report_dates = set(
        BaDailyReport.objects.filter(
            ambassador=ambassador,
            date__gte=start,
            date__lte=today,
        ).values_list('date', flat=True)
    )

    # Cover month-level rows whose date is the 1st (may be before `start`).
    month_start = date(start.year, start.month, 1)
    shifts = list(
        ShiftAssignment.objects.filter(
            ambassador=ambassador,
            date__gte=month_start,
            date__lte=today,
            status__in=(
                ShiftAssignment.Status.SCHEDULED,
                ShiftAssignment.Status.CONFLICT,
            ),
        )
        .select_related('store')
        .order_by('date', 'id')
    )

    def covering_shift(d: date) -> ShiftAssignment | None:
        exact = [s for s in shifts if s.date == d]
        if exact:
            return exact[0]
        month = [s for s in shifts if s.date.year == d.year and s.date.month == d.month]
        if month:
            return sorted(month, key=lambda s: (s.date, s.id))[0]
        return None

    fallback_store = ambassador.store
    fallback_label = '9:00 AM – 6:00 PM'
    if shifts:
        fallback_label = shifts[-1].shift_label or fallback_label

    results = []
    present_count = 0
    absent_count = 0
    for i in range(days):
        d = today - timedelta(days=i)
        log = logs.get(d)
        cover = covering_shift(d)

        store = None
        store_name = ''
        city = ''
        shift_label = fallback_label
        checked_in = None
        checked_out = None

        if log:
            store = log.store
            shift_label = log.shift_label or (cover.shift_label if cover else fallback_label)
            checked_in = log.checked_in_at
            checked_out = log.checked_out_at
        elif cover:
            store = cover.store
            shift_label = cover.shift_label or fallback_label
            # Live today clocks still only on the shift row.
            if d == today and cover.checked_in_at:
                cin_day = timezone.localtime(cover.checked_in_at).date()
                if cin_day == today:
                    checked_in = cover.checked_in_at
                    checked_out = cover.checked_out_at
        elif fallback_store:
            store = fallback_store

        if store:
            store_name = store.name
            city = store.city or ''

        day_status = _attendance_status_for_day(
            day=d,
            today=today,
            now=now,
            checked_in=checked_in,
            shift_label=shift_label,
            has_report=d in report_dates,
        )
        if day_status == 'Present':
            present_count += 1
        elif day_status == 'Absent':
            absent_count += 1

        results.append(
            {
                'date': d.isoformat(),
                'day': _day_key(d),
                'storeId': store.id if store else None,
                'storeName': store_name,
                'city': city,
                'shift': shift_label,
                'checkedInAt': checked_in.isoformat() if checked_in else None,
                'checkedOutAt': checked_out.isoformat() if checked_out else None,
                'status': day_status,
            }
        )

    return {
        'days': days,
        'present': present_count,
        'absent': absent_count,
        'results': results,
    }


def _ambassador_from_token(token: str | None) -> Ambassador | None:
    token = (token or '').strip()
    if not token:
        return None
    return Ambassador.objects.filter(invite_token=token).first()


def _pick_from_qs(qs):
    """Prefer an active (checked-in, not out) shift, else earliest not checked out, else any."""
    active = qs.filter(checked_in_at__isnull=False, checked_out_at__isnull=True).first()
    if active:
        return active
    pending = qs.filter(checked_out_at__isnull=True).first()
    if pending:
        return pending
    return qs.first()


def _today_shift_for(ambassador: Ambassador) -> ShiftAssignment | None:
    """Resolve today's shift without mutating older rows (clone if needed)."""
    from .shifts import ensure_shift_for_day

    return ensure_shift_for_day(ambassador, timezone.localdate())


def _ensure_today_shift(ambassador: Ambassador) -> ShiftAssignment | None:
    """
    Ensure today + tomorrow shifts exist so the BA can see the next day in advance.
    Never deletes or clears clocks on older shifts.
    """
    from .shifts import ensure_today_and_tomorrow

    return ensure_today_and_tomorrow(ambassador)


def _upcoming_rows(ambassador: Ambassador) -> list[dict]:
    """Only the next calendar day after today (no past days, not today)."""
    today = timezone.localdate()
    upcoming = (
        ShiftAssignment.objects.filter(
            ambassador=ambassador,
            date__gt=today,
            status__in=(
                ShiftAssignment.Status.SCHEDULED,
                ShiftAssignment.Status.CONFLICT,
            ),
        )
        .select_related('store')
        .order_by('date', 'shift_label', 'id')[:1]
    )
    return [
        {
            'id': str(s.id),
            'date': s.date.strftime('%d %b'),
            'dateIso': s.date.isoformat(),
            'day': s.day_key,
            'shift': s.shift_label,
            'storeId': s.store_id,
            'storeName': s.store.name,
            'city': s.store.city,
            'storeLabel': f'#{s.store_id} {s.store.name}',
            'checkedIn': bool(s.checked_in_at),
            'checkedOut': bool(s.checked_out_at),
            'isToday': False,
        }
        for s in upcoming
    ]


def _store_coords(store: Store | None) -> tuple:
    if not store:
        return None, None
    try:
        lat = float(store.latitude) if store.latitude is not None else None
    except (TypeError, ValueError):
        lat = None
    try:
        lng = float(store.longitude) if store.longitude is not None else None
    except (TypeError, ValueError):
        lng = None
    return lat, lng


def serialize_ba_shift(shift: ShiftAssignment | None, ambassador: Ambassador) -> dict:
    initials = ''.join(p[0] for p in (ambassador.name or 'BA').split() if p)[:2].upper() or 'BA'
    upcoming_rows = _upcoming_rows(ambassador)
    if not shift:
        store = ambassador.store
        store_lat, store_lng = _store_coords(store)
        if not store:
            message = 'Not assigned to a store yet. Location appears after Head Office assigns you.'
        elif not upcoming_rows:
            message = 'No shift scheduled for today.'
        else:
            message = 'No shift today — see upcoming shifts below.'
        return {
            'shift': None,
            'has_shift': False,
            'message': message,
            'ambassador': {
                'id': ambassador.id,
                'name': ambassador.name,
                'initials': initials,
                'status': ambassador.status,
                'store_id': store.id if store else None,
                'store_name': store.name if store else None,
                'city': store.city if store else (ambassador.city or None),
                'storeLat': store_lat,
                'storeLng': store_lng,
            },
            'upcoming': upcoming_rows,
        }

    store = shift.store
    store_lat, store_lng = _store_coords(store)
    return {
        'has_shift': True,
        'message': None,
        'ambassador': {
            'id': ambassador.id,
            'name': ambassador.name,
            'initials': initials,
            'status': ambassador.status,
            'store_id': store.id,
            'store_name': store.name,
            'city': store.city,
            'storeLat': store_lat,
            'storeLng': store_lng,
        },
        'shift': {
            'id': str(shift.id),
            'date': shift.date.isoformat(),
            'day': shift.day_key,
            'shift': shift.shift_label,
            'storeId': store.id,
            'storeName': store.name,
            'city': store.city,
            'storeLabel': f'#{store.id} {store.name}, {store.city}'.strip(', '),
            'peakRecommended': shift.peak_recommended,
            'status': shift.status,
            'checkedIn': bool(shift.checked_in_at),
            'checkedOut': bool(shift.checked_out_at),
            'isLive': shift.is_checked_in,
            'checkedInAt': shift.checked_in_at.isoformat() if shift.checked_in_at else None,
            'checkedOutAt': shift.checked_out_at.isoformat() if shift.checked_out_at else None,
            'earlyLeaveReason': shift.early_leave_reason or None,
            'isEarlyCheckout': bool(shift.early_leave_reason),
            'baAttendanceType': (shift.ba_attendance_type or '') or None,
            'checkInLat': shift.check_in_lat,
            'checkInLng': shift.check_in_lng,
            'storeLat': store_lat,
            'storeLng': store_lng,
        },
        'upcoming': upcoming_rows,
    }


@api_view(['GET'])
@permission_classes([AllowAny])
def ba_today_shift(request):
    """GET /api/ba/today-shift/?token=… — also pre-creates tomorrow's shift."""
    ambassador = _ambassador_from_token(request.query_params.get('token'))
    if not ambassador:
        return Response({'detail': 'Invalid or missing invite token.'}, status=status.HTTP_404_NOT_FOUND)
    shift = _ensure_today_shift(ambassador)
    # Reload in case ensure updated ambassador.store / status
    ambassador.refresh_from_db()
    return Response(serialize_ba_shift(shift, ambassador))


@api_view(['POST'])
@permission_classes([AllowAny])
def ba_submit_complaint(request):
    """
    Submit a customer / BA / insights report using the BA's invite token.

    Body (JSON or multipart):
      token, store_id, kind (customer|ba|insights),
      details|complaint, subject?, category?,
      product_category?, brand?, sku?,
      customer_name?, customer_phone?, image?
    """
    ambassador = _ambassador_from_token(request.data.get('token'))
    if not ambassador:
        return Response({'detail': 'Invalid or missing invite token.'}, status=status.HTTP_404_NOT_FOUND)

    kind = str(request.data.get('kind') or AmbassadorComplaint.Kind.BA).strip().lower()
    if kind not in {c.value for c in AmbassadorComplaint.Kind}:
        return Response({'detail': 'kind must be customer, ba, or insights.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        store_id = int(request.data.get('store_id'))
    except (TypeError, ValueError):
        # Insights may omit store — fall back to assigned home store.
        if kind == AmbassadorComplaint.Kind.INSIGHTS and ambassador.store_id:
            store_id = ambassador.store_id
        else:
            return Response({'detail': 'A store is required.'}, status=status.HTTP_400_BAD_REQUEST)

    details = str(
        request.data.get('details')
        or request.data.get('complaint')
        or ''
    ).strip()
    if not details:
        return Response({'detail': 'Please describe the complaint or insight.'}, status=status.HTTP_400_BAD_REQUEST)
    if len(details) > 2000:
        return Response({'detail': 'Details must be 2,000 characters or fewer.'}, status=status.HTTP_400_BAD_REQUEST)

    assigned_store_ids = set(
        ShiftAssignment.objects.filter(ambassador=ambassador).values_list('store_id', flat=True)
    )
    if ambassador.store_id:
        assigned_store_ids.add(ambassador.store_id)
    if store_id not in assigned_store_ids:
        return Response(
            {'detail': 'You can submit complaints only for your assigned stores.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    store = Store.objects.filter(pk=store_id).first()
    if not store:
        return Response({'detail': 'Store not found.'}, status=status.HTTP_404_NOT_FOUND)

    subject = str(request.data.get('subject') or '').strip()[:255]
    category = str(request.data.get('category') or '').strip()[:80]
    if kind == AmbassadorComplaint.Kind.CUSTOMER and not category:
        category = 'Product stock'
    if kind == AmbassadorComplaint.Kind.INSIGHTS and not category:
        category = 'Other'

    image = request.FILES.get('image')

    complaint_row = AmbassadorComplaint.objects.create(
        kind=kind,
        ambassador=ambassador,
        store=store,
        category=category,
        subject=subject,
        complaint=details,
        product_category=str(request.data.get('product_category') or request.data.get('productCategory') or '').strip()[:80],
        brand=str(request.data.get('brand') or '').strip()[:80],
        sku=str(request.data.get('sku') or '').strip()[:80],
        customer_name=str(request.data.get('customer_name') or request.data.get('customerName') or '').strip()[:120],
        customer_phone=str(request.data.get('customer_phone') or request.data.get('customerPhone') or '').strip()[:30],
        image=image if image else None,
    )
    from .serializers import AmbassadorComplaintSerializer

    return Response(
        AmbassadorComplaintSerializer(complaint_row, context={'request': request}).data,
        status=status.HTTP_201_CREATED,
    )

@api_view(['POST'])
@permission_classes([AllowAny])
def ba_submit_user_interception(request):
    """
    POST /api/ba/user-interceptions/
    Body: {
      token,
      status: 'Productive'|'Trialist'|'Non-productive',
      name,
      contact?, city_area?, previous_brand?, previous_sku?, current_sku?, feedback?,
      store_id?
    }
    """
    ambassador = _ambassador_from_token(request.data.get('token'))
    if not ambassador:
        return Response({'detail': 'Invalid or missing invite token.'}, status=status.HTTP_404_NOT_FOUND)

    status_raw = str(request.data.get('status') or request.data.get('interception_type') or '').strip()
    allowed = {c.value for c in UserInterception.Status}
    if status_raw not in allowed:
        return Response(
            {'detail': 'status must be Productive, Trialist, or Non-productive.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    name = str(request.data.get('name') or '').strip()[:120]
    if not name:
        return Response({'detail': 'Name is required.'}, status=status.HTTP_400_BAD_REQUEST)

    contact = str(request.data.get('contact') or '').strip()[:40]
    city_area = str(request.data.get('city_area') or request.data.get('cityArea') or '').strip()[:200]
    previous_brand = str(
        request.data.get('previous_brand') or request.data.get('previousBrand') or ''
    ).strip()[:120]
    previous_sku = str(
        request.data.get('previous_sku') or request.data.get('previousSku') or ''
    ).strip()[:120]
    current_sku = str(
        request.data.get('current_sku') or request.data.get('currentSku') or ''
    ).strip()[:120]
    feedback = str(request.data.get('feedback') or '').strip()

    # All types require shopper fields. Current SKU only for Productive / Trialist.
    if status_raw == UserInterception.Status.NON_PRODUCTIVE:
        current_sku = ''

    missing = []
    if not contact:
        missing.append('contact')
    if not city_area:
        missing.append('city_area')
    if not previous_brand:
        missing.append('previous_brand')
    if not previous_sku:
        missing.append('previous_sku')
    if status_raw != UserInterception.Status.NON_PRODUCTIVE and not current_sku:
        missing.append('current_sku')
    if not feedback:
        missing.append('feedback')
    if missing:
        return Response(
            {'detail': f'Required for {status_raw}: {", ".join(missing)}.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    store = None
    store_id_raw = request.data.get('store_id') or request.data.get('storeId')
    if store_id_raw is not None and store_id_raw != '':
        try:
            store = Store.objects.filter(pk=int(store_id_raw)).first()
        except (TypeError, ValueError):
            store = None
    if not store and ambassador.store_id:
        store = ambassador.store

    row = UserInterception.objects.create(
        ambassador=ambassador,
        store=store,
        ba_name=ambassador.name or '',
        store_name=store.name if store else '',
        status=status_raw,
        name=name,
        contact=contact,
        city_area=city_area,
        previous_brand=previous_brand,
        previous_sku=previous_sku,
        current_sku=current_sku,
        feedback=feedback,
    )
    return Response(
        {
            'id': row.id,
            'status': row.status,
            'name': row.name,
            'baName': row.ba_name,
            'storeName': row.store_name,
            'storeId': row.store_id,
            'ambassadorId': row.ambassador_id,
            'createdAt': row.created_at.isoformat(),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def ba_check_in(request):
    """
    POST /api/ba/check-in/
    Body: { token, attendance_type?: 'store'|'training', latitude?, longitude?, accuracy? }
    """
    ambassador = _ambassador_from_token(request.data.get('token'))
    if not ambassador:
        return Response({'detail': 'Invalid or missing invite token.'}, status=status.HTTP_404_NOT_FOUND)

    raw_type = str(
        request.data.get('attendance_type')
        or request.data.get('attendanceType')
        or request.data.get('ba_attendance_type')
        or 'store'
    ).strip().lower()
    attendance_type = raw_type if raw_type in ('store', 'training') else 'store'

    shift = _ensure_today_shift(ambassador)
    if not shift:
        return Response(
            {'detail': 'No shift scheduled for today.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if shift.checked_out_at:
        return Response(
            {'detail': 'This shift was already ended.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if shift.checked_in_at:
        return Response(serialize_ba_shift(shift, ambassador))

    lat = request.data.get('latitude')
    lng = request.data.get('longitude')
    accuracy = request.data.get('accuracy')

    def _f(v):
        if v is None or v == '':
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    shift.checked_in_at = timezone.now()
    shift.check_in_lat = _f(lat)
    shift.check_in_lng = _f(lng)
    shift.check_in_accuracy_m = _f(accuracy)
    shift.ba_attendance_type = attendance_type
    shift.save(
        update_fields=[
            'checked_in_at',
            'check_in_lat',
            'check_in_lng',
            'check_in_accuracy_m',
            'ba_attendance_type',
            'updated_at',
        ]
    )

    # Training day check-in: reflect on HO ambassadors list (temporary until checkout).
    if attendance_type == 'training' and ambassador.status == Ambassador.Status.DEPLOYED:
        ambassador.status = Ambassador.Status.TRAINING
        ambassador.save(update_fields=['status', 'updated_at'])

    upsert_attendance_from_shift(shift)
    ambassador.refresh_from_db()
    return Response(serialize_ba_shift(shift, ambassador))


@api_view(['POST'])
@permission_classes([AllowAny])
def ba_check_out(request):
    """POST /api/ba/check-out/  Body: { token, early_leave_reason? }"""
    ambassador = _ambassador_from_token(request.data.get('token'))
    if not ambassador:
        return Response({'detail': 'Invalid or missing invite token.'}, status=status.HTTP_404_NOT_FOUND)

    # Prefer an open check-in (may still be yesterday's row if they crossed midnight).
    shift = (
        ShiftAssignment.objects.filter(
            ambassador=ambassador,
            checked_in_at__isnull=False,
            checked_out_at__isnull=True,
        )
        .select_related('store', 'ambassador')
        .order_by('-checked_in_at', '-id')
        .first()
    )
    if not shift:
        shift = _ensure_today_shift(ambassador)
    if not shift:
        return Response({'detail': 'No shift scheduled for today.'}, status=status.HTTP_400_BAD_REQUEST)
    if not shift.checked_in_at:
        return Response({'detail': 'Check in before ending the shift.'}, status=status.HTTP_400_BAD_REQUEST)
    if shift.checked_out_at:
        return Response(serialize_ba_shift(shift, ambassador))

    reason = str(
        request.data.get('early_leave_reason')
        or request.data.get('earlyLeaveReason')
        or ''
    ).strip()
    if len(reason) > 2000:
        return Response(
            {'detail': 'Early leave reason must be 2,000 characters or fewer.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    shift.checked_out_at = timezone.now()
    update_fields = ['checked_out_at', 'updated_at']
    if reason:
        shift.early_leave_reason = reason
        update_fields.append('early_leave_reason')
    shift.save(update_fields=update_fields)

    # Restore Deployed after training-day checkout (HO list).
    if (shift.ba_attendance_type or '').strip().lower() == 'training':
        if ambassador.status == Ambassador.Status.TRAINING and ambassador.store_id:
            ambassador.status = Ambassador.Status.DEPLOYED
            ambassador.save(update_fields=['status', 'updated_at'])

    upsert_attendance_from_shift(shift)
    ambassador.refresh_from_db()
    return Response(serialize_ba_shift(shift, ambassador))


@api_view(['POST'])
@permission_classes([AllowAny])
def ba_submit_daily_report(request):
    """
    POST /api/ba/daily-report/
    Body: {
      token,
      stock?: object,
      sales?: object,
      other_brands?: list,
      source?: 'excel'|'manual',
      file_name?: string,
      store_id?: number,
      early_leave_reason?: string,
    }
    Stamps checked_out_at on the open check-in when the final report is submitted,
    then saves stock / sales / other brands and marks Present.
    """
    ambassador = _ambassador_from_token(request.data.get('token'))
    if not ambassador:
        return Response({'detail': 'Invalid or missing invite token.'}, status=status.HTTP_404_NOT_FOUND)

    from .sales_report import normalize_sales_json

    stock = request.data.get('stock') or {}
    sales = request.data.get('sales') or {}
    other_brands = request.data.get('other_brands') or request.data.get('otherBrands') or []
    if not isinstance(stock, dict):
        stock = {}
    if not isinstance(sales, dict):
        sales = {}
    else:
        sales = normalize_sales_json(sales)
    if not isinstance(other_brands, list):
        other_brands = []

    if not stock and not sales and not other_brands:
        return Response(
            {'detail': 'Report must include stock, sales, or other brand data.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    source = str(request.data.get('source') or BaDailyReport.Source.MANUAL).strip().lower()
    if source not in {c.value for c in BaDailyReport.Source}:
        source = BaDailyReport.Source.MANUAL
    file_name = str(request.data.get('file_name') or request.data.get('fileName') or '').strip()[:255]
    early_reason = str(
        request.data.get('early_leave_reason')
        or request.data.get('earlyLeaveReason')
        or ''
    ).strip()
    if len(early_reason) > 2000:
        return Response(
            {'detail': 'Early leave reason must be 2,000 characters or fewer.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Prefer an open check-in — final report submit stamps checkout time.
    shift = (
        ShiftAssignment.objects.filter(
            ambassador=ambassador,
            checked_in_at__isnull=False,
            checked_out_at__isnull=True,
        )
        .select_related('store')
        .order_by('-checked_in_at', '-id')
        .first()
    )
    if not shift:
        # Re-submit / already checked out on a prior attempt.
        shift = (
            ShiftAssignment.objects.filter(
                ambassador=ambassador,
                checked_in_at__isnull=False,
                checked_out_at__isnull=False,
            )
            .select_related('store')
            .order_by('-checked_out_at', '-id')
            .first()
        )
    if not shift:
        shift = _ensure_today_shift(ambassador)
    if not shift:
        return Response({'detail': 'No shift scheduled for today.'}, status=status.HTTP_400_BAD_REQUEST)
    if not shift.checked_in_at:
        return Response(
            {'detail': 'Check in before submitting the daily report.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Checkout clock is set when the BA submits the last report (not at stock step).
    if not shift.checked_out_at:
        shift.checked_out_at = timezone.now()
        update_fields = ['checked_out_at', 'updated_at']
        if early_reason:
            shift.early_leave_reason = early_reason
            update_fields.append('early_leave_reason')
        shift.save(update_fields=update_fields)
        upsert_attendance_from_shift(shift)
    elif early_reason and not (shift.early_leave_reason or '').strip():
        shift.early_leave_reason = early_reason
        shift.save(update_fields=['early_leave_reason', 'updated_at'])
        upsert_attendance_from_shift(shift)

    store = None
    store_id_raw = request.data.get('store_id') or request.data.get('storeId')
    if store_id_raw is not None and store_id_raw != '':
        try:
            store = Store.objects.filter(pk=int(store_id_raw)).first()
        except (TypeError, ValueError):
            store = None
    if not store and shift:
        store = shift.store
    if not store and ambassador.store_id:
        store = ambassador.store

    # Use the calendar day of checkout so Present lands on the worked day.
    report_date = timezone.localtime(shift.checked_out_at).date()

    # Upsert one field report per BA + today's shift (or BA + calendar date).
    existing = None
    if shift:
        existing = BaDailyReport.objects.filter(ambassador=ambassador, shift=shift).first()
    if not existing:
        existing = BaDailyReport.objects.filter(
            ambassador=ambassador,
            date=report_date,
        ).first()

    if existing:
        existing.store = store
        existing.shift = shift or existing.shift
        existing.date = report_date
        existing.stock_json = stock
        existing.sales_json = sales
        existing.other_brands_json = other_brands
        existing.source = source
        if file_name:
            existing.file_name = file_name
        existing.save()
        report = existing
    else:
        report = BaDailyReport.objects.create(
            ambassador=ambassador,
            store=store,
            shift=shift,
            date=report_date,
            stock_json=stock,
            sales_json=sales,
            other_brands_json=other_brands,
            source=source,
            file_name=file_name,
        )

    # Report + checkout clocks mark Present for the day.
    upsert_attendance_from_shift(shift)

    return Response(
        {
            'id': report.id,
            'date': report.date.isoformat(),
            'source': report.source,
            'fileName': report.file_name or None,
            'shiftId': str(report.shift_id) if report.shift_id else None,
            'storeId': report.store_id,
        },
        status=status.HTTP_201_CREATED,
    )


def _serialize_daily_activity(shift: ShiftAssignment | None, field: BaDailyReport | None) -> dict:
    """One combined daily activity row for HO Daily Reports."""
    date_val = None
    day = ''
    shift_label = ''
    store_id = None
    store_name = ''
    city = ''
    checked_in = None
    checked_out = None
    early_reason = ''
    row_id = ''

    if shift:
        date_val = shift.date
        day = shift.day_key
        shift_label = shift.shift_label
        store_id = shift.store_id
        store_name = shift.store.name if shift.store_id else ''
        city = shift.store.city if shift.store_id else ''
        checked_in = shift.checked_in_at.isoformat() if shift.checked_in_at else None
        checked_out = shift.checked_out_at.isoformat() if shift.checked_out_at else None
        early_reason = shift.early_leave_reason or ''
        row_id = f'shift-{shift.id}'
    if field:
        if not date_val:
            date_val = field.date
        if not store_id and field.store_id:
            store_id = field.store_id
            store_name = field.store.name if field.store_id else store_name
            city = field.store.city if field.store_id else city
        if not row_id:
            row_id = f'field-{field.id}'
        else:
            row_id = f'combined-{shift.id if shift else field.id}'

    return {
        'id': row_id,
        'date': date_val.isoformat() if date_val else None,
        'day': day,
        'shift': shift_label,
        'storeId': store_id,
        'storeName': store_name,
        'city': city,
        'checkedInAt': checked_in,
        'checkedOutAt': checked_out,
        'earlyLeaveReason': early_reason or None,
        'isEarlyCheckout': bool(early_reason),
        'hasFieldReport': field is not None,
        'fieldReportId': field.id if field else None,
        'source': field.source if field else None,
        'fileName': field.file_name or None if field else None,
        'stock': field.stock_json if field else None,
        'sales': field.sales_json if field else None,
        'otherBrands': field.other_brands_json if field else None,
        'submittedAt': (
            (field.created_at if field else None) or (shift.checked_out_at if shift else None)
        ),
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def daily_reports(request):
    """
    GET /api/daily-reports/
    All BA check-outs + end-of-day field reports, grouped by ambassador.
    Optional ?early=1 to only include early check-outs.
    """
    early_only = str(request.query_params.get('early', '')).lower() in ('1', 'true', 'yes')
    ambassador_id = request.query_params.get('ambassador')
    return Response(_build_daily_reports_payload(early_only=early_only, ambassador_id=ambassador_id))


def _build_daily_reports_payload(*, early_only: bool = False, ambassador_id: str | None = None) -> dict:
    shifts_qs = (
        ShiftAssignment.objects.filter(
            checked_out_at__isnull=False,
            ambassador_id__isnull=False,
        )
        .select_related('ambassador', 'store')
        .order_by('-checked_out_at', '-date')
    )
    if early_only:
        shifts_qs = shifts_qs.filter(early_leave_reason__gt='')
    if ambassador_id:
        shifts_qs = shifts_qs.filter(ambassador_id=ambassador_id)

    fields_qs = BaDailyReport.objects.select_related('ambassador', 'store', 'shift').order_by(
        '-date', '-updated_at'
    )
    if ambassador_id:
        fields_qs = fields_qs.filter(ambassador_id=ambassador_id)

    field_by_shift: dict[int, BaDailyReport] = {}
    field_by_ba_date: dict[tuple[int, date], BaDailyReport] = {}
    for fr in fields_qs:
        if fr.shift_id:
            field_by_shift[fr.shift_id] = fr
        key = (fr.ambassador_id, fr.date)
        if key not in field_by_ba_date:
            field_by_ba_date[key] = fr

    used_field_ids: set[int] = set()
    by_ba: dict[int, dict] = {}

    def ensure_ba(ba: Ambassador, fallback_city: str = '') -> dict:
        entry = by_ba.get(ba.id)
        if not entry:
            entry = {
                'baId': str(ba.id),
                'baName': ba.name,
                'baCode': ba.code or '',
                'city': ba.city or fallback_city,
                'reportCount': 0,
                'earlyCount': 0,
                'fieldReportCount': 0,
                'latestAt': None,
                'reports': [],
            }
            by_ba[ba.id] = entry
        return entry

    for shift in shifts_qs:
        ba = shift.ambassador
        if not ba:
            continue
        field = field_by_shift.get(shift.id)
        if not field:
            field = field_by_ba_date.get((ba.id, shift.date))
            if field and field.shift_id and field.shift_id != shift.id:
                field = None
        if field:
            used_field_ids.add(field.id)

        row = _serialize_daily_activity(shift, field)
        submitted = row['submittedAt']
        if hasattr(submitted, 'isoformat'):
            row['submittedAt'] = submitted.isoformat()

        entry = ensure_ba(ba, row.get('city') or '')
        entry['reports'].append(row)
        entry['reportCount'] += 1
        if row['isEarlyCheckout']:
            entry['earlyCount'] += 1
        if row['hasFieldReport']:
            entry['fieldReportCount'] += 1
        ts = row['checkedOutAt'] or row['submittedAt']
        if ts and (entry['latestAt'] is None or str(ts) > str(entry['latestAt'])):
            entry['latestAt'] = ts

    if not early_only:
        for fr in fields_qs:
            if fr.id in used_field_ids:
                continue
            ba = fr.ambassador
            if not ba:
                continue
            row = _serialize_daily_activity(None, fr)
            submitted = row['submittedAt']
            if hasattr(submitted, 'isoformat'):
                row['submittedAt'] = submitted.isoformat()
            entry = ensure_ba(ba, row.get('city') or '')
            entry['reports'].append(row)
            entry['reportCount'] += 1
            entry['fieldReportCount'] += 1
            ts = row['submittedAt']
            if ts and (entry['latestAt'] is None or str(ts) > str(entry['latestAt'])):
                entry['latestAt'] = ts

    for entry in by_ba.values():
        entry['reports'].sort(
            key=lambda r: r.get('checkedOutAt') or r.get('submittedAt') or r.get('date') or '',
            reverse=True,
        )

    results = sorted(by_ba.values(), key=lambda r: r['latestAt'] or '', reverse=True)
    return {'count': len(results), 'results': results}


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def early_checkout_reports(request):
    """GET /api/early-checkouts/ — early-only view of daily reports."""
    ambassador_id = request.query_params.get('ambassador')
    return Response(_build_daily_reports_payload(early_only=True, ambassador_id=ambassador_id))


@api_view(['GET'])
@permission_classes([AllowAny])
def ba_leaderboard(request):
    """GET /api/ba/leaderboard/?token=… — invite-token BA view of rankings."""
    from .intelligence import build_ba_leaderboard

    ambassador = _ambassador_from_token(request.query_params.get('token'))
    if not ambassador:
        return Response({'detail': 'Invalid or missing invite token.'}, status=status.HTTP_404_NOT_FOUND)
    data = build_ba_leaderboard()
    data['me_id'] = ambassador.id
    return Response(data)


# Known stock SKU keys from BA checkout forms (label used when key has no override).
_STOCK_SKU_CATALOG: list[tuple[str, str]] = [
    ('stockKpgoCan10', 'KPGO 10 LTR CAN Cons. RED'),
    ('stockKpgoBtl3', 'KPGO 3.0 LTR BOTTLE (3LTR X 6) Cons. RED'),
    ('stockKpgoBtl45', 'KPGO 4.5 LTR BOTTLE (4.5LTRX 4) Cons. RED'),
    ('stockKpgoTin5', 'KPGO 5 LTR TIN Cons. RED'),
    ('stockKpgoPouch1x5', 'KPGO POUCH (1LTR x 5) Cons. RED'),
    ('stockKpgoSup1x5', 'KPGO Stand Up Pouch (1LTR x 5)'),
    ('stockKpgoBkt16', 'KPGO 16 LTR BKT'),
    ('stockKbpBkt10', 'KBP GOLD 10 KG BKT'),
    ('stockKbpBkt25', 'KBP GOLD 2.5 KG BKT'),
    ('stockKbpBkt5', 'KBP GOLD 5 KG BKT'),
    ('stockKbpTin5', 'KBP GOLD 5 KG TIN'),
    ('stockKbpPouch1x5', 'KBP GOLD POUCH (1KG X 5)'),
    ('stockKbpBkt16', 'KBP 16 KG BKT'),
    ('stockWbpBkt5', 'WBP 5 KG BKT'),
    ('stockWbpPouch1x5', 'WBP POUCH (1KG X 5)'),
    ('stockWbpBkt25', 'WBP 2.5 KG BKT'),
    ('stockWbpBkt16', 'WBP 16 KG BKT'),
]


def _normalize_stock_status(raw: object) -> str | None:
    """Map BA checkout labels → in_stock | near_out | out_of_stock."""
    if raw is None:
        return None
    text = str(raw).strip().lower()
    if not text:
        return None
    if 'near' in text:
        return 'near_out'
    if 'out' in text:
        return 'out_of_stock'
    if 'in stock' in text or text == 'in':
        return 'in_stock'
    return None


def _report_stock_sort_key(report: BaDailyReport):
    shift = report.shift
    checkout = shift.checked_out_at if shift and shift.checked_out_at else None
    return (
        checkout or report.updated_at or report.created_at,
        report.updated_at or report.created_at,
        report.id,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def stock_matrix(request):
    """
    GET /api/stock-matrix/
    SKU × store grid from the latest submitted stock report per store
    (last BA who checked out and submitted stock for that store).
    """
    reports = list(
        BaDailyReport.objects.filter(store_id__isnull=False)
        .exclude(stock_json={})
        .select_related('store', 'shift', 'ambassador')
        .order_by('-updated_at', '-id')
    )

    latest_by_store: dict[int, BaDailyReport] = {}
    for report in reports:
        stock = report.stock_json if isinstance(report.stock_json, dict) else {}
        if not any(str(v).strip() for v in stock.values()):
            continue
        sid = report.store_id
        if sid is None:
            continue
        prev = latest_by_store.get(sid)
        if prev is None or _report_stock_sort_key(report) > _report_stock_sort_key(prev):
            latest_by_store[sid] = report

    label_by_key = {k: label for k, label in _STOCK_SKU_CATALOG}
    seen_keys: set[str] = set()
    for report in latest_by_store.values():
        stock = report.stock_json if isinstance(report.stock_json, dict) else {}
        for key, val in stock.items():
            if str(val).strip():
                seen_keys.add(str(key))

    sku_keys: list[str] = []
    for key, _label in _STOCK_SKU_CATALOG:
        sku_keys.append(key)
        seen_keys.discard(key)
    for key in sorted(seen_keys):
        sku_keys.append(key)

    # All stores as columns; cells filled from latest stock report per store.
    all_stores = list(Store.objects.all().order_by('city', 'name', 'id'))
    store_cols = []
    cells: dict[str, dict[str, dict]] = {k: {} for k in sku_keys}

    for store in all_stores:
        report = latest_by_store.get(store.id)
        ba = report.ambassador if report else None
        checkout = (
            report.shift.checked_out_at.isoformat()
            if report and report.shift_id and report.shift and report.shift.checked_out_at
            else None
        )
        store_cols.append(
            {
                'storeId': store.id,
                'storeName': store.name,
                'storeCode': store.code or '',
                'city': store.city or '',
                'baId': ba.id if ba else None,
                'baName': ba.name if ba else '',
                'baCode': ba.code if ba else '',
                'reportId': report.id if report else None,
                'reportDate': report.date.isoformat() if report else None,
                'checkedOutAt': checkout,
                'submittedAt': report.updated_at.isoformat() if report and report.updated_at else None,
            }
        )
        if not report:
            continue
        stock = report.stock_json if isinstance(report.stock_json, dict) else {}
        store_id = str(store.id)
        for key in sku_keys:
            raw = stock.get(key)
            status_key = _normalize_stock_status(raw)
            if status_key is None and raw is not None and str(raw).strip():
                cells[key][store_id] = {
                    'status': None,
                    'label': str(raw).strip(),
                }
            elif status_key:
                display = {
                    'in_stock': 'In Stock',
                    'near_out': 'Near Out of Stock',
                    'out_of_stock': 'Out of Stock',
                }[status_key]
                cells[key][store_id] = {
                    'status': status_key,
                    'label': display,
                }

    skus = [{'key': k, 'label': label_by_key.get(k, k)} for k in sku_keys]

    return Response(
        {
            'skus': skus,
            'stores': store_cols,
            'cells': cells,
            'legend': [
                {'status': 'in_stock', 'label': 'In Stock'},
                {'status': 'near_out', 'label': 'Near Out of Stock'},
                {'status': 'out_of_stock', 'label': 'Out of Stock'},
            ],
        }
    )
