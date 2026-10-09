"""Replace a photo's file with an edited version, keeping the photo.

The user edits a photo in another program and hands the result back. The new
file takes the original's place in the library under the original's name, so
anything encoded in that name survives, and the Photo row keeps its id, albums,
tags, people, rating, dates and shares. The original is not deleted: it is
copied out of the library into ``MEDIA_ROOT/replaced_originals`` first, where a
rescan never sees it, and can be recovered from there by hand.

The swap itself is the same bookkeeping a rescan does for a file whose bytes
changed under the same name (``reindex_replaced_file``), with two differences
that come from knowing the user replaced the picture on purpose:

* the picture is always treated as new, so the image hash moves and every
  thumbnail URL with it; browsers and the mobile app cannot keep showing the
  old picture from their caches,
* when the framing is unchanged (a retouch: same proportions, nearly the same
  perceptual hash) the faces and their names are kept, their crops cut again
  from the new thumbnail. A crop or a different picture re-detects the faces,
  because the old boxes would frame the wrong pixels.

What the file says about itself is deliberately not read back: editors often
drop or reset EXIF, and re-reading it could move the photo's date, its place or
its rating. Only what is derived from the pixels is rebuilt.
"""

import datetime
import logging
import os
import shutil
import tempfile

import PIL.Image
from constance import config as site_config
from django.conf import settings
from django_q.tasks import async_task

from api.directory_watcher.file_handlers import NEW_PICTURE, reindex_replaced_file
from api.models import File, Photo
from api.models.file import (
    calculate_hash,
    is_metadata,
    is_raw,
    is_valid_media,
    is_video,
)
from api.perceptual_hash import calculate_perceptual_hash, hamming_distance
from api.thumbnails import render_big_thumbnail_to

logger = logging.getLogger(__name__)

BACKUP_DIRECTORY = "replaced_originals"

# Extensions that name the same format: a JPEG exported as ".jpeg" over a
# ".JPG" keeps the original's name exactly.
_SAME_FORMAT = (
    {".jpg", ".jpeg", ".jpe"},
    {".tif", ".tiff"},
    {".heic", ".heif"},
)

# How far the perceptual hashes of the old and new picture may drift for the
# replacement to still count as a retouch of the same framing. Colour and
# exposure edits move a few bits; a crop or another picture moves many more.
RETOUCH_MAX_DISTANCE = 16

# Two big thumbnails are rendered at the same height, so equal proportions mean
# equal widths, give or take rounding.
_SAME_WIDTH_TOLERANCE = 2


class ReplaceError(Exception):
    """A replacement refused before anything was changed (or rolled back)."""

    def __init__(self, status, detail):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _format_of(extension):
    extension = extension.lower()
    for group in _SAME_FORMAT:
        if extension in group:
            return min(group)
    return extension


def replacement_target(original_path, uploaded_name):
    """Where the replacement goes: the original's path, unless the format changed.

    A new format keeps the original's name with the new extension, so a HEIC
    exported as JPEG does not end up with a name that lies about its content.
    """
    original_stem, original_extension = os.path.splitext(original_path)
    new_extension = os.path.splitext(uploaded_name or "")[1]
    if not new_extension or _format_of(new_extension) == _format_of(original_extension):
        return original_path
    return original_stem + new_extension.lower()


def backup_path(user, original_path, now=None):
    """Where the original is kept: outside the library, never rescanned.

    Keeps the original's path below the scan directory, so two files with the
    same name in different folders cannot collide, under a timestamp per
    replacement, so replacing the same photo twice keeps both earlier files.
    """
    now = now or datetime.datetime.now()
    scan_directory = (user.scan_directory or "").rstrip(os.sep)
    if scan_directory and original_path.startswith(scan_directory + os.sep):
        relative = os.path.relpath(original_path, scan_directory)
    else:
        relative = os.path.basename(original_path)
    return os.path.join(
        settings.MEDIA_ROOT,
        BACKUP_DIRECTORY,
        str(user.id),
        now.strftime("%Y%m%d-%H%M%S-%f"),
        relative,
    )


def is_retouch(photo, new_path):
    """Whether ``new_path`` shows the same framing as ``photo`` does now.

    Renders the new file exactly as its big thumbnail would be, and compares
    that with the current big thumbnail: the face boxes are pixels of it, so
    the faces can be kept only when both have the same size and nearly the
    same picture.
    """
    thumbnail = getattr(photo, "thumbnail", None)
    if not photo.perceptual_hash or not thumbnail or not thumbnail.thumbnail_big:
        return False
    try:
        with PIL.Image.open(thumbnail.thumbnail_big.path) as current:
            current_size = current.size
        with tempfile.TemporaryDirectory() as tmp:
            rendered = os.path.join(tmp, "replacement.webp")
            render_big_thumbnail_to(new_path, rendered, photo.local_orientation)
            with PIL.Image.open(rendered) as candidate:
                candidate_size = candidate.size
            candidate_hash = calculate_perceptual_hash(rendered)
    except Exception:
        logger.warning(
            f"could not compare the replacement of {photo.pk} with it", exc_info=True
        )
        return False
    if candidate_hash is None or current_size[1] != candidate_size[1]:
        return False
    if abs(current_size[0] - candidate_size[0]) > _SAME_WIDTH_TOLERANCE:
        return False
    return hamming_distance(photo.perceptual_hash, candidate_hash) <= (
        RETOUCH_MAX_DISTANCE
    )


