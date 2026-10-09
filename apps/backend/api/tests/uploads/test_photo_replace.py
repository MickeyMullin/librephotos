"""Replacing a photo's file with an edited version (api.photo_replace).

* the replacement goes to the original's path, or to the original's name with
  a new extension when the format changed,
* the original is copied out of the library first and restored when the swap
  fails,
* the Photo keeps its id and what the user gave it (tags, albums, rating),
  its image hash and thumbnails move to the new picture,
* a retouch keeps the faces and re-crops them under the new hash; another
  framing drops them for re-detection,
* only the uploader's own photos, only photos, never a file already indexed.
"""

import os
import shutil
import tempfile
from unittest.mock import patch

from chunked_upload.exceptions import ChunkedUploadError
from django.test import RequestFactory
from PIL import Image, ImageEnhance

from api.models import AlbumUser, File, Photo, Tag
from api.models.file import calculate_hash
from api.photo_replace import (
    BACKUP_DIRECTORY,
    ReplaceError,
    backup_path,
    replace_photo_file,
    replacement_target,
)
from api.tests.scanning.test_replaced_file_rescan import (
    ReplacedFileTestCase,
    _write_image,
)
from api.tests.utils import create_test_face, create_test_user
from api.views.upload import ReplacePhotoChunkedComplete


def _read(path):
    with open(path, "rb") as f:
        return f.read()


class ReplacementTargetTest(ReplacedFileTestCase):
    def test_same_format_keeps_the_original_name(self):
        self.assertEqual(
            replacement_target("/lib/a/IMG_1 [cat].JPG", "export.jpeg"),
            "/lib/a/IMG_1 [cat].JPG",
        )
        self.assertEqual(replacement_target("/lib/a/x.tif", "y.TIFF"), "/lib/a/x.tif")
        self.assertEqual(replacement_target("/lib/a/x.jpg", ""), "/lib/a/x.jpg")

    def test_new_format_keeps_the_name_with_the_new_extension(self):
        self.assertEqual(
            replacement_target("/lib/a/IMG_1 [cat].HEIC", "IMG_1.JPG"),
            "/lib/a/IMG_1 [cat].jpg",
        )

    def test_backup_keeps_the_path_below_the_scan_directory(self):
        self.user.scan_directory = self.tmpdir
        path = os.path.join(self.tmpdir, "2024", "IMG_0001.png")
        backup = backup_path(self.user, path)
        self.assertTrue(
            backup.startswith(
                os.path.join(self.media_root, BACKUP_DIRECTORY, str(self.user.id))
            )
        )
        self.assertTrue(backup.endswith(os.path.join("2024", "IMG_0001.png")))


