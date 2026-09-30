"""Business codes: BA-001 (auto), store codes (manual, free-form)."""

from __future__ import annotations

import re

from django.db import IntegrityError, transaction

CODE_RE = re.compile(r'^([A-Z]+)-(\d+)$')


def normalize_code(raw: str, prefix: str) -> str:
    """Normalize 'ba1' / 'BA-01' / 'st12' → 'BA-001' / 'ST-012' (BA auto-codes)."""
    t = (raw or '').strip().upper()
    if not t:
        return ''
    prefix = prefix.upper()
    m = re.match(rf'^{re.escape(prefix)}-?0*(\d+)$', t, re.I)
    if m:
        return f'{prefix}-{int(m.group(1)):03d}'
    if t.isdigit() and prefix == 'ST':
        return f'ST-{int(t):03d}'
    return t


def normalize_store_code(raw: str) -> str:
    """Free-form store business code (e.g. 33991, DTR000297). Strip only."""
    return (raw or '').strip()


def format_code(prefix: str, n: int) -> str:
    return f'{prefix.upper()}-{int(n):03d}'


def _max_sequence(model, prefix: str) -> int:
    prefix = prefix.upper()
    codes = (
        model.objects.filter(code__startswith=f'{prefix}-')
        .values_list('code', flat=True)
    )
    max_n = 0
    for code in codes:
        m = CODE_RE.match(code or '')
        if m and m.group(1) == prefix:
            max_n = max(max_n, int(m.group(2)))
    return max_n


def allocate_code(model, prefix: str) -> str:
    """
    Allocate the next unused PREFIX-NNN under a row lock.
    Call when creating and code is empty (ambassadors).
    """
    prefix = prefix.upper()
    with transaction.atomic():
        list(
            model.objects.select_for_update()
            .filter(code__startswith=f'{prefix}-')
            .order_by('id')
        )
        next_n = _max_sequence(model, prefix) + 1
        return format_code(prefix, next_n)


def uniquify_store_code(model, raw: str, exclude_pk=None) -> str:
    """
    Use the given store code as-is. If it already exists, append -1, -2, …
    Comparison is case-insensitive.
    """
    base = normalize_store_code(raw)
    if not base:
        return ''
    candidate = base
    n = 1
    while True:
        qs = model.objects.filter(code__iexact=candidate)
        if exclude_pk:
            qs = qs.exclude(pk=exclude_pk)
        if not qs.exists():
            return candidate
        candidate = f'{base}-{n}'
        n += 1
        if n > 500:
            raise IntegrityError(f'Could not uniquify store code "{base}"')


def resolve_by_code(model, raw: str, prefix: str):
    """Look up a model instance by business code, or None."""
    code = normalize_code(raw, prefix)
    if not code:
        return None
    return model.objects.filter(code=code).first()


def resolve_store_by_code(model, raw: str):
    """Look up Store by free-form business code (case-insensitive)."""
    code = normalize_store_code(raw)
    if not code:
        return None
    return model.objects.filter(code__iexact=code).first()


def save_with_code(instance, prefix: str, save_fn) -> None:
    """Assign BA-style code if missing and retry on unique-code collision."""
    for _ in range(8):
        if not instance.code:
            instance.code = allocate_code(instance.__class__, prefix)
        else:
            instance.code = normalize_code(instance.code, prefix) or instance.code
        try:
            save_fn()
            return
        except IntegrityError:
            instance.code = ''
    raise IntegrityError(f'Could not allocate unique {prefix}-### code')
