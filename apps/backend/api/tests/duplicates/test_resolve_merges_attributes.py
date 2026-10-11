"""Resolving a duplicate group keeps what the user gave the discarded copies.

The kept copy receives their tags, user albums (locked ones too), the highest
rating, their captions, their dismissed auto tags and their shares, and loses
nothing it already had.
"""

from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from api.models import AlbumUser, Duplicate, Photo, PhotoCaption, Tag
from api.models.photo_caption import DISMISSED_TAGS_KEY
from api.tests.utils import create_test_photo, create_test_user


class ResolveMergesAttributesTest(TestCase):
    def setUp(self):
        self.user = create_test_user()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.kept = create_test_photo(owner=self.user, rating=1)
        self.copy = create_test_photo(owner=self.user, rating=5)
        self.other_copy = create_test_photo(owner=self.user, rating=3)
        self.duplicate = Duplicate.objects.create(
            owner=self.user, duplicate_type=Duplicate.DuplicateType.EXACT_COPY
        )
        self.duplicate.photos.add(self.kept, self.copy, self.other_copy)

    def _resolve(self):
        with patch("api.duplicate_merge.queue_rating_write") as queue:
            response = self.client.post(
                f"/api/duplicates/{self.duplicate.id}/resolve/",
                {"keep_photo_hash": self.kept.image_hash},
            )
        self.assertEqual(response.status_code, 200, response.content)
        self.kept.refresh_from_db()
        return queue

    def test_tags_move_to_the_kept_copy(self):
        beach = Tag.objects.create(name="beach", owner=self.user)
        dog = Tag.objects.create(name="dog", owner=self.user)
        own = Tag.objects.create(name="own", owner=self.user)
        beach.photos.add(self.copy)
        dog.photos.add(self.other_copy, self.kept)
        own.photos.add(self.kept)

        self._resolve()

        self.assertEqual(
            set(self.kept.tags.values_list("name", flat=True)), {"beach", "dog", "own"}
        )
        beach.refresh_from_db()
        # The trashed copy no longer counts; the kept one does.
        self.assertEqual(beach.photo_count, 1)

    def test_albums_keep_the_picture_even_when_locked(self):
        trip = AlbumUser.objects.create(title="Trip", owner=self.user)
        trip.photos.add(self.copy)
        best = AlbumUser.objects.create(title="Best", owner=self.user, locked=True)
        best.photos.add(self.other_copy)

        self._resolve()

        self.assertTrue(trip.photos.filter(pk=self.kept.pk).exists())
        self.assertTrue(best.photos.filter(pk=self.kept.pk).exists())

    def test_the_highest_rating_wins_and_is_written_like_a_favorite(self):
        queue = self._resolve()
        self.assertEqual(self.kept.rating, 5)
        queue.assert_called_once_with(self.user, [self.kept.pk])

    def test_a_lower_rating_never_replaces_the_kept_one(self):
        Photo.objects.filter(pk=self.kept.pk).update(rating=5)
        Photo.objects.filter(pk=self.copy.pk).update(rating=2)
        Photo.objects.filter(pk=self.other_copy.pk).update(rating=0)
        queue = self._resolve()
        self.assertEqual(self.kept.rating, 5)
        queue.assert_not_called()

    def test_captions_are_kept_and_joined(self):
        PhotoCaption.objects.create(
            photo=self.kept, captions_json={"user_caption": "At the lake"}
        )
        PhotoCaption.objects.create(
            photo=self.copy, captions_json={"user_caption": "Summer #trip"}
        )
        PhotoCaption.objects.create(
            photo=self.other_copy, captions_json={"user_caption": "At the lake"}
        )

        self._resolve()

        caption = PhotoCaption.objects.get(photo=self.kept).captions_json
        self.assertEqual(caption["user_caption"], "At the lake\n\nSummer #trip")

    def test_a_caption_fills_an_empty_one(self):
        PhotoCaption.objects.create(
            photo=self.copy, captions_json={"user_caption": "Summer"}
        )
        self._resolve()
        caption = PhotoCaption.objects.get(photo=self.kept).captions_json
        self.assertEqual(caption["user_caption"], "Summer")

    def test_dismissed_auto_tags_stay_dismissed(self):
        PhotoCaption.objects.create(
            photo=self.kept, captions_json={"mobileclip_s2": {"tags": ["cat", "sky"]}}
        )
        PhotoCaption.objects.create(
            photo=self.copy, captions_json={DISMISSED_TAGS_KEY: ["cat"]}
        )

        self._resolve()

        captions = PhotoCaption.objects.get(photo=self.kept).captions_json
        self.assertEqual(captions[DISMISSED_TAGS_KEY], ["cat"])
        self.assertEqual(captions["mobileclip_s2"]["tags"], ["sky"])

    def test_shares_and_public_carry_over(self):
        friend = create_test_user()
        self.copy.shared_to.add(friend)
        Photo.objects.filter(pk=self.other_copy.pk).update(public=True)

        self._resolve()

        self.assertTrue(self.kept.public)
        self.assertEqual(list(self.kept.shared_to.all()), [friend])

    def test_another_users_tags_are_left_alone(self):
        stranger = create_test_user()
        theirs = Tag.objects.create(name="theirs", owner=stranger)
        theirs.photos.add(self.copy)
        self._resolve()
        self.assertFalse(self.kept.tags.exists())

    def test_the_other_copies_are_still_trashed(self):
        self._resolve()
        self.copy.refresh_from_db()
        self.other_copy.refresh_from_db()
        self.assertTrue(self.copy.in_trashcan)
        self.assertTrue(self.other_copy.in_trashcan)
        self.assertFalse(self.kept.in_trashcan)
