"""Dismissing a wrong auto tag from a photo (POST /api/photosedit/autotag/).

* the tag leaves every tagging model's list, its thing album and search,
* it is remembered, so the tagger does not put it back on a later run,
* Undo restores it to the active model's list and album,
* only the owner's photos.
"""

from unittest.mock import MagicMock, patch

from constance import config as site_config
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import PhotoCaption
from api.models.album_thing import AlbumThing
from api.models.photo_caption import DISMISSED_TAGS_KEY, tag_thing_type
from api.models.photo_search import PhotoSearch
from api.tests.utils import create_test_photo, create_test_user


class DismissAutoTagTest(TestCase):
    def setUp(self):
        self.user = create_test_user()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.photo = create_test_photo(owner=self.user)
        self.model = site_config.TAGGING_MODEL
        self.caption = PhotoCaption.objects.create(
            photo=self.photo,
            captions_json={
                self.model: {"tags": ["beach", "cat", "sunset"]},
                "other_model": {"tags": ["cat", "dog"]},
                "user_caption": "a cat on the beach",
            },
        )
        self.caption._attach_photo_to_album_things(
            ["beach", "cat", "sunset"], tag_thing_type(self.model)
        )
        self.caption.recreate_search_captions()

    def _post(self, data):
        return self.client.post("/api/photosedit/autotag/", data, format="json")

    def _album(self, title, model=None):
        return AlbumThing.objects.get(
            owner=self.user, title=title, thing_type=tag_thing_type(model or self.model)
        )

    def test_dismiss_removes_the_tag_everywhere(self):
        response = self._post({"photo": str(self.photo.pk), "tag": "cat"})

        self.assertEqual(response.status_code, 200, response.content)
        self.caption.refresh_from_db()
        captions = self.caption.captions_json
        self.assertEqual(captions[self.model]["tags"], ["beach", "sunset"])
        self.assertEqual(captions["other_model"]["tags"], ["dog"])
        self.assertEqual(captions[DISMISSED_TAGS_KEY], ["cat"])
        self.assertEqual(captions["user_caption"], "a cat on the beach")
        self.assertFalse(self._album("cat").photos.filter(pk=self.photo.pk).exists())
        self.assertTrue(self._album("beach").photos.filter(pk=self.photo.pk).exists())
        search = PhotoSearch.objects.get(photo=self.photo).search_captions
        self.assertIn("sunset", search)
        self.assertNotIn(" cat ", f" {search} ".replace("a cat on", ""))
        self.assertEqual(response.json()["captions_json"], captions)

    def test_the_tagger_does_not_put_a_dismissed_tag_back(self):
        self.caption.dismiss_auto_tag("cat")
        self.caption.captions_json.pop(self.model)
        self.caption.save()

        response = MagicMock(ok=True)
        # The service wraps the model's result: {"tags": {"tags": [...]}}.
        response.json.return_value = {"tags": {"tags": ["cat", "beach", "dune"]}}
        with patch("api.sidecars.http.post", return_value=response):
            self.caption.generate_tag_captions(commit=True)

        self.caption.refresh_from_db()
        self.assertEqual(
            self.caption.captions_json[self.model]["tags"], ["beach", "dune"]
        )
        self.assertFalse(self._album("cat").photos.filter(pk=self.photo.pk).exists())

    def test_undo_restores_the_tag(self):
        self._post({"photo": self.photo.image_hash, "tag": "cat"})
        response = self._post(
            {"photo": self.photo.image_hash, "tag": "cat", "dismissed": False}
        )

        self.assertEqual(response.status_code, 200)
        self.caption.refresh_from_db()
        self.assertIn("cat", self.caption.captions_json[self.model]["tags"])
        self.assertNotIn(DISMISSED_TAGS_KEY, self.caption.captions_json)
        self.assertTrue(self._album("cat").photos.filter(pk=self.photo.pk).exists())

    def test_another_users_photo_is_not_found(self):
        other = APIClient()
        other.force_authenticate(user=create_test_user())
        response = other.post(
            "/api/photosedit/autotag/",
            {"photo": str(self.photo.pk), "tag": "cat"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
        self.caption.refresh_from_db()
        self.assertIn("cat", self.caption.captions_json[self.model]["tags"])

    def test_tag_is_required(self):
        self.assertEqual(self._post({"photo": str(self.photo.pk)}).status_code, 400)
        self.assertEqual(
            self._post({"photo": str(self.photo.pk), "tag": "  "}).status_code, 400
        )
