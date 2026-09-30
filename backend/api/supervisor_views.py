"""Head Office supervisor CRUD + supervisor portal overview APIs."""

from __future__ import annotations

import re

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from core.models import UserType

from .models import Store, Supervisor
from .serializers import SupervisorSerializer
from .supervisor_ops import build_supervisor_overview

User = get_user_model()

SUPERVISOR_EMAIL_DOMAIN = 'kashmir.pk'


def _slug_from_name(name: str) -> str:
    slug = re.sub(r'[^a-z0-9]+', '.', name.lower()).strip('.')
    return slug or 'supervisor'


def generate_supervisor_email(name: str) -> str:
    """Build a unique sign-in email from a display name, e.g. Ali Raza → ali.raza@kashmir.pk."""
    base_local = _slug_from_name(name)
    candidate = f'{base_local}@{SUPERVISOR_EMAIL_DOMAIN}'
    n = 2
    while User.objects.filter(email__iexact=candidate).exists():
        candidate = f'{base_local}{n}@{SUPERVISOR_EMAIL_DOMAIN}'
        n += 1
    return candidate


class SupervisorViewSet(viewsets.ModelViewSet):
    """
    HO: manage supervisors (create user + profile, assign stores, reset login).
    """

    permission_classes = [IsAuthenticated]
    serializer_class = SupervisorSerializer
    queryset = Supervisor.objects.select_related('user').prefetch_related('stores').all()

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        return Response({'results': SupervisorSerializer(qs, many=True).data})

    def create(self, request, *args, **kwargs):
        data = request.data if isinstance(request.data, dict) else {}
        name = str(data.get('name') or '').strip()
        email = str(data.get('email') or '').strip().lower()
        phone = str(data.get('phone') or '').strip()
        city = str(data.get('city') or '').strip()
        password = str(data.get('password') or '')
        store_ids = data.get('storeIds') or data.get('store_ids') or []

        if not name:
            return Response({'detail': 'Name is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not email or '@' not in email:
            email = generate_supervisor_email(name)
        if len(password) < 6:
            return Response({'detail': 'Password must be at least 6 characters.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(email__iexact=email).exists():
            return Response({'detail': 'Another account already uses this email.'}, status=status.HTTP_400_BAD_REQUEST)

        ids: list[int] = []
        for x in store_ids if isinstance(store_ids, list) else []:
            try:
                ids.append(int(x))
            except (TypeError, ValueError):
                continue
        if ids:
            missing = set(ids) - set(Store.objects.filter(id__in=ids).values_list('id', flat=True))
            if missing:
                return Response(
                    {'detail': f'Unknown store ids: {sorted(missing)}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        parts = name.split(None, 1)
        first = parts[0]
        last = parts[1] if len(parts) > 1 else ''

        with transaction.atomic():
            user = User(
                email=email,
                username=email,
                first_name=first[:150],
                last_name=last[:150],
                phone=phone[:20],
                user_type=UserType.SUPERVISOR,
                is_active=True,
                is_active_user=True,
            )
            user.set_password(password)
            user.save()
            supervisor = Supervisor.objects.create(user=user, city=city)
            supervisor.set_stores(ids)

        return Response(SupervisorSerializer(supervisor).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        supervisor = self.get_object()
        data = request.data if isinstance(request.data, dict) else {}
        user = supervisor.user

        if 'name' in data and data.get('name') is not None:
            name = str(data.get('name') or '').strip()
            if name:
                parts = name.split(None, 1)
                user.first_name = parts[0][:150]
                user.last_name = (parts[1] if len(parts) > 1 else '')[:150]

        if 'phone' in data and data.get('phone') is not None:
            user.phone = str(data.get('phone') or '')[:20]

        if 'city' in data and data.get('city') is not None:
            supervisor.city = str(data.get('city') or '')[:100]

        if 'email' in data and data.get('email') is not None:
            email = str(data.get('email') or '').strip().lower()
            if email and '@' in email:
                if User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
                    return Response(
                        {'detail': 'Another account already uses this email.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                user.email = email
                user.username = email

        if data.get('password'):
            password = str(data.get('password'))
            if len(password) < 6:
                return Response(
                    {'detail': 'Password must be at least 6 characters.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.set_password(password)

        store_ids = data.get('storeIds', data.get('store_ids', None))
        with transaction.atomic():
            user.save()
            supervisor.save()
            if store_ids is not None:
                ids = []
                for x in store_ids if isinstance(store_ids, list) else []:
                    try:
                        ids.append(int(x))
                    except (TypeError, ValueError):
                        continue
                supervisor.set_stores(ids)

        return Response(SupervisorSerializer(supervisor).data)

    def destroy(self, request, *args, **kwargs):
        supervisor = self.get_object()
        user = supervisor.user
        with transaction.atomic():
            supervisor.delete()
            user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='assign-stores')
    def assign_stores(self, request, pk=None):
        supervisor = self.get_object()
        store_ids = request.data.get('storeIds') or request.data.get('store_ids') or []
        if not isinstance(store_ids, list):
            return Response({'detail': 'storeIds must be an array.'}, status=status.HTTP_400_BAD_REQUEST)
        ids = []
        for x in store_ids:
            try:
                ids.append(int(x))
            except (TypeError, ValueError):
                continue
        supervisor.set_stores(ids)
        return Response(SupervisorSerializer(supervisor).data)

    @action(detail=True, methods=['post'], url_path='set-login')
    def set_login(self, request, pk=None):
        supervisor = self.get_object()
        email = str(request.data.get('email') or '').strip().lower()
        password = str(request.data.get('password') or '')
        if not email or '@' not in email:
            return Response({'detail': 'Valid email is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(password) < 6:
            return Response({'detail': 'Password must be at least 6 characters.'}, status=status.HTTP_400_BAD_REQUEST)
        user = supervisor.user
        if User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
            return Response({'detail': 'Another account already uses this email.'}, status=status.HTTP_400_BAD_REQUEST)
        user.email = email
        user.username = email
        user.set_password(password)
        user.save(update_fields=['email', 'username', 'password', 'updated_at'])
        return Response(SupervisorSerializer(supervisor).data)

    @action(detail=True, methods=['get'], url_path='overview')
    def overview(self, request, pk=None):
        supervisor = self.get_object()
        return Response(build_supervisor_overview(supervisor))


@api_view(['GET'])
@permission_classes([AllowAny])
def supervisor_login_directory(request):
    """
    GET /api/supervisor-logins/ — public list of supervisor emails for the login dropdown.
    Returns only name + email (no secrets).
    """
    rows = (
        Supervisor.objects.select_related('user')
        .filter(user__is_active=True, user__user_type=UserType.SUPERVISOR)
        .order_by('user__first_name', 'user__last_name', 'user__email')
    )
    results = []
    for s in rows:
        email = (s.user.email or '').strip().lower()
        if not email:
            continue
        name = f'{s.user.first_name} {s.user.last_name}'.strip() or email
        results.append({'email': email, 'name': name})
    return Response({'results': results})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def supervisor_me(request):
    """GET /api/supervisor/me/ — profile for the signed-in supervisor user."""
    if getattr(request.user, 'user_type', None) != UserType.SUPERVISOR:
        return Response({'detail': 'Not a supervisor account.'}, status=status.HTTP_403_FORBIDDEN)
    profile = getattr(request.user, 'supervisor_profile', None)
    if not profile:
        return Response({'detail': 'Supervisor profile missing.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(SupervisorSerializer(profile).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def supervisor_me_overview(request):
    """GET /api/supervisor/me/overview/ — live stores + BAs for signed-in supervisor."""
    if getattr(request.user, 'user_type', None) != UserType.SUPERVISOR:
        return Response({'detail': 'Not a supervisor account.'}, status=status.HTTP_403_FORBIDDEN)
    profile = getattr(request.user, 'supervisor_profile', None)
    if not profile:
        return Response({'detail': 'Supervisor profile missing.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(build_supervisor_overview(profile))