@patch("api.photo_replace.async_task")
class ReplacePhotoFileTest(ReplacedFileTestCase):
    def setUp(self):
        super().setUp()
        self.user.scan_directory = self.tmpdir
        self.user.save()
        self.staging = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.staging, True)
        _write_image(self.path, 1)
        self.original_bytes = _read(self.path)
        self.photo = self._index()
        self.old_hash = self.photo.image_hash

    def _staged(self, seed=None, retouch=False, format="PNG"):
        """A staged upload, named like the chunked uploader names it."""
        staged = os.path.join(self.staging, "tmp")
        _write_image(staged, seed if seed is not None else 1, format=format)
        if retouch:
            with Image.open(staged) as image:
                brighter = ImageEnhance.Brightness(image.convert("RGB")).enhance(1.1)
            brighter.save(staged, format=format)
        return staged

    def _replace(self, staged, name="IMG_0001.png", photo=None):
        with self.captureOnCommitCallbacks(execute=True):
            return replace_photo_file(
                self.user, Photo.objects.get(pk=(photo or self.photo).pk), staged, name
            )

    def test_new_picture_replaces_the_file_and_keeps_the_photo(self, async_task):
        tag = Tag.objects.create(name="beach", owner=self.user)
        tag.photos.add(self.photo)
        album = AlbumUser.objects.create(title="Trip", owner=self.user)
        album.photos.add(self.photo)
        Photo.objects.filter(pk=self.photo.pk).update(rating=4)
        create_test_face(photo=self.photo, location_bottom=20, location_right=20)
        staged = self._staged(seed=2)
        new_hash = calculate_hash(self.user, staged)

        replaced, backup, kept_faces = self._replace(staged)

        self.assertEqual(replaced.pk, self.photo.pk)
        self.assertEqual(replaced.image_hash, new_hash)
        self.assertEqual(replaced.main_file.path, self.path)
        self.assertEqual(_read(self.path), _read(staged))
        self.assertEqual(_read(backup), self.original_bytes)
        self.assertFalse(kept_faces)
        self.assertEqual(replaced.faces.count(), 0)
        self.assertEqual(replaced.rating, 4)
        self.assertEqual(list(replaced.tags.all()), [tag])
        self.assertTrue(album.photos.filter(pk=replaced.pk).exists())
        self.assertTrue(os.path.exists(self._thumbnail_path(new_hash)))
        self.assertFalse(os.path.exists(self._thumbnail_path(self.old_hash)))
        self.assertEqual(replaced.size, os.path.getsize(self.path))
        async_task.assert_called_once()
        self.assertEqual(async_task.call_args.args[1:], (replaced.pk, False))

    def test_retouch_keeps_the_faces_under_the_new_hash(self, async_task):
        face = create_test_face(
            photo=self.photo,
            image=f"faces/{self.old_hash}_0.jpg",
            location_top=10,
            location_bottom=60,
            location_left=10,
            location_right=60,
        )

        replaced, _backup, kept_faces = self._replace(self._staged(retouch=True))

        self.assertTrue(kept_faces)
        face.refresh_from_db()
        self.assertEqual(face.photo_id, replaced.pk)
        self.assertTrue(face.image.name.startswith(f"faces/{replaced.image_hash}_"))
        self.assertTrue(os.path.exists(face.image.path))
        self.assertNotEqual(replaced.image_hash, self.old_hash)
        self.assertEqual(async_task.call_args.args[1:], (replaced.pk, True))

    def test_format_change_renames_the_extension_only(self, async_task):
        staged = self._staged(seed=2, format="JPEG")

        replaced, backup, _kept = self._replace(staged, name="edited.jpg")

        new_path = os.path.join(self.tmpdir, "IMG_0001.jpg")
        self.assertEqual(replaced.main_file.path, new_path)
        self.assertTrue(os.path.exists(new_path))
        self.assertFalse(os.path.exists(self.path))
        self.assertFalse(File.objects.filter(path=self.path).exists())
        self.assertTrue(backup.endswith("IMG_0001.png"))
        self.assertEqual(_read(backup), self.original_bytes)

    def test_the_same_file_is_refused(self, async_task):
        staged = os.path.join(self.staging, "tmp")
        shutil.copyfile(self.path, staged)
        with self.assertRaises(ReplaceError) as ctx:
            self._replace(staged)
        self.assertEqual(ctx.exception.status, 400)
        async_task.assert_not_called()

    def test_a_file_already_in_the_library_is_refused(self, async_task):
        other_path = os.path.join(self.tmpdir, "IMG_0002.png")
        _write_image(other_path, 3)
        self._index(other_path)
        staged = os.path.join(self.staging, "tmp")
        shutil.copyfile(other_path, staged)

        with self.assertRaises(ReplaceError) as ctx:
            self._replace(staged)

        self.assertEqual(ctx.exception.status, 409)
        self.assertEqual(_read(self.path), self.original_bytes)

    def test_a_taken_name_for_the_new_format_is_refused(self, async_task):
        taken = os.path.join(self.tmpdir, "IMG_0001.jpg")
        _write_image(taken, 4, format="JPEG")

        with self.assertRaises(ReplaceError) as ctx:
            self._replace(self._staged(seed=2, format="JPEG"), name="x.jpg")

        self.assertEqual(ctx.exception.status, 409)
        self.assertEqual(_read(self.path), self.original_bytes)

    def test_a_video_or_raw_upload_is_refused(self, async_task):
        with self.assertRaises(ReplaceError) as ctx:
            self._replace(self._staged(seed=2), name="IMG_0001.CR2")
        self.assertEqual(ctx.exception.status, 400)

    def test_a_failed_swap_puts_the_original_back(self, async_task):
        with patch("api.photo_replace.reindex_replaced_file", return_value=None):
            with self.assertRaises(ReplaceError) as ctx:
                self._replace(self._staged(seed=2))

        self.assertEqual(ctx.exception.status, 500)
        self.assertEqual(_read(self.path), self.original_bytes)
        photo = Photo.objects.get(pk=self.photo.pk)
        self.assertEqual(photo.image_hash, self.old_hash)
        async_task.assert_not_called()

    def test_a_failed_format_change_puts_the_original_back(self, async_task):
        with patch("api.photo_replace.reindex_replaced_file", return_value=None):
            with self.assertRaises(ReplaceError):
                self._replace(self._staged(seed=2, format="JPEG"), name="x.jpg")

        self.assertEqual(_read(self.path), self.original_bytes)
        self.assertFalse(os.path.exists(os.path.join(self.tmpdir, "IMG_0001.jpg")))
        self.assertEqual(Photo.objects.get(pk=self.photo.pk).main_file.path, self.path)


