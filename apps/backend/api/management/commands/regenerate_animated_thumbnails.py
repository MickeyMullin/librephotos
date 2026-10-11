from django.core.management.base import BaseCommand
from django.db.models import Q

from api.models import Photo, Thumbnail
from api.thumbnails import animation_frames


class Command(BaseCommand):
    help = (
        "Rebuild the thumbnails of animated GIFs and WebPs indexed before they "
        "got animated thumbnails, so they move in the grid and the lightbox. "
        "Thumbnails are only made when missing, so these kept their still ones."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Only list the animated photos that would be rebuilt",
        )

    def handle(self, *args, **options):
        candidates = (
            Photo.objects.filter(video=False, removed=False, main_file__isnull=False)
            .filter(
                Q(main_file__path__iendswith=".gif")
                | Q(main_file__path__iendswith=".webp")
            )
            .select_related("main_file")
        )
        rebuilt = failed = animated = 0
        for photo in candidates.iterator():
            if animation_frames(photo.main_file.path) < 2:
                continue
            animated += 1
            if options["dry_run"]:
                self.stdout.write(photo.main_file.path)
                continue
            try:
                thumbnail, _ = Thumbnail.objects.get_or_create(photo=photo)
                thumbnail._regenerate_thumbnails()
                rebuilt += 1
            except Exception as error:
                failed += 1
                self.stderr.write(f"{photo.main_file.path}: {error}")
        if options["dry_run"]:
            self.stdout.write(f"{animated} animated photos would be rebuilt.")
            return
        self.stdout.write(
            self.style.SUCCESS(f"Rebuilt {rebuilt} animated photos, {failed} failed.")
        )
