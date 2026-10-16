from rest_framework import serializers

from api.library_access import viewer_rating_of
from api.models import Photo, User


class ViewerRatingField(serializers.IntegerField):
    """A photo's rating as the viewer sees it: a library member sees their
    own rating, everyone else ``Photo.rating`` (api.library_access).

    Written, it lands in ``validated_data["rating"]`` like a plain field; a
    serializer that accepts it sends a member's to their own rating.
    """

    def get_attribute(self, instance):
        return instance

    def to_representation(self, photo):
        return viewer_rating_of(photo)


class PhotoSuperSimpleSerializer(serializers.ModelSerializer):
    rating = ViewerRatingField(read_only=True)

    class Meta:
        model = Photo
        fields = ("image_hash", "rating", "hidden", "exif_timestamp", "public", "video")


class PhotoSimpleSerializer(serializers.ModelSerializer):
    square_thumbnail = serializers.SerializerMethodField()
    rating = ViewerRatingField(read_only=True)

    class Meta:
        model = Photo
        fields = (
            "id",
            "square_thumbnail",
            "image_hash",
            "exif_timestamp",
            "exif_gps_lat",
            "exif_gps_lon",
            "rating",
            "geolocation_json",
            "public",
            "video",
        )

    def get_square_thumbnail(self, obj) -> str:
        return (
            obj.thumbnail.square_thumbnail.url
            if obj.thumbnail and obj.thumbnail.square_thumbnail
            else ""
        )


class SimpleUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "first_name",
            "last_name",
        )