@patch("api.photo_replace.async_task")
@patch.object(ReplacePhotoChunkedComplete, "delete_chunked_upload")
class ReplacePhotoViewTest(ReplacedFileTestCase):
    def setUp(self):
        super().setUp()
        self.user.scan_directory = self.tmpdir
        self.user.save()
        _write_image(self.path, 1)
        self.photo = self._index()
        self.staging = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.staging, True)
        self.staged = os.path.join(self.staging, "tmp")
        _write_image(self.staged, 2)

    def _complete(self, user, photo_lookup):
        request = RequestFactory().post("/api/upload/replace/")
        request.POST = {"photo": photo_lookup, "filename": "IMG_0001.png"}
        view = ReplacePhotoChunkedComplete()
        uploaded = type("Uploaded", (), {"file": type("F", (), {"path": self.staged})})
        with (
            patch("api.views.upload.authenticate_upload_request", return_value=user),
            self.captureOnCommitCallbacks(execute=True),
        ):
            view.on_completion(uploaded, request)
        return view

    def test_replaces_by_id_and_answers_with_the_new_hash(self, delete, async_task):
        view = self._complete(self.user, str(self.photo.pk))
        photo = Photo.objects.get(pk=self.photo.pk)
        self.assertEqual(
            view.get_response_data(None, None),
            {"id": str(photo.pk), "image_hash": photo.image_hash, "kept_faces": False},
        )
        delete.assert_called_once()

    def test_another_users_photo_is_unknown(self, delete, async_task):
        with self.assertRaises(ChunkedUploadError) as ctx:
            self._complete(create_test_user(), str(self.photo.pk))
        self.assertEqual(ctx.exception.status_code, 404)
        # The staged upload is cleaned up either way.
        delete.assert_called_once()
        self.assertEqual(
            Photo.objects.get(pk=self.photo.pk).image_hash, self.photo.image_hash
        )


class RefreshReplacedPhotoTest(ReplacedFileTestCase):
    """The background half: what the ML services derived from the old pixels."""

    def setUp(self):
        super().setUp()
        _write_image(self.path, 1)
        self.photo = self._index()

    @patch("api.image_similarity.build_image_similarity_index")
    @patch("api.batch_jobs.store_clip_embeddings")
    @patch("api.photo_faces.extract_faces")
    def test_rebuilds_tags_embedding_and_faces(self, extract_faces, store, rebuild):
        from constance import config as site_config

        from api.models.photo_caption import PhotoCaption
        from api.photo_replace import refresh_replaced_photo

        Photo.objects.filter(pk=self.photo.pk).update(clip_embeddings=[0.1, 0.2])
        PhotoCaption.objects.update_or_create(
            photo=self.photo,
            defaults={"captions_json": {site_config.TAGGING_MODEL: {"tags": ["old"]}}},
        )
        with patch(
            "api.models.photo_caption.PhotoCaption.generate_tag_captions"
        ) as generate:
            refresh_replaced_photo(self.photo.pk, False)

        caption = PhotoCaption.objects.get(photo=self.photo)
        self.assertNotIn(site_config.TAGGING_MODEL, caption.captions_json)
        generate.assert_called_once()
        extract_faces.assert_called_once()
        store.assert_called_once()
        rebuild.assert_called_once()
        self.assertIsNone(Photo.objects.get(pk=self.photo.pk).clip_embeddings)

    @patch("api.photo_faces.extract_faces")
    def test_kept_faces_are_not_detected_again(self, extract_faces):
        from api.photo_replace import refresh_replaced_photo

        with patch("api.models.photo_caption.PhotoCaption.generate_tag_captions"):
            refresh_replaced_photo(self.photo.pk, True)
        extract_faces.assert_not_called()
