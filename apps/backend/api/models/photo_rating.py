from django.db import models

from api.models.photo import Photo
from api.models.user import User


class PhotoRating(models.Model):
    """A library member's own rating of a photo in the library they share.

    Favorites are ratings (at least ``User.favorite_min_rating``), and they
    are per account: a member starring a photo must not star it for the
    owner. The owner's rating stays ``Photo.rating``, which is mirrored into
    the file's metadata; members' ratings live here and never touch the file.
    See api.library_access.
    """

    photo = models.ForeignKey(Photo, on_delete=models.CASCADE, related_name="ratings")
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="photo_ratings"
    )
    rating = models.IntegerField(default=0)
    last_modified = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["photo", "user"], name="unique_photo_rating_per_user"
            )
        ]
