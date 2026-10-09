"""Helpers for MIS permission checks and audit logging."""

from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response

from core.models import UserType

from .models import MisAuditLog


def is_mis_user(user) -> bool:
    return bool(user and user.is_authenticated and getattr(user, 'user_type', None) == UserType.MIS)


def is_ho_or_admin(user) -> bool:
    ut = getattr(user, 'user_type', None)
    return bool(
        user
        and user.is_authenticated
        and ut in (UserType.HEAD_OFFICE, UserType.ADMIN)
    )


def require_mis(request):
    if not is_mis_user(request.user):
        return Response({'detail': 'MIS access required.'}, status=status.HTTP_403_FORBIDDEN)
    return None


def require_ho_or_mis(request):
    if is_mis_user(request.user) or is_ho_or_admin(request.user):
        return None
    return Response({'detail': 'Head Office or MIS access required.'}, status=status.HTTP_403_FORBIDDEN)


def log_mis_action(
    *,
    user,
    action: str,
    summary: str,
    before=None,
    after=None,
    ambassador=None,
    store=None,
    report=None,
) -> MisAuditLog:
    return MisAuditLog.objects.create(
        mis_user=user if getattr(user, 'is_authenticated', False) else None,
        action=action,
        summary=(summary or '')[:500],
        before_json=before if isinstance(before, (dict, list)) else (before or {}),
        after_json=after if isinstance(after, (dict, list)) else (after or {}),
        ambassador=ambassador,
        store=store,
        report=report,
    )
