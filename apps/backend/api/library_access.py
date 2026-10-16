"""Library members: a second account that works in another user's library.

A user whose ``User.library_owner`` is set (a "member") signs in with their
own name and password, but every API request then acts as the owner: the
authentication classes in ``api.authentication`` hand the view an *actor*,
a copy of the owner loaded for this request only. So the member sees and
edits the owner's photos, albums, tags, captions, people and uploads with no
view knowing about members at all.

Three things stay the member's own:

* their account: the paths in ``OWN_ACCOUNT_PATHS`` (profile, settings,
  password, user management) are served to the member as themselves;
* admin rights: the actor is never staff or superuser, whatever the owner is;
* favorites (ratings): the actor's ratings are the member's ``PhotoRating``
  rows, read by ``viewer_rating`` and ``favorite_q`` and written by
  ``set_member_rating``, so starring a photo does not star it for the owner.
  The owner's rating stays ``Photo.rating``, which is mirrored into the file.

The actor also carries the member's viewing preferences
(``MEMBER_PREFERENCES``), and refuses ``save()``: it holds the owner's row
with the admin flags and preferences changed in memory, and writing it back
would strip the owner's admin rights.
"""

from asgiref.local import Local
from django.conf import settings
from django.db.models import Q
from django.utils import timezone

#: Paths a member is served as themselves: their own account, settings and
#: password, and the admin user management, which they may not use anyway.
OWN_ACCOUNT_PATHS = (
    "/api/user/",
    "/api/manage/user/",
    "/api/delete/user/",
    "/api/auth/",
    "/api/accounts/",
)

#: Settings of the member's own account that still apply while they work in
#: the owner's library: how they like to view it, not how it is run.
MEMBER_PREFERENCES = ("favorite_min_rating", "default_timeline_filter")

# Who is viewing, for code that has no request at hand (serializers, mostly).
# Set by ``act_in_library`` on every authentication and cleared around every
# request by ``LibraryAccessMiddleware``. ``asgiref.local.Local`` keeps it per
# request under ASGI as well as per thread under WSGI.
_viewer = Local()


def _refuse_save(*args, **kwargs):
    raise RuntimeError(
        "A library member's request cannot save the library owner's account."
    )


def library_actor(member):
    """The owner of ``member``'s library, set up to act for ``member``.

    None when the member has no library owner, or the owner is gone or
    deactivated: the member is then just themselves.
    """
    from api.models import User

    if not member.library_owner_id or member.library_owner_id == member.pk:
        return None
    owner = User.objects.filter(pk=member.library_owner_id, is_active=True).first()
    if owner is None:
        return None
    owner.is_staff = False
    owner.is_superuser = False
    for field in MEMBER_PREFERENCES:
        setattr(owner, field, getattr(member, field))
    owner.library_member = member
    owner.save = _refuse_save
    return owner


def is_own_account_path(path):
    return any(path.startswith(prefix) for prefix in OWN_ACCOUNT_PATHS)


def act_in_library(request, result):
    """An authenticator's ``(user, auth)`` result, with a member turned into
    their library actor; None stays None."""
    clear_viewer()
    if result is None:
        return None
    user, auth = result
    if not getattr(user, "library_owner_id", None):
        return result
    if is_own_account_path(request.path):
        return result
    actor = library_actor(user)
    if actor is None:
        return result
    _viewer.member = user
    return actor, auth


def library_member(user):
    """The member ``user`` acts for, when ``user`` is a library actor."""
    return getattr(user, "library_member", None)


def current_member():
    """The member the current request acts for, or None."""
    return getattr(_viewer, "member", None)


def clear_viewer():
    _viewer.member = None
    _viewer.ratings = None


def _member_ratings(member):
    ratings = getattr(_viewer, "ratings", None)
    if ratings is None:
        from api.models import PhotoRating

        ratings = dict(
            PhotoRating.objects.filter(user=member).values_list("photo_id", "rating")
        )
        _viewer.ratings = ratings
    return ratings


def viewer_rating(photo_id, owner_rating):
    """The rating the current viewer gave the photo: ``owner_rating`` (the
    photo's own) unless a library member is viewing, then the member's."""
    member = current_member()
    if member is None:
        return owner_rating
    return _member_ratings(member).get(photo_id, 0)


def viewer_rating_of(photo):
    """``viewer_rating`` for a Photo instance."""
    if current_member() is None:
        return photo.rating
    return viewer_rating(photo.pk, photo.rating)


def favorite_min_rating(user):
    return getattr(user, "favorite_min_rating", settings.DEFAULT_FAVORITE_MIN_RATING)


def favorite_q(user, prefix=""):
    """A ``Q`` on Photo (or through ``prefix``) matching ``user``'s
    favorites: by ``Photo.rating``, or by a library member's own ratings."""
    member = library_member(user)
    min_rating = favorite_min_rating(user)
    if member is None:
        return Q(**{f"{prefix}rating__gte": min_rating})
    from api.models import PhotoRating

    return Q(
        **{
            f"{prefix}id__in": PhotoRating.objects.filter(
                user=member, rating__gte=min_rating
            ).values("photo_id")
        }
    )


def set_member_rating(member, photo_ids, rating):
    """Give ``member``'s rating ``rating`` to the photos; 0 removes it.

    The photos' ``last_modified`` moves too, so delta sync sends the change.
    """
    from api.models import Photo, PhotoRating

    photo_ids = list(photo_ids)
    if not photo_ids:
        return
    now = timezone.now()
    if rating:
        PhotoRating.objects.bulk_create(
            [
                PhotoRating(
                    photo_id=photo_id, user=member, rating=rating, last_modified=now
                )
                for photo_id in photo_ids
            ],
            update_conflicts=True,
            unique_fields=["photo", "user"],
            update_fields=["rating", "last_modified"],
        )
    else:
        PhotoRating.objects.filter(user=member, photo_id__in=photo_ids).delete()
    Photo.objects.filter(id__in=photo_ids).update(last_modified=now)
    _viewer.ratings = None


class LibraryAccessMiddleware:
    """Forget the viewer around every request, so a request that is never
    authenticated (a public page) cannot see the previous one's member."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        clear_viewer()
        try:
            return self.get_response(request)
        finally:
            clear_viewer()
