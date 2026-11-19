"""Supervisor store visit check-in / check-out APIs (portal only)."""

from __future__ import annotations

import math
from datetime import date, datetime

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Store, SupervisorStoreVisit
from .supervisor_views import _supervisor_profile_or_error

# Max distance from store GPS for supervisor visit check-in / check-out.
STORE_GEOFENCE_M = 300.0


def _parse_float(raw, label: str):
    if raw is None or raw == '':
        return None, f'{label} is required.'
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None, f'{label} must be a number.'
    if value != value:  # NaN
        return None, f'{label} must be a number.'
    return value, None


def _optional_float(raw):
    if raw is None or raw == '':
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    if value != value:
        return None
    return value


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in meters between two WGS84 points."""
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _geofence_error(store: Store, lat: float, lng: float, action: str) -> Response | None:
    """
    If the store has coordinates, require GPS within STORE_GEOFENCE_M.
    Stores without lat/lng skip this check (allow check-in/out).
    """
    store_lat = store.latitude
    store_lng = store.longitude
    if store_lat is None or store_lng is None:
        return None
    try:
        store_lat_f = float(store_lat)
        store_lng_f = float(store_lng)
    except (TypeError, ValueError):
        return None
    distance = _haversine_m(lat, lng, store_lat_f, store_lng_f)
    if distance <= STORE_GEOFENCE_M:
        return None
    return Response(
        {
            'detail': (
                f'You must be within {int(STORE_GEOFENCE_M)}m of the store to {action}. '
                f'You are about {int(round(distance))}m away.'
            ),
            'distanceM': round(distance, 1),
            'maxDistanceM': STORE_GEOFENCE_M,
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


def _parse_date(raw: str | None) -> date | None:
    text = str(raw or '').strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        try:
            return datetime.strptime(text[:10], '%Y-%m-%d').date()
        except ValueError:
            return None


def _photo_url(request, visit: SupervisorStoreVisit) -> str | None:
    if not visit.check_in_photo:
        return None
    try:
        url = visit.check_in_photo.url
    except ValueError:
        return None
    if request and hasattr(request, 'build_absolute_uri'):
        return request.build_absolute_uri(url)
    return url


def serialize_visit(request, visit: SupervisorStoreVisit) -> dict:
    store = visit.store
    return {
        'id': visit.id,
        'storeId': store.id,
        'storeName': store.name,
        'storeCity': store.city or '',
        'checkedInAt': visit.checked_in_at.isoformat() if visit.checked_in_at else None,
        'checkedOutAt': visit.checked_out_at.isoformat() if visit.checked_out_at else None,
        'isOpen': visit.checked_out_at is None,
        'checkInLat': visit.check_in_lat,
        'checkInLng': visit.check_in_lng,
        'checkInAccuracyM': visit.check_in_accuracy_m,
        'checkOutLat': visit.check_out_lat,
        'checkOutLng': visit.check_out_lng,
        'checkOutAccuracyM': visit.check_out_accuracy_m,
        'checkInPhotoUrl': _photo_url(request, visit),
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def supervisor_me_visits(request):
    """GET /api/supervisor/me/visits/?date=YYYY-MM-DD — visits for date (default today) + open visit."""
    profile, err = _supervisor_profile_or_error(request)
    if err:
        return err

    day = _parse_date(request.query_params.get('date')) or timezone.localdate()
    qs = (
        SupervisorStoreVisit.objects.filter(supervisor=profile)
        .select_related('store')
        .order_by('-checked_in_at')
    )
    day_visits = [
        serialize_visit(request, v)
        for v in qs.filter(checked_in_at__date=day)[:100]
    ]
    open_visit = qs.filter(checked_in_at__isnull=False, checked_out_at__isnull=True).first()
    return Response(
        {
            'date': day.isoformat(),
            'openVisit': serialize_visit(request, open_visit) if open_visit else None,
            'visits': day_visits,
        }
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def supervisor_me_visit_check_in(request):
    """
    POST /api/supervisor/me/visits/check-in/
    multipart: storeId, lat, lng, accuracy? (optional), photo (required image)
    """
    profile, err = _supervisor_profile_or_error(request)
    if err:
        return err

    store_raw = request.data.get('storeId') or request.data.get('store_id')
    try:
        store_id = int(store_raw)
    except (TypeError, ValueError):
        return Response({'detail': 'storeId is required.'}, status=status.HTTP_400_BAD_REQUEST)

    if not profile.stores.filter(pk=store_id).exists():
        return Response(
            {'detail': 'Store is not assigned to you.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        store = Store.objects.get(pk=store_id)
    except Store.DoesNotExist:
        return Response({'detail': 'Store not found.'}, status=status.HTTP_404_NOT_FOUND)

    lat, lat_err = _parse_float(request.data.get('lat'), 'lat')
    if lat_err:
        return Response({'detail': lat_err}, status=status.HTTP_400_BAD_REQUEST)
    lng, lng_err = _parse_float(request.data.get('lng'), 'lng')
    if lng_err:
        return Response({'detail': lng_err}, status=status.HTTP_400_BAD_REQUEST)
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return Response({'detail': 'Invalid GPS coordinates.'}, status=status.HTTP_400_BAD_REQUEST)

    geo_err = _geofence_error(store, lat, lng, 'check in')
    if geo_err:
        return geo_err

    accuracy = _optional_float(request.data.get('accuracy') or request.data.get('accuracy_m'))
    photo = request.FILES.get('photo') or request.FILES.get('image')
    if not photo:
        return Response({'detail': 'photo is required.'}, status=status.HTTP_400_BAD_REQUEST)

    content_type = (getattr(photo, 'content_type', '') or '').lower()
    if content_type and not content_type.startswith('image/'):
        return Response({'detail': 'photo must be an image.'}, status=status.HTTP_400_BAD_REQUEST)

    now = timezone.now()
    try:
        with transaction.atomic():
            open_visit = (
                SupervisorStoreVisit.objects.select_for_update()
                .filter(
                    supervisor=profile,
                    checked_in_at__isnull=False,
                    checked_out_at__isnull=True,
                )
                .select_related('store')
                .first()
            )
            if open_visit:
                return Response(
                    {
                        'detail': (
                            f'Check out of {open_visit.store.name} before checking in elsewhere.'
                        ),
                        'openVisit': serialize_visit(request, open_visit),
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            visit = SupervisorStoreVisit(
                supervisor=profile,
                store=store,
                checked_in_at=now,
                check_in_lat=lat,
                check_in_lng=lng,
                check_in_accuracy_m=accuracy,
                source=SupervisorStoreVisit.Source.APP,
            )
            visit.check_in_photo = photo
            visit.save()
    except IntegrityError:
        open_visit = (
            SupervisorStoreVisit.objects.filter(
                supervisor=profile,
                checked_in_at__isnull=False,
                checked_out_at__isnull=True,
            )
            .select_related('store')
            .first()
        )
        return Response(
            {
                'detail': 'You already have an open store visit. Check out first.',
                'openVisit': serialize_visit(request, open_visit) if open_visit else None,
            },
            status=status.HTTP_409_CONFLICT,
        )

    return Response(serialize_visit(request, visit), status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, FormParser, MultiPartParser])
def supervisor_me_visit_check_out(request):
    """
    POST /api/supervisor/me/visits/check-out/
    JSON/form: lat, lng, accuracy? (optional), visitId? (defaults to open visit)
    """
    profile, err = _supervisor_profile_or_error(request)
    if err:
        return err

    lat, lat_err = _parse_float(request.data.get('lat'), 'lat')
    if lat_err:
        return Response({'detail': lat_err}, status=status.HTTP_400_BAD_REQUEST)
    lng, lng_err = _parse_float(request.data.get('lng'), 'lng')
    if lng_err:
        return Response({'detail': lng_err}, status=status.HTTP_400_BAD_REQUEST)
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return Response({'detail': 'Invalid GPS coordinates.'}, status=status.HTTP_400_BAD_REQUEST)

    accuracy = _optional_float(request.data.get('accuracy') or request.data.get('accuracy_m'))
    visit_raw = request.data.get('visitId') or request.data.get('visit_id')

    with transaction.atomic():
        qs = SupervisorStoreVisit.objects.select_for_update().filter(supervisor=profile)
        if visit_raw not in (None, ''):
            try:
                visit_id = int(visit_raw)
            except (TypeError, ValueError):
                return Response({'detail': 'visitId must be a number.'}, status=status.HTTP_400_BAD_REQUEST)
            visit = qs.filter(pk=visit_id).select_related('store').first()
            if not visit:
                return Response({'detail': 'Visit not found.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            visit = (
                qs.filter(checked_in_at__isnull=False, checked_out_at__isnull=True)
                .select_related('store')
                .first()
            )
            if not visit:
                return Response(
                    {'detail': 'No open store visit to check out.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if visit.checked_out_at is not None:
            return Response(
                {'detail': 'This visit is already checked out.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        geo_err = _geofence_error(visit.store, lat, lng, 'check out')
        if geo_err:
            return geo_err

        visit.checked_out_at = timezone.now()
        visit.check_out_lat = lat
        visit.check_out_lng = lng
        visit.check_out_accuracy_m = accuracy
        visit.save(
            update_fields=[
                'checked_out_at',
                'check_out_lat',
                'check_out_lng',
                'check_out_accuracy_m',
                'updated_at',
            ]
        )

    return Response(serialize_visit(request, visit))


def _parse_client_datetime(raw) -> datetime | None:
    text = str(raw or '').strip()
    if not text:
        return None
    try:
        dt = datetime.fromisoformat(text.replace('Z', '+00:00'))
    except ValueError:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return dt


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def supervisor_me_visit_offline_sync(request):
    """
    POST /api/supervisor/me/visits/offline-sync/

    Sync a visit captured offline. No geofence re-check — client already validated
    range at capture time. Accepts client timestamps + GPS (+ photo for new visits).

    Body (multipart):
      storeId (required for new visits)
      visitId? — if set, only applies check-out to that open visit
      checkedInAt, checkInLat, checkInLng, checkInAccuracy?, photo?
      checkedOutAt?, checkOutLat?, checkOutLng?, checkOutAccuracy?
    """
    profile, err = _supervisor_profile_or_error(request)
    if err:
        return err

    visit_raw = request.data.get('visitId') or request.data.get('visit_id')
    cin = _parse_client_datetime(request.data.get('checkedInAt') or request.data.get('checked_in_at'))
    cout = _parse_client_datetime(request.data.get('checkedOutAt') or request.data.get('checked_out_at'))

    # ── Checkout-only for an existing server visit ─────────────────────────
    if visit_raw not in (None, ''):
        try:
            visit_id = int(visit_raw)
        except (TypeError, ValueError):
            return Response({'detail': 'visitId must be a number.'}, status=status.HTTP_400_BAD_REQUEST)
        visit = (
            SupervisorStoreVisit.objects.filter(supervisor=profile, pk=visit_id)
            .select_related('store')
            .first()
        )
        if not visit:
            return Response({'detail': 'Visit not found.'}, status=status.HTTP_404_NOT_FOUND)
        if visit.checked_out_at is not None:
            return Response(
                {'detail': 'This visit is already checked out.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not cout:
            return Response({'detail': 'checkedOutAt is required.'}, status=status.HTTP_400_BAD_REQUEST)
        out_lat, out_lat_err = _parse_float(
            request.data.get('checkOutLat') or request.data.get('check_out_lat'),
            'checkOutLat',
        )
        if out_lat_err:
            return Response({'detail': out_lat_err}, status=status.HTTP_400_BAD_REQUEST)
        out_lng, out_lng_err = _parse_float(
            request.data.get('checkOutLng') or request.data.get('check_out_lng'),
            'checkOutLng',
        )
        if out_lng_err:
            return Response({'detail': out_lng_err}, status=status.HTTP_400_BAD_REQUEST)
        visit.checked_out_at = cout
        visit.check_out_lat = out_lat
        visit.check_out_lng = out_lng
        visit.check_out_accuracy_m = _optional_float(
            request.data.get('checkOutAccuracy') or request.data.get('check_out_accuracy')
        )
        if visit.source == SupervisorStoreVisit.Source.APP:
            visit.source = SupervisorStoreVisit.Source.OFFLINE_SYNC
        visit.save()
        return Response(serialize_visit(request, visit))

    # ── New visit from offline queue ───────────────────────────────────────
    store_raw = request.data.get('storeId') or request.data.get('store_id')
    try:
        store_id = int(store_raw)
    except (TypeError, ValueError):
        return Response({'detail': 'storeId is required.'}, status=status.HTTP_400_BAD_REQUEST)

    if not profile.stores.filter(pk=store_id).exists():
        return Response(
            {'detail': 'Store is not assigned to you.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    try:
        store = Store.objects.get(pk=store_id)
    except Store.DoesNotExist:
        return Response({'detail': 'Store not found.'}, status=status.HTTP_404_NOT_FOUND)

    if not cin:
        return Response({'detail': 'checkedInAt is required.'}, status=status.HTTP_400_BAD_REQUEST)
    in_lat, in_lat_err = _parse_float(
        request.data.get('checkInLat') or request.data.get('check_in_lat'),
        'checkInLat',
    )
    if in_lat_err:
        return Response({'detail': in_lat_err}, status=status.HTTP_400_BAD_REQUEST)
    in_lng, in_lng_err = _parse_float(
        request.data.get('checkInLng') or request.data.get('check_in_lng'),
        'checkInLng',
    )
    if in_lng_err:
        return Response({'detail': in_lng_err}, status=status.HTTP_400_BAD_REQUEST)

    photo = request.FILES.get('photo') or request.FILES.get('image')
    if not photo:
        return Response({'detail': 'photo is required for a new offline visit.'}, status=status.HTTP_400_BAD_REQUEST)

    if cout and cout < cin:
        return Response(
            {'detail': 'Check-out time must be on or after check-in time.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    out_lat = out_lng = out_acc = None
    if cout:
        out_lat, out_lat_err = _parse_float(
            request.data.get('checkOutLat') or request.data.get('check_out_lat'),
            'checkOutLat',
        )
        if out_lat_err:
            return Response({'detail': out_lat_err}, status=status.HTTP_400_BAD_REQUEST)
        out_lng, out_lng_err = _parse_float(
            request.data.get('checkOutLng') or request.data.get('check_out_lng'),
            'checkOutLng',
        )
        if out_lng_err:
            return Response({'detail': out_lng_err}, status=status.HTTP_400_BAD_REQUEST)
        out_acc = _optional_float(
            request.data.get('checkOutAccuracy') or request.data.get('check_out_accuracy')
        )

    try:
        with transaction.atomic():
            if not cout:
                open_visit = (
                    SupervisorStoreVisit.objects.select_for_update()
                    .filter(
                        supervisor=profile,
                        checked_in_at__isnull=False,
                        checked_out_at__isnull=True,
                    )
                    .select_related('store')
                    .first()
                )
                if open_visit:
                    return Response(
                        {
                            'detail': (
                                f'Check out of {open_visit.store.name} before syncing another open visit.'
                            ),
                            'openVisit': serialize_visit(request, open_visit),
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
            visit = SupervisorStoreVisit(
                supervisor=profile,
                store=store,
                checked_in_at=cin,
                checked_out_at=cout,
                check_in_lat=in_lat,
                check_in_lng=in_lng,
                check_in_accuracy_m=_optional_float(
                    request.data.get('checkInAccuracy') or request.data.get('check_in_accuracy')
                ),
                check_out_lat=out_lat,
                check_out_lng=out_lng,
                check_out_accuracy_m=out_acc,
                source=SupervisorStoreVisit.Source.OFFLINE_SYNC,
            )
            visit.check_in_photo = photo
            visit.save()
    except IntegrityError:
        return Response(
            {'detail': 'Could not sync visit (conflict with an open visit).'},
            status=status.HTTP_409_CONFLICT,
        )

    return Response(serialize_visit(request, visit), status=status.HTTP_201_CREATED)
