"""
Photo filtering utilities for bulk operations.

This module provides reusable functions to build photo querysets from filter parameters,
enabling server-side "Select All" operations without sending individual photo IDs.
"""

from django.db.models import Q

from api.models import Photo
from api.timeline_filter import timeline_filter_q
from api.util import folder_path_q


def missing_photo_q(prefix=""):
    """Photos whose file is gone.

    The scan's missing-file check unlinks a file it cannot find, so a missing
    photo is one with no file left (see ``num_missing_photos`` in api/stats.py
    and ``delete_missing_photos`` in api/autoalbum.py, which this matches so
    the list, the Library page's count and "Remove missing photos" agree). It
    keeps its thumbnails, tags and captions, but no filename or folder.
    """
    return Q(**{f"{prefix}files": None}) | Q(**{f"{prefix}main_file": None})


def build_photo_queryset(user, params: dict):
    """The user's own photos matching a select_all ``query`` payload.

    This is the write scope behind every server-side "Select All" mutation
    (trash, favorite, hide, share, tag, album, download), so it is always
    bound to ``user``: no key in ``params`` can widen it to another user's
    photos. Public browsing of other users' photos is a read concern and
    lives in the timeline view, not here.

    Args:
        user: The authenticated user making the request
        params: Dictionary of filter parameters:
            - public: bool - Only the user's photos that are marked public
            - hidden: bool - Filter by hidden photos
            - in_trashcan: bool - Filter by trashed photos
            - missing: bool - Only photos whose file is gone, hidden or not
              and in the trash or not unless hidden / in_trashcan say so
            - media, video, photo, is_screenshot, is_document,
              hide_screenshots, hide_documents, favorite, untagged,
              apply_default -
              the timeline filter, resolved by api.timeline_filter exactly as
              the date-album endpoints resolve it, so select-all on the
              timeline acts on what it shows
            - person: int - Filter by person ID (faces)
            - tag: int - Filter by tag ID
            - folder: str - Filter by folder path prefix
            - show_all_stack_photos: bool - If True, show all photos in stacks (default: False)

    Returns:
        QuerySet[Photo]: Filtered photo queryset
    """
    filters = [Q(thumbnail__aspect_ratio__isnull=False)]

    # Media type, screenshots, documents, favorites and untagged
    filters += timeline_filter_q(user, params)

    if params.get("public"):
        filters.append(Q(public=True))

    # Missing photos are listed wherever they are: hidden or not, in the
    # trash or not, unless the caller narrows that down (permanent deletion
    # forces in_trashcan, so it only ever takes trashed ones).
    missing = bool(params.get("missing"))
    if missing:
        filters.append(missing_photo_q())

    # Hidden filter
    if params.get("hidden"):
        filters.append(Q(hidden=True))
    elif not missing:
        filters.append(Q(hidden=False))

    # Trashcan filter
    if params.get("in_trashcan"):
        filters.append(Q(in_trashcan=True) & Q(removed=False))
    elif not missing:
        filters.append(Q(in_trashcan=False))

    # Person/face filter
    if params.get("person"):
        filters.append(Q(faces__person__id=params["person"]))

    # Tag filter
    if params.get("tag"):
        filters.append(Q(tags__id=params["tag"]))

    # Folder path filter
    if params.get("folder"):
        filters.append(folder_path_q("files__path", params["folder"]))

    # Stack filtering: Show photos that are either:
    # 1. Not in any stack, OR
    # 2. The primary photo of their stack
    # This applies stacking behavior for ALL stack types (manual, burst, etc.)
    # Non-primary photos are hidden in the timeline but accessible via stack expansion
    if not params.get("show_all_stack_photos"):
        filters.append(Q(stacks__isnull=True) | Q(primary_in_stack__isnull=False))

    return Photo.objects.owned_by(user).filter(*filters).distinct()
