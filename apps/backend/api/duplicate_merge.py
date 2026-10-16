"""Carry what the user gave the discarded copies over to the kept one.

Resolving a duplicate group trashes every copy but the one the user keeps.
Whatever the user had attached to those copies (tags, albums, a rating, a
caption, shares) used to go to the trash with them, so picking the better file
could cost the photo its tags or take it out of an album. Here the kept copy
receives all of it first:

* tags: every tag of every copy,
* albums: the kept copy joins every user album a copy was in, locked ones too:
  the lock protects an album's set of pictures, and the kept copy stands in
  for the one that leaves,
* rating: the highest, so a favorite stays a favorite; the same for each
  library member's own rating (api.library_access),
* caption: the kept copy's, followed by each different caption of the others,
  unless the user picked one copy's caption to keep instead,
* dismissed auto tags: stay dismissed on the kept copy,
* sharing: shared with everyone a copy was shared with, public if a copy was.

It only ever adds: nothing the kept copy already had is taken away (except
its caption, when the user picks another copy's), and reverting the
resolution leaves the additions in place.

What the files say about themselves (date, place, camera) is not touched, and
neither are faces: their boxes belong to each copy's own pixels.
"""

import logging

from django.db.models import Max

from api.metadata.jobs import queue_rating_write
from api.models import AlbumUser, Photo, PhotoRating, Tag
from api.models.photo_caption import DISMISSED_TAGS_KEY, PhotoCaption

logger = logging.getLogger(__name__)


def user_caption(photo):
    caption = getattr(photo, "caption_instance", None)
    captions = (caption.captions_json if caption else None) or {}
    return (captions.get("user_caption") or "").strip()


def _dismissed_tags(photo):
    caption = getattr(photo, "caption_instance", None)
    captions = (caption.captions_json if caption else None) or {}
    return captions.get(DISMISSED_TAGS_KEY) or []


def merge_into_kept(kept, others, caption_from=None):
    """Give ``kept`` what the user attached to ``others``; return what was added.

    ``caption_from``, one photo of the group, makes its caption the kept
    copy's, in place of all the captions joined.
    """
    others = list(
        Photo.objects.filter(pk__in=[photo.pk for photo in others])
        .exclude(pk=kept.pk)
        .select_related("caption_instance")
    )
    added = {"tags": 0, "albums": 0, "shared_to": 0}
    if not others:
        return added
    owner = kept.owner

    for tag in (
        Tag.objects.filter(owner=owner, photos__in=others)
        .exclude(photos=kept)
        .distinct()
    ):
        tag.photos.add(kept)
        added["tags"] += 1

    for album in (
        AlbumUser.objects.filter(owner=owner, photos__in=others)
        .exclude(photos=kept)
        .distinct()
    ):
        album.photos.add(kept)
        added["albums"] += 1

    best = Photo.objects.filter(pk__in=[p.pk for p in others]).aggregate(
        best=Max("rating")
    )["best"]
    if best is not None and best > kept.rating:
        # An UPDATE, like the favorite endpoint: Photo.save() would write the
        # rating into the file right here; the same write is queued instead.
        Photo.objects.filter(pk=kept.pk).update(rating=best)
        kept.rating = best
        queue_rating_write(owner, [kept.pk])
        added["rating"] = best

    kept_member_ratings = dict(
        PhotoRating.objects.filter(photo=kept).values_list("user_id", "rating")
    )
    for row in (
        PhotoRating.objects.filter(photo__in=others)
        .values("user_id")
        .annotate(best=Max("rating"))
    ):
        if row["best"] > kept_member_ratings.get(row["user_id"], 0):
            PhotoRating.objects.update_or_create(
                photo=kept, user_id=row["user_id"], defaults={"rating": row["best"]}
            )

    shared_to = set()
    for photo in others:
        shared_to.update(photo.shared_to.values_list("pk", flat=True))
    shared_to -= set(kept.shared_to.values_list("pk", flat=True))
    if shared_to:
        kept.shared_to.add(*shared_to)
        added["shared_to"] = len(shared_to)
    if not kept.public and any(photo.public for photo in others):
        Photo.objects.filter(pk=kept.pk).update(public=True)
        kept.public = True
        added["public"] = True

    caption_instance, _ = PhotoCaption.objects.get_or_create(photo=kept)
    kept_caption = user_caption(kept)
    if caption_from is not None:
        merged_caption = user_caption(caption_from)
    else:
        captions = [kept_caption] if kept_caption else []
        for photo in others:
            caption = user_caption(photo)
            if caption and caption not in captions:
                captions.append(caption)
        merged_caption = "\n\n".join(captions)
    if merged_caption != kept_caption:
        caption_instance.apply_user_caption(merged_caption)
        added["caption"] = True

    already_dismissed = set(_dismissed_tags(kept))
    for photo in others:
        for tag in _dismissed_tags(photo):
            if tag not in already_dismissed:
                caption_instance.dismiss_auto_tag(tag)
                already_dismissed.add(tag)
                added.setdefault("dismissed_tags", 0)
                added["dismissed_tags"] += 1

    logger.info(f"merged {len(others)} duplicate copies into {kept.pk}: {added}")
    return added
