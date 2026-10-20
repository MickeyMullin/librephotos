"""Recovery for django-q ORM leases stranded by a database interruption.

The ORM broker leases a task by setting ``OrmQ.lock`` to ``now + retry``.
LibrePhotos deliberately uses a very long retry window for heavy work, so a
worker that loses its database connection after leasing work cannot be relied
on to make that task runnable soon.  At backend startup no old worker remains;
recovering those leases must fail the affected visible job and remove only its
associated queued work.
"""

import uuid
from datetime import timedelta

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from django_q.conf import Conf
from django_q.models import OrmQ
from django_q.signing import SignedPackage

from api.batch_jobs import batch_calculate_clip_embedding
from api.directory_watcher.processing_jobs import generate_tag_job
from api.models import LongRunningJob
from api.tests.utils import create_test_user


def untracked_task():
    """A queued maintenance task with no LongRunningJob row."""


class RecoverInterruptedJobsTest(TestCase):
    def setUp(self):
        self.user = create_test_user()
        self.other_user = create_test_user()

    def job(self, *, user=None, job_type=LongRunningJob.JOB_GENERATE_TAGS):
        return LongRunningJob.create_job(
            user=user or self.user,
            job_type=job_type,
            job_id=uuid.uuid4(),
            start_now=True,
        )

    def queued_task(self, func, *args, locked=False, **kwargs):
        return OrmQ.objects.create(
            key=Conf.CLUSTER_NAME,
            lock=(
                timezone.now() + timedelta(days=1)
                if locked
                else timezone.now() - timedelta(seconds=1)
            ),
            payload=SignedPackage.dumps(
                {"id": str(uuid.uuid4()), "func": func, "args": args, "kwargs": kwargs}
            ),
        )

    def test_recovers_a_leased_job_and_deletes_only_its_tasks(self):
        interrupted = self.job()
        unrelated = self.job(user=self.other_user)
        leased = self.queued_task(generate_tag_job, 1, interrupted.job_id, locked=True)
        queued_child = self.queued_task(generate_tag_job, 2, interrupted.job_id)
        unrelated_task = self.queued_task(generate_tag_job, 3, unrelated.job_id)

        recovered = LongRunningJob.recover_interrupted_jobs()

        self.assertEqual(recovered, 1)
        interrupted.refresh_from_db()
        self.assertTrue(interrupted.finished)
        self.assertTrue(interrupted.failed)
        self.assertIn("database interruption", interrupted.result["error"])
        self.assertFalse(OrmQ.objects.filter(pk=leased.pk).exists())
        self.assertFalse(OrmQ.objects.filter(pk=queued_child.pk).exists())
        self.assertTrue(OrmQ.objects.filter(pk=unrelated_task.pk).exists())
        unrelated.refresh_from_db()
        self.assertFalse(unrelated.finished)

    def test_leaves_an_untracked_leased_task_in_the_active_cluster_alone(self):
        interrupted = self.job()
        self.queued_task(generate_tag_job, 1, interrupted.job_id, locked=True)
        maintenance_task = self.queued_task(untracked_task, locked=True)

        self.assertEqual(LongRunningJob.recover_interrupted_jobs(), 1)
        self.assertTrue(OrmQ.objects.filter(pk=maintenance_task.pk).exists())

    def test_recovers_the_clip_job_when_legacy_task_has_no_job_id(self):
        interrupted = self.job(job_type=LongRunningJob.JOB_CALCULATE_CLIP_EMBEDDINGS)
        other = self.job(
            user=self.other_user,
            job_type=LongRunningJob.JOB_CALCULATE_CLIP_EMBEDDINGS,
        )
        leased = self.queued_task(
            batch_calculate_clip_embedding, self.user, locked=True
        )
        unrelated_task = self.queued_task(
            batch_calculate_clip_embedding, self.other_user
        )

        recovered = LongRunningJob.recover_interrupted_jobs()

        self.assertEqual(recovered, 1)
        interrupted.refresh_from_db()
        self.assertTrue(interrupted.finished)
        self.assertTrue(interrupted.failed)
        self.assertFalse(OrmQ.objects.filter(pk=leased.pk).exists())
        self.assertTrue(OrmQ.objects.filter(pk=unrelated_task.pk).exists())
        other.refresh_from_db()
        self.assertFalse(other.finished)

    def test_leaves_only_queued_work_and_its_job_untouched(self):
        queued = self.job()
        task = self.queued_task(generate_tag_job, 1, queued.job_id)

        self.assertEqual(LongRunningJob.recover_interrupted_jobs(), 0)
        queued.refresh_from_db()
        self.assertFalse(queued.finished)
        self.assertTrue(OrmQ.objects.filter(pk=task.pk).exists())

    def test_ignores_a_leased_task_owned_by_another_cluster(self):
        interrupted = self.job()
        other_cluster_task = OrmQ.objects.create(
            key="other-cluster",
            lock=timezone.now() + timedelta(days=1),
            payload=SignedPackage.dumps(
                {
                    "id": str(uuid.uuid4()),
                    "func": generate_tag_job,
                    "args": (1, interrupted.job_id),
                    "kwargs": {},
                }
            ),
        )

        self.assertEqual(LongRunningJob.recover_interrupted_jobs(), 0)
        interrupted.refresh_from_db()
        self.assertFalse(interrupted.finished)
        self.assertTrue(OrmQ.objects.filter(pk=other_cluster_task.pk).exists())

    def test_startup_cleanup_requires_the_boot_recovery_flag(self):
        interrupted = self.job()
        self.queued_task(generate_tag_job, 1, interrupted.job_id, locked=True)

        call_command("start_job_cleanup_service")
        interrupted.refresh_from_db()
        self.assertFalse(interrupted.finished)

        call_command("start_job_cleanup_service", recover_interrupted_jobs=True)
        interrupted.refresh_from_db()
        self.assertTrue(interrupted.finished)
        self.assertTrue(interrupted.failed)

    def test_is_idempotent(self):
        interrupted = self.job()
        self.queued_task(generate_tag_job, 1, interrupted.job_id, locked=True)

        self.assertEqual(LongRunningJob.recover_interrupted_jobs(), 1)
        self.assertEqual(LongRunningJob.recover_interrupted_jobs(), 0)
