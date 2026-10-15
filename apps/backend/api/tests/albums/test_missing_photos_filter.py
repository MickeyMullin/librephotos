"""``missing=true`` on the date-album list and detail and in select-all queries.

The Missing photos page lists the photos whose file is gone (no file linked),
whether or not they are hidden or in the trash, which no other view does.
Select-all on it must act on exactly those, and permanent deletion, which
forces ``in_trashcan``, only on the trashed ones.
"""

import datetime

from django.test import TestCase
from rest_framework.test import APIClient

from api.models.album_date import AlbumDate
from api.tests.utils import create_test_photo, create_test_user
from api.views.photo_filters import build_photo_queryset


def present(**kwargs):
    photo = create_test_photo(**kwargs)
    photo.files.add(photo.main_file)
    return photo


def missing(**kwargs):
    photo = create_test_photo(**kwargs)
    photo.main_file = None
    photo.save()
    return photo


class MissingPhotosFilterTest(TestCase):
    def setUp(self):
        self.user = create_test_user()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.here = present(owner=self.user)
        self.gone = missing(owner=self.user)
        self.gone_trashed = missing(owner=self.user, in_trashcan=True)
        self.gone_hidden = missing(owner=self.user, hidden=True)
        self.album = AlbumDate.objects.create(
            owner=self.user, date=datetime.date(2024, 7, 14)
        )
        self.album.photos.add(self.here, self.gone, self.gone_trashed, self.gone_hidden)

        other = create_test_user()
        theirs = missing(owner=other)
        their_album = AlbumDate.objects.create(
            owner=other, date=datetime.date(2024, 7, 14)
        )
        their_album.photos.add(theirs)

    def _detail_hashes(self, **params):
        response = self.client.get(f"/api/albums/date/{self.album.id}/", params)
        self.assertEqual(response.status_code, 200, response.content)
        return {item["image_hash"] for item in response.json()["results"]["items"]}

    def test_the_list_counts_missing_photos_wherever_they_are(self):
        response = self.client.get("/api/albums/date/list/", {"missing": "true"})
        self.assertEqual(response.status_code, 200, response.content)
        albums = response.json()["results"]
        self.assertEqual([album["id"] for album in albums], [str(self.album.id)])
        self.assertEqual(albums[0]["numberOfItems"], 3)

    def test_a_day_lists_its_missing_photos(self):
        self.assertEqual(
            self._detail_hashes(missing="true"),
            {
                self.gone.image_hash,
                self.gone_trashed.image_hash,
                self.gone_hidden.image_hash,
            },
        )

    def test_without_missing_the_views_are_unchanged(self):
        # The timeline still shows a missing photo that is neither hidden nor
        # trashed, as before.
        self.assertEqual(
            self._detail_hashes(), {self.here.image_hash, self.gone.image_hash}
        )
        self.assertEqual(
            self._detail_hashes(in_trashcan="true"), {self.gone_trashed.image_hash}
        )

    def test_select_all_takes_the_same_photos(self):
        photos = build_photo_queryset(self.user, {"missing": True})
        self.assertEqual(
            set(photos.values_list("pk", flat=True)),
            {self.gone.pk, self.gone_trashed.pk, self.gone_hidden.pk},
        )

    def test_permanent_deletion_only_reaches_the_trashed_ones(self):
        photos = build_photo_queryset(self.user, {"missing": True, "in_trashcan": True})
        self.assertEqual(
            set(photos.values_list("pk", flat=True)), {self.gone_trashed.pk}
        )
