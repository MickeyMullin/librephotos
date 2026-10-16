"""A library member works in another user's library (api.library_access).

These tests authenticate with real tokens: ``force_authenticate`` skips the
authentication classes, which is where a member becomes the library actor.
"""

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from api.duplicate_merge import merge_into_kept
from api.library_access import favorite_q, library_actor
from api.models import AlbumDate, Photo, PhotoRating
from api.tests.utils import create_test_photo, create_test_user


def bearer_client(user):
    client = APIClient()
    token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


def cookie_client(user):
    client = APIClient()
    client.cookies["jwt"] = str(RefreshToken.for_user(user).access_token)
    return client


class LibraryMemberTestCase(TestCase):
    def setUp(self):
        self.owner = create_test_user(is_admin=True, favorite_min_rating=4)
        self.member = create_test_user(library_owner=self.owner, favorite_min_rating=3)
        now = timezone.now()
        self.photo = create_test_photo(owner=self.owner, exif_timestamp=now)
        self.photo.files.add(self.photo.main_file)
        self.day = AlbumDate.objects.create(owner=self.owner, date=now.date())
        self.day.photos.add(self.photo)


class LibraryAccessTest(LibraryMemberTestCase):
    def test_member_reads_the_owners_private_photo(self):
        response = bearer_client(self.member).get(f"/api/photos/{self.photo.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["owner"]["id"], self.owner.id)

    def test_member_edits_the_owners_photos(self):
        response = bearer_client(self.member).post(
            "/api/photosedit/hide/",
            {"image_hashes": [self.photo.image_hash], "hidden": True},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.photo.refresh_from_db()
        self.assertTrue(self.photo.hidden)

    def test_member_gets_the_owners_media(self):
        response = cookie_client(self.member).get(
            f"/media/thumbnails_big/{self.photo.image_hash}"
        )
        self.assertEqual(response.status_code, 200)

    def test_without_the_link_the_photo_stays_private(self):
        stranger = create_test_user()
        response = bearer_client(stranger).get(f"/api/photos/{self.photo.id}/")
        self.assertEqual(response.status_code, 404)

    def test_member_is_never_admin(self):
        response = bearer_client(self.member).get("/api/manage/user/")
        self.assertEqual(response.status_code, 403)
        actor = library_actor(self.member)
        self.assertFalse(actor.is_staff)
        self.assertFalse(actor.is_superuser)

    def test_actor_cannot_be_saved(self):
        actor = library_actor(self.member)
        with self.assertRaises(RuntimeError):
            actor.save()
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.is_superuser)

    def test_member_keeps_their_own_account(self):
        client = bearer_client(self.member)
        response = client.get(f"/api/user/{self.member.id}/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["username"], self.member.username)
        self.assertEqual(data["library_owner"]["id"], self.owner.id)

        response = client.patch(
            f"/api/user/{self.member.id}/", {"first_name": "Changed"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.member.refresh_from_db()
        self.owner.refresh_from_db()
        self.assertEqual(self.member.first_name, "Changed")
        self.assertNotEqual(self.owner.first_name, "Changed")

    def test_member_cannot_change_the_owners_account(self):
        response = bearer_client(self.member).patch(
            f"/api/user/{self.owner.id}/", {"first_name": "Changed"}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_deactivated_owner_leaves_the_member_on_their_own(self):
        self.owner.is_active = False
        self.owner.save()
        self.assertIsNone(library_actor(self.member))
        response = bearer_client(self.member).get(f"/api/photos/{self.photo.id}/")
        self.assertEqual(response.status_code, 404)


class LibraryMemberFavoritesTest(LibraryMemberTestCase):
    def favorite(self, user, value=True):
        return bearer_client(user).post(
            "/api/photosedit/favorite/",
            {"image_hashes": [self.photo.image_hash], "favorite": value},
            format="json",
        )

    def rating_seen_by(self, user):
        response = bearer_client(user).get(f"/api/photos/{self.photo.id}/")
        self.assertEqual(response.status_code, 200)
        return response.json()["rating"]

    def test_member_favorite_is_their_own(self):
        response = self.favorite(self.member)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["updated_hashes"], [self.photo.image_hash])

        self.photo.refresh_from_db()
        self.assertEqual(self.photo.rating, 0)
        self.assertEqual(
            PhotoRating.objects.get(photo=self.photo, user=self.member).rating, 3
        )
        self.assertEqual(self.rating_seen_by(self.member), 3)
        self.assertEqual(self.rating_seen_by(self.owner), 0)

    def test_member_rating_edit_is_their_own(self):
        response = bearer_client(self.member).patch(
            f"/api/photos/{self.photo.id}/", {"rating": 5}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["rating"], 5)
        self.photo.refresh_from_db()
        self.assertEqual(self.photo.rating, 0)
        self.assertEqual(self.rating_seen_by(self.owner), 0)

    def test_owner_rating_edit_is_the_photos(self):
        response = bearer_client(self.owner).patch(
            f"/api/photos/{self.photo.id}/", {"rating": 5}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.photo.refresh_from_db()
        self.assertEqual(self.photo.rating, 5)
        self.assertEqual(self.rating_seen_by(self.member), 0)

    def test_owner_favorite_is_not_the_members(self):
        self.favorite(self.owner)
        self.photo.refresh_from_db()
        self.assertEqual(self.photo.rating, 4)
        self.assertEqual(self.rating_seen_by(self.member), 0)
        self.assertFalse(PhotoRating.objects.exists())

    def test_member_unfavorite(self):
        self.favorite(self.member)
        response = self.favorite(self.member, value=False)
        self.assertEqual(response.json()["updated_hashes"], [self.photo.image_hash])
        self.assertFalse(PhotoRating.objects.exists())

    def test_favorite_filter_follows_the_viewer(self):
        self.favorite(self.member)
        actor = library_actor(self.member)
        self.assertEqual(Photo.objects.filter(favorite_q(actor)).count(), 1)
        self.assertEqual(Photo.objects.filter(favorite_q(self.owner)).count(), 0)

    def test_favorites_timeline(self):
        self.favorite(self.member)
        for user, expected in ((self.member, 1), (self.owner, 0)):
            with self.subTest(user=user.username):
                response = bearer_client(user).get(
                    "/api/albums/date/list/?favorite=true"
                )
                self.assertEqual(response.status_code, 200)
                count = sum(day["numberOfItems"] for day in response.json()["results"])
                self.assertEqual(count, expected)

    def test_grid_shows_the_viewers_rating(self):
        self.favorite(self.member)
        for user, expected in ((self.member, 3), (self.owner, 0)):
            with self.subTest(user=user.username):
                response = bearer_client(user).get(f"/api/albums/date/{self.day.id}/")
                self.assertEqual(response.status_code, 200)
                items = response.json()["results"]["items"]
                self.assertEqual([item["rating"] for item in items], [expected])

    def test_member_threshold_is_their_own(self):
        PhotoRating.objects.create(photo=self.photo, user=self.member, rating=3)
        actor = library_actor(self.member)
        self.assertEqual(actor.favorite_min_rating, 3)
        self.assertEqual(Photo.objects.filter(favorite_q(actor)).count(), 1)

    def test_resolving_duplicates_keeps_member_ratings(self):
        other = create_test_photo(owner=self.owner)
        PhotoRating.objects.create(photo=other, user=self.member, rating=5)
        merge_into_kept(self.photo, [other])
        self.assertEqual(
            PhotoRating.objects.get(photo=self.photo, user=self.member).rating, 5
        )


class ManageLibraryOwnerTest(TestCase):
    def setUp(self):
        self.admin = create_test_user(is_admin=True)
        self.user = create_test_user()
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def set_owner(self, user, owner):
        return self.client.patch(
            f"/api/manage/user/{user.id}/",
            {"library_owner": owner.id if owner else None},
            format="json",
        )

    def test_admin_links_and_unlinks(self):
        response = self.set_owner(self.user, self.admin)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["library_owner"], self.admin.id)
        self.user.refresh_from_db()
        self.assertEqual(self.user.library_owner, self.admin)

        response = self.set_owner(self.user, None)
        self.assertEqual(response.status_code, 200, response.content)
        self.user.refresh_from_db()
        self.assertIsNone(self.user.library_owner)

    def test_not_their_own_library(self):
        response = self.set_owner(self.user, self.user)
        self.assertEqual(response.status_code, 400)

    def test_no_chains(self):
        third = create_test_user()
        self.set_owner(self.user, self.admin)
        with self.subTest("owner is a member elsewhere"):
            self.assertEqual(self.set_owner(third, self.user).status_code, 400)
        with self.subTest("member has members"):
            self.assertEqual(self.set_owner(self.admin, third).status_code, 400)

    def test_only_admins(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.patch(
            f"/api/manage/user/{self.user.id}/",
            {"library_owner": self.admin.id},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
