"""Search by tags (GET /api/tags/photos/).

* all: every tag on the same photo; any: at least one,
* exclude takes photos out, and works on its own,
* only the user's own tags and photos; hidden and trashed photos stay out,
* tagged (the page's "*") keeps only photos with at least one of the
  user's tags, alone or with the rest,
* an empty search is empty, and a deleted tag in an "all" search matches
  nothing instead of widening it.
"""

from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Tag
from api.tests.utils import create_test_photo, create_test_user


class TagSearchTest(TestCase):
    def setUp(self):
        self.user = create_test_user()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.beach = Tag.objects.create(name="beach", owner=self.user)
        self.dog = Tag.objects.create(name="dog", owner=self.user)
        self.night = Tag.objects.create(name="night", owner=self.user)
        self.beach_dog = create_test_photo(owner=self.user)
        self.beach_only = create_test_photo(owner=self.user)
        self.dog_night = create_test_photo(owner=self.user)
        self.untagged = create_test_photo(owner=self.user)
        self.beach.photos.add(self.beach_dog, self.beach_only)
        self.dog.photos.add(self.beach_dog, self.dog_night)
        self.night.photos.add(self.dog_night)

    def _search(self, **params):
        response = self.client.get("/api/tags/photos/", params)
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()["results"]

    def _hashes(self, results):
        return {
            item["image_hash"]
            for group in results["grouped_photos"]
            for item in group["items"]
        }

    def test_all_wants_every_tag_on_the_same_photo(self):
        results = self._search(tags=f"{self.beach.id},{self.dog.id}")
        self.assertEqual(self._hashes(results), {self.beach_dog.image_hash})
        self.assertEqual(results["match"], "all")
        self.assertEqual(
            results["tags"],
            [
                {"id": self.beach.id, "name": "beach"},
                {"id": self.dog.id, "name": "dog"},
            ],
        )

    def test_any_wants_at_least_one(self):
        results = self._search(tags=f"{self.beach.id},{self.night.id}", match="any")
        self.assertEqual(
            self._hashes(results),
            {
                self.beach_dog.image_hash,
                self.beach_only.image_hash,
                self.dog_night.image_hash,
            },
        )

    def test_any_lists_a_photo_once(self):
        results = self._search(tags=f"{self.beach.id},{self.dog.id}", match="any")
        items = [i for g in results["grouped_photos"] for i in g["items"]]
        self.assertEqual(len(items), len({i["image_hash"] for i in items}))

    def test_exclude(self):
        results = self._search(tags=str(self.dog.id), exclude=str(self.night.id))
        self.assertEqual(self._hashes(results), {self.beach_dog.image_hash})
        self.assertEqual(results["excluded"], [{"id": self.night.id, "name": "night"}])

    def test_exclude_alone_searches_the_rest_of_the_library(self):
        results = self._search(exclude=str(self.beach.id))
        self.assertEqual(
            self._hashes(results),
            {self.dog_night.image_hash, self.untagged.image_hash},
        )

    def test_tagged_alone_is_every_tagged_photo(self):
        results = self._search(tagged="true")
        self.assertTrue(results["tagged"])
        self.assertEqual(
            self._hashes(results),
            {
                self.beach_dog.image_hash,
                self.beach_only.image_hash,
                self.dog_night.image_hash,
            },
        )
        items = [i for g in results["grouped_photos"] for i in g["items"]]
        self.assertEqual(len(items), 3)

    def test_tagged_with_exclude_is_tagged_photos_missing_a_tag(self):
        # Unlike exclude alone, the untagged photo stays out.
        results = self._search(tagged="true", exclude=str(self.beach.id))
        self.assertEqual(self._hashes(results), {self.dog_night.image_hash})

    def test_tagged_narrows_the_other_tags_too(self):
        results = self._search(tagged="true", tags=str(self.dog.id))
        self.assertEqual(
            self._hashes(results),
            {self.beach_dog.image_hash, self.dog_night.image_hash},
        )
        self.assertFalse(self._search(tags=str(self.dog.id))["tagged"])

    def test_tagged_counts_only_the_users_own_tags(self):
        other = create_test_user()
        theirs = Tag.objects.create(name="seen", owner=other)
        theirs.photos.add(self.untagged)
        results = self._search(tagged="true")
        self.assertNotIn(self.untagged.image_hash, self._hashes(results))

    def test_an_empty_search_is_empty(self):
        self.assertEqual(self._hashes(self._search()), set())
        self.assertEqual(self._hashes(self._search(tags="x,,y")), set())

    def test_a_missing_tag_narrows_an_all_search_to_nothing(self):
        results = self._search(tags=f"{self.beach.id},999999")
        self.assertEqual(self._hashes(results), set())

    def test_hidden_and_trashed_photos_stay_out(self):
        self.beach_only.hidden = True
        self.beach_only.save()
        self.beach_dog.in_trashcan = True
        self.beach_dog.save()
        self.assertEqual(self._hashes(self._search(tags=str(self.beach.id))), set())

    def test_another_users_tags_and_photos_do_not_count(self):
        other = create_test_user()
        theirs = Tag.objects.create(name="beach", owner=other)
        their_photo = create_test_photo(owner=other)
        theirs.photos.add(their_photo)

        self.assertEqual(self._hashes(self._search(tags=str(theirs.id))), set())
        client = APIClient()
        client.force_authenticate(user=other)
        response = client.get("/api/tags/photos/", {"tags": str(self.beach.id)})
        hashes = {
            i["image_hash"]
            for g in response.json()["results"]["grouped_photos"]
            for i in g["items"]
        }
        self.assertEqual(hashes, set())

    def test_media_type_filter(self):
        video = create_test_photo(owner=self.user, video=True)
        self.beach.photos.add(video)
        results = self._search(tags=str(self.beach.id), video="true")
        self.assertEqual(self._hashes(results), {video.image_hash})