def _validate(user, photo, staged_path, uploaded_name):
    main_file = photo.main_file
    if main_file is None or main_file.type != File.IMAGE:
        raise ReplaceError(400, "Only photos can be replaced, not videos or RAW files.")
    if not os.path.exists(main_file.path):
        raise ReplaceError(409, "The photo's file is missing from the library.")
    if (
        is_raw(uploaded_name)
        or is_metadata(uploaded_name)
        or is_video(staged_path)
        or not is_valid_media(staged_path, user)
    ):
        raise ReplaceError(400, "The replacement must be a photo.")


def _write_atomically(source, target):
    """Copy ``source`` to ``target`` so that ``target`` is never half written."""
    directory, name = os.path.split(target)
    temporary = os.path.join(directory, f".{name}.librephotos-replace")
    shutil.copyfile(source, temporary)
    os.replace(temporary, target)


def _refresh_dimensions(photo, path):
    """Size and dimensions of the new file; nothing else is read from it."""
    photo.size = os.path.getsize(path)
    photo.save(save_metadata=False, update_fields=["size"])
    try:
        with PIL.Image.open(path) as image:
            width, height = image.size
    except Exception:
        logger.info(f"could not read the dimensions of {path}", exc_info=True)
        return
    metadata = getattr(photo, "metadata", None)
    if metadata is not None:
        metadata.width = width
        metadata.height = height
        metadata.save(update_fields=["width", "height"])


def replace_photo_file(user, photo, staged_path, uploaded_name):
    """Put the file at ``staged_path`` in place of ``photo``'s main file.

    Returns ``(photo, backup, kept_faces)``. Raises ``ReplaceError`` with an
    HTTP status when the replacement is refused; nothing has changed then.
    """
    _validate(user, photo, staged_path, uploaded_name)

    main_file = photo.main_file
    original_path = main_file.path
    new_hash = calculate_hash(user, staged_path)
    if new_hash == main_file.hash:
        raise ReplaceError(400, "The replacement is the same file as the original.")
    if File.objects.filter(hash=new_hash).exists():
        raise ReplaceError(409, "This file is already in the library.")

    target = replacement_target(original_path, uploaded_name)
    moves = target != original_path
    if moves and (os.path.exists(target) or File.objects.filter(path=target).exists()):
        raise ReplaceError(
            409, f"{os.path.basename(target)} already exists next to the original."
        )

    backup = backup_path(user, original_path)
    os.makedirs(os.path.dirname(backup), exist_ok=True)
    shutil.copy2(original_path, backup)

    try:
        _write_atomically(staged_path, target)
        keep_faces = is_retouch(photo, target)
        if moves:
            File.objects.filter(pk=main_file.pk).update(path=target)
        replaced = reindex_replaced_file(
            user, target, new_hash, verdict=NEW_PICTURE, keep_faces=keep_faces
        )
        if replaced is None:
            raise RuntimeError(f"{target} was not re-indexed")
    except Exception as error:
        logger.exception(f"replacing {original_path} failed, restoring it")
        if moves:
            File.objects.filter(pk=main_file.pk).update(path=original_path)
            if os.path.exists(target):
                os.remove(target)
        _write_atomically(backup, original_path)
        raise ReplaceError(500, "The photo could not be replaced.") from error

    if moves:
        os.remove(original_path)

    replaced = Photo.objects.get(pk=replaced.pk)
    try:
        _refresh_dimensions(replaced, target)
    except Exception:
        # The swap is done; stale numbers in the Details panel are no reason
        # to report it as failed.
        logger.warning(f"could not refresh the size of {target}", exc_info=True)
    async_task(refresh_replaced_photo, replaced.pk, keep_faces)
    logger.info(
        f"replaced {original_path} with {target} for photo {replaced.pk}, "
        f"original kept at {backup}, faces {'kept' if keep_faces else 'redetected'}"
    )
    return replaced, backup, keep_faces


def refresh_replaced_photo(photo_id, kept_faces):
    """Rebuild, in the background, what the ML services derived from the pixels.

    Each step stands alone: a sidecar that is down costs that step, not the
    others, and the regular jobs fill the gap later.
    """
    from api.batch_jobs import store_clip_embeddings
    from api.directory_watcher.processing_jobs import _run_ocr_for_photo
    from api.image_similarity import build_image_similarity_index
    from api.models.photo_caption import PhotoCaption
    from api.models.photo_ocr import PhotoOcr
    from api.models.photo_search import PhotoSearch
    from api.photo_faces import extract_faces

    photo = Photo.objects.filter(pk=photo_id).first()
    if photo is None:
        return

    def step(name, function):
        try:
            function()
        except Exception:
            logger.warning(
                f"refreshing replaced photo {photo_id}: {name} failed", exc_info=True
            )

    def tags():
        caption, _ = PhotoCaption.objects.get_or_create(photo=photo)
        if caption.captions_json:
            caption.captions_json.pop(site_config.TAGGING_MODEL, None)
            caption.save()
        caption.generate_tag_captions(commit=True)

    def embedding():
        had_embedding = photo.clip_embeddings is not None
        photo.clip_embeddings = None
        photo.save(save_metadata=False, update_fields=["clip_embeddings"])
        if had_embedding:
            store_clip_embeddings([photo])
            # The index is keyed on the image hash, which just moved.
            build_image_similarity_index(photo.owner)

    def ocr():
        if PhotoOcr.objects.filter(photo=photo).exists():
            _run_ocr_for_photo(photo)

    def search():
        search_instance, _ = PhotoSearch.objects.get_or_create(photo=photo)
        search_instance.recreate_search_captions()
        search_instance.save()

    if not kept_faces:
        step("faces", lambda: extract_faces(photo))
    step("tags", tags)
    step("embedding", embedding)
    step("ocr", ocr)
    step("search", search)
