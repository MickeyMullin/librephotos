"""Animated GIFs and WebPs get animated grid thumbnails.

The grid only ever shows thumbnails, so a still thumbnail was a still picture
there. The grid sizes keep every frame, its delays and the loop; the big
thumbnail, which the ML services and OCR read, stays a still of the first
frame. A long animation previews its first frames. A still image, a
multi-page TIFF and a photo rotated in LibrePhotos keep still thumbnails. The photo details say
whether a photo is animated, so the lightbox can play the original.
"""

import os
import shutil
import tempfile
from unittest import mock

import pyvips
from django.test import SimpleTestCase, TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from api.perceptual_hash import calculate_hash_from_thumbnail
from api.tests.utils import create_test_photo, create_test_user
from api.thumbnails import animation_frames, create_static_thumbnails

ALL_SIZES = ["thumbnails_big", "square_thumbnails", "square_thumbnails_small"]
COLORS = ["red", "green", "blue", "white"]


class AnimatedThumbnailsTest(SimpleTestCase):
    def setUp(self):
        self.media = tempfile.mkdtemp(prefix="librephotos-anim")
        self.addCleanup(shutil.rmtree, self.media, True)
        for directory in ALL_SIZES:
            os.makedirs(os.path.join(self.media, directory))
        settings = override_settings(MEDIA_ROOT=self.media)
        settings.enable()
        self.addCleanup(settings.disable)

    def _animation(self, name, frames=4):
        path = os.path.join(self.media, name)
        images = [Image.new("RGB", (400, 300), COLORS[i % 4]) for i in range(frames)]
        images[0].save(
            path,
            save_all=True,
            append_images=images[1:],
            duration=[100 * (i + 1) for i in range(frames)],
            loop=0,
        )
        return path

    def _thumb(self, directory):
        return Image.open(os.path.join(self.media, directory, "h.webp"))

    def _assert_animated(self, frames=4):
        self.assertFalse(getattr(self._thumb("thumbnails_big"), "is_animated", False))
        for directory, height in zip(ALL_SIZES[1:], (500, 250)):
            with self.subTest(directory=directory):
                thumb = self._thumb(directory)
                self.assertTrue(getattr(thumb, "is_animated", False))
                self.assertEqual(thumb.n_frames, frames)
                # Never upscaled: the source frames are 300 high.
                self.assertEqual(thumb.size[1], min(height, 300))
                # Pillow does not report WebP frame delays; libvips does.
                path = os.path.join(self.media, directory, "h.webp")
                with open(path, "rb") as handle:
                    header = pyvips.Image.new_from_buffer(handle.read(), "")
                self.assertEqual(
                    header.get("delay"), [100 * (i + 1) for i in range(frames)]
                )

    def _assert_still(self):
        for directory in ALL_SIZES:
            with self.subTest(directory=directory):
                self.assertFalse(getattr(self._thumb(directory), "is_animated", False))

    def test_animated_webp(self):
        source = self._animation("a.webp")
        self.assertEqual(animation_frames(source), 4)
        create_static_thumbnails(source, "h", ALL_SIZES)
        self._assert_animated()

    def test_animated_gif(self):
        create_static_thumbnails(self._animation("a.gif"), "h", ALL_SIZES)
        self._assert_animated()

    def test_a_still_image_stays_still(self):
        source = os.path.join(self.media, "s.webp")
        Image.new("RGB", (400, 300), "red").save(source)
        self.assertEqual(animation_frames(source), 1)
        create_static_thumbnails(source, "h", ALL_SIZES)
        self._assert_still()

    def test_a_multi_page_tiff_is_not_an_animation(self):
        source = self._animation("pages.tif", frames=3)
        self.assertEqual(animation_frames(source), 1)
        create_static_thumbnails(source, "h", ALL_SIZES)
        self._assert_still()

    def test_a_rotated_animation_keeps_a_still_thumbnail(self):
        create_static_thumbnails(
            self._animation("a.webp"), "h", ALL_SIZES, local_orientation=6
        )
        self._assert_still()
        # Rotated: the 400x300 frame is now portrait (and never upscaled).
        self.assertEqual(self._thumb("square_thumbnails").size, (300, 400))

    def test_a_long_animation_previews_its_first_frames(self):
        with mock.patch("api.thumbnails.ANIMATED_PREVIEW_FRAMES", 3):
            create_static_thumbnails(
                self._animation("a.webp", frames=5), "h", ALL_SIZES
            )
        self._assert_animated(frames=3)

    def test_hashes_and_proportions_come_from_the_first_frame(self):
        create_static_thumbnails(self._animation("a.webp"), "h", ALL_SIZES)
        big = os.path.join(self.media, "thumbnails_big", "h.webp")
        self.assertIsNotNone(calculate_hash_from_thumbnail(big))
        self.assertEqual(Image.open(big).size, (400, 300))


class AnimatedPhotoDetailTest(TestCase):
    """The photo details say whether the lightbox should play the original."""

    def setUp(self):
        self.user = create_test_user()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.directory = tempfile.mkdtemp(prefix="librephotos-anim-detail")
        self.addCleanup(shutil.rmtree, self.directory, True)

    def _photo(self, name, frames):
        path = os.path.join(self.directory, name)
        images = [Image.new("RGB", (40, 30), COLORS[i % 4]) for i in range(frames)]
        images[0].save(path, save_all=frames > 1, append_images=images[1:])
        photo = create_test_photo(owner=self.user)
        photo.main_file.path = path
        photo.main_file.save()
        return photo

    def _animated(self, photo):
        response = self.client.get(f"/api/photos/{photo.image_hash}/")
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()["animated"]

    def test_animated_webp_and_gif(self):
        self.assertTrue(self._animated(self._photo("a.webp", 3)))
        self.assertTrue(self._animated(self._photo("a.gif", 3)))

    def test_still_images(self):
        self.assertFalse(self._animated(self._photo("s.webp", 1)))
        self.assertFalse(self._animated(self._photo("s.gif", 1)))
        self.assertFalse(self._animated(self._photo("pages.tif", 3)))
