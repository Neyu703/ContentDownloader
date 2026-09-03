package expo.modules.ytdlp

import android.app.Notification
import android.app.NotificationManager
import android.content.Intent
import android.os.PowerManager
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ServiceController
import org.robolectric.annotation.Config

private const val ACTION_CANCEL_ALL = "expo.modules.ytdlp.CANCEL_ALL"
private const val NOTIFICATION_ID = 4711

@Config(sdk = [33])
@RunWith(org.robolectric.RobolectricTestRunner::class)
class DownloadServiceTest {
    private lateinit var controller: ServiceController<DownloadService>
    private lateinit var notificationManager: NotificationManager
    private lateinit var context: android.content.Context

    @Before
    fun setUp() {
        resetDownloadQueueState()
        controller = Robolectric.buildService(DownloadService::class.java)
        context = ApplicationProvider.getApplicationContext()
        notificationManager = context.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as NotificationManager
    }

    @After
    fun tearDown() {
        resetDownloadQueueState()
    }

    /** [DownloadQueue] is a process-wide singleton; each test needs a clean slate. */
    private fun resetDownloadQueueState() {
        val jobsField = DownloadQueue::class.java.getDeclaredField("jobs").apply { isAccessible = true }
        (jobsField.get(DownloadQueue) as MutableList<*>).clear()
        val setupPhaseField = DownloadQueue::class.java.getDeclaredField("setupPhase").apply { isAccessible = true }
        setupPhaseField.set(DownloadQueue, SetupPhase.IDLE)
        val setupMessageField = DownloadQueue::class.java.getDeclaredField("setupMessage").apply { isAccessible = true }
        setupMessageField.set(DownloadQueue, "")
        val setupMessageParamsField = DownloadQueue::class.java.getDeclaredField("setupMessageParams").apply { isAccessible = true }
        setupMessageParamsField.set(DownloadQueue, null)
        val revisionField = DownloadQueue::class.java.getDeclaredField("_revision").apply { isAccessible = true }
        @Suppress("UNCHECKED_CAST")
        (revisionField.get(DownloadQueue) as MutableStateFlow<Long>).value = 0L
    }

    private fun seedJob(job: DownloadJob) {
        val jobsField = DownloadQueue::class.java.getDeclaredField("jobs").apply { isAccessible = true }
        @Suppress("UNCHECKED_CAST")
        (jobsField.get(DownloadQueue) as MutableList<DownloadJob>).add(job)
    }

    private fun postedNotification(): Notification? =
        shadowOf(controller.get()).lastForegroundNotification ?: shadowOf(notificationManager).getNotification(NOTIFICATION_ID)

    // --- onCreate() ---

    @Test
    fun `onCreate creates the notification channel and acquires a partial wakelock`() {
        controller.create()

        val channel = notificationManager.getNotificationChannel("ytdlp_downloads")
        assertEquals(context.getString(R.string.notification_channel_name), channel?.name)

        val wakeLockField = DownloadService::class.java.getDeclaredField("wakeLock").apply { isAccessible = true }
        val wakeLock = wakeLockField.get(controller.get()) as PowerManager.WakeLock?
        assertTrue(wakeLock?.isHeld == true)
    }

    @Config(sdk = [24])
    @Test
    fun `onCreate skips notification channel creation before Android O`() {
        // NotificationChannel/getNotificationChannel() don't exist as an API before O at all, so
        // the only thing to assert here is that skipping channel setup doesn't crash onCreate().
        controller.create()
    }

    // --- onStartCommand() ---

    @Test
    fun `onStartCommand with ACTION_CANCEL_ALL cancels every active job`() {
        seedJob(DownloadJob("id-1", "https://youtu.be/x", "audio", "320"))
        controller.create()

        controller.get().onStartCommand(Intent(ACTION_CANCEL_ALL), 0, 1)

        assertTrue((DownloadQueue.snapshot()["jobs"] as List<*>).isEmpty())
    }

    @Test
    fun `onStartCommand goes to the foreground with a notification`() {
        // Pending work keeps the service from immediately stopping (and removing the
        // notification again) right after goForeground() runs.
        seedJob(DownloadJob("id-1", "https://youtu.be/x", "audio", "320"))
        controller.create()

        controller.get().onStartCommand(null, 0, 1)

        assertEquals(NOTIFICATION_ID, shadowOf(controller.get()).lastForegroundNotificationId)
        assertNotNull(postedNotification())
    }

    @Test
    fun `goForeground is a no-op once already in the foreground`() {
        seedJob(DownloadJob("id-1", "https://youtu.be/x", "audio", "320"))
        controller.create()

        controller.get().goForeground()
        controller.get().goForeground()

        assertEquals(NOTIFICATION_ID, shadowOf(controller.get()).lastForegroundNotificationId)
    }

    @Test
    fun `onStartCommand stops the service when there is no pending work`() {
        controller.create()

        controller.get().onStartCommand(null, 0, 1)

        assertTrue(shadowOf(controller.get()).isStoppedBySelf)
    }

    @Test
    fun `onStartCommand keeps the service running while a job is active`() {
        seedJob(DownloadJob("id-1", "https://youtu.be/x", "audio", "320"))
        controller.create()

        controller.get().onStartCommand(null, 0, 1)

        assertFalse(shadowOf(controller.get()).isStoppedBySelf)
    }

    @Test
    fun `onStartCommand returns START_NOT_STICKY`() {
        controller.create()

        val result = controller.get().onStartCommand(null, 0, 1)

        assertEquals(android.app.Service.START_NOT_STICKY, result)
    }

    @Test
    fun `onStartCommand only registers the revision observer once across multiple starts`() {
        controller.create()

        controller.get().onStartCommand(null, 0, 1)
        val observerJobField = DownloadService::class.java.getDeclaredField("observing").apply { isAccessible = true }
        controller.get().onStartCommand(null, 0, 2)

        assertTrue(observerJobField.getBoolean(controller.get()))
    }

    // --- buildNotification() content, exercised via the foreground call in onStartCommand ---

    @Test
    fun `notification falls back to the setup phase label when no job is active`() {
        // setupPhase PREPARING keeps hasPendingWork() true, so the service stays in the
        // foreground long enough for the notification to be inspected. The title now comes from
        // setupPhaseLabel() (an Android string resource), not the JS-facing setupMessage key.
        val setupPhaseField = DownloadQueue::class.java.getDeclaredField("setupPhase").apply { isAccessible = true }
        setupPhaseField.set(DownloadQueue, SetupPhase.PREPARING)
        controller.create()

        controller.get().onStartCommand(null, 0, 1)

        val notification = postedNotification()
        assertEquals(context.getString(R.string.notification_preparing), notification?.extras?.getCharSequence(Notification.EXTRA_TITLE))
        assertEquals(context.getString(R.string.notification_please_wait), notification?.extras?.getCharSequence(Notification.EXTRA_TEXT))
    }

    @Test
    fun `notification uses the updating label when setup phase is UPDATING`() {
        val setupPhaseField = DownloadQueue::class.java.getDeclaredField("setupPhase").apply { isAccessible = true }
        setupPhaseField.set(DownloadQueue, SetupPhase.UPDATING)
        controller.create()

        controller.get().onStartCommand(null, 0, 1)

        val notification = postedNotification()
        assertEquals(context.getString(R.string.notification_updating), notification?.extras?.getCharSequence(Notification.EXTRA_TITLE))
    }

    @Test
    fun `notification uses the active job's title, phase label, progress and eta`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320").apply {
            phase = JobPhase.DOWNLOADING
            title = "My Video"
            progress = 42.0
            etaSeconds = 90L
        }
        seedJob(job)
        controller.create()

        controller.get().onStartCommand(null, 0, 1)

        val notification = postedNotification()
        assertEquals("My Video", notification?.extras?.getCharSequence(Notification.EXTRA_TITLE))
        val text = notification?.extras?.getCharSequence(Notification.EXTRA_TEXT).toString()
        assertTrue(text.contains(context.getString(R.string.phase_downloading)))
        assertTrue(text.contains("42 %"))
        assertTrue(text.contains("1:30 min"))
    }

    @Test
    fun `notification formats an eta under a minute in seconds`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320").apply {
            phase = JobPhase.DOWNLOADING
            etaSeconds = 45L
        }
        seedJob(job)
        controller.create()

        controller.get().onStartCommand(null, 0, 1)

        val text = postedNotification()?.extras?.getCharSequence(Notification.EXTRA_TEXT).toString()
        assertTrue(text.contains("45 s"))
    }

    @Test
    fun `notification omits the eta segment when etaSeconds is zero or absent`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320").apply {
            phase = JobPhase.DOWNLOADING
            etaSeconds = 0L
        }
        seedJob(job)
        controller.create()

        controller.get().onStartCommand(null, 0, 1)

        val text = postedNotification()?.extras?.getCharSequence(Notification.EXTRA_TEXT).toString()
        assertFalse(text.contains(context.getString(R.string.notification_eta_suffix, "").trim()))
    }

    @Test
    fun `notification appends the queued count when more jobs are waiting`() {
        seedJob(DownloadJob("id-1", "https://youtu.be/x", "audio", "320").apply { phase = JobPhase.DOWNLOADING })
        seedJob(DownloadJob("id-2", "https://youtu.be/y", "audio", "320"))
        seedJob(DownloadJob("id-3", "https://youtu.be/z", "audio", "320"))
        controller.create()

        controller.get().onStartCommand(null, 0, 1)

        val text = postedNotification()?.extras?.getCharSequence(Notification.EXTRA_TEXT).toString()
        assertTrue(text.contains(context.getString(R.string.notification_queue_suffix, 2)))
    }

    @Test
    fun `notification shows an indeterminate progress bar when progress is unknown`() {
        seedJob(DownloadJob("id-1", "https://youtu.be/x", "audio", "320").apply { phase = JobPhase.FETCHING_INFO })
        controller.create()

        controller.get().onStartCommand(null, 0, 1)

        assertTrue(postedNotification()?.extras?.getBoolean(Notification.EXTRA_PROGRESS_INDETERMINATE) == true)
    }

    @Test
    fun `every JobPhase label is exercised through the notification text`() {
        for (phase in JobPhase.entries.filter { !it.isFinished }) {
            resetDownloadQueueState()
            seedJob(DownloadJob("id-1", "https://youtu.be/x", "audio", "320").apply { this.phase = phase })
            val freshController = Robolectric.buildService(DownloadService::class.java).create()

            freshController.get().onStartCommand(null, 0, 1)

            val notification = shadowOf(freshController.get()).lastForegroundNotification
                ?: shadowOf(notificationManager).getNotification(NOTIFICATION_ID)
            val text = notification?.extras?.getCharSequence(Notification.EXTRA_TEXT).toString()
            assertTrue("phase $phase should produce non-blank notification text", text.isNotBlank())
            freshController.destroy()
        }
    }

    // --- onDestroy() ---

    @Test
    fun `onDestroy releases the wakelock`() {
        controller.create()
        controller.get().onStartCommand(null, 0, 1)

        controller.destroy()

        val wakeLockField = DownloadService::class.java.getDeclaredField("wakeLock").apply { isAccessible = true }
        assertNull(wakeLockField.get(controller.get()))
    }

    @Test
    fun `onDestroy does not throw when the service was never created (wakeLock still null)`() {
        controller.get().onDestroy()

        val wakeLockField = DownloadService::class.java.getDeclaredField("wakeLock").apply { isAccessible = true }
        assertNull(wakeLockField.get(controller.get()))
    }

    @Test
    fun `onDestroy does not throw when the wakelock is already released`() {
        controller.create()
        controller.get().onStartCommand(null, 0, 1)
        val wakeLockField = DownloadService::class.java.getDeclaredField("wakeLock").apply { isAccessible = true }
        (wakeLockField.get(controller.get()) as PowerManager.WakeLock).release()

        controller.get().onDestroy()
    }

    // --- DownloadService.start() ---

    @Test
    fun `start() does not throw even when the platform refuses a background start`() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        DownloadService.start(context)
    }

    @Test
    fun `start() swallows an exception thrown by startForegroundService`() {
        val throwingContext = object : android.content.ContextWrapper(ApplicationProvider.getApplicationContext()) {
            override fun startForegroundService(service: Intent) =
                throw IllegalStateException("app is in the background")
        }

        DownloadService.start(throwingContext)
    }

    // --- onBind() ---

    @Test
    fun `onBind always returns null (this is not a bound service)`() {
        controller.create()

        assertNull(controller.get().onBind(Intent()))
    }

    // --- goForeground()'s pre-Q service type branch ---

    @Config(sdk = [28])
    @Test
    fun `goForeground uses no explicit foreground service type before Android Q`() {
        seedJob(DownloadJob("id-1", "https://youtu.be/x", "audio", "320"))
        controller.create()

        controller.get().onStartCommand(null, 0, 1)

        assertNotNull(postedNotification())
    }

    // --- phaseLabel() ---

    @Test
    fun `phaseLabel covers every JobPhase, including ones never actually shown as the active job`() {
        assertEquals(context.getString(R.string.phase_queued), controller.get().phaseLabel(JobPhase.QUEUED))
        assertEquals(context.getString(R.string.phase_fetching_info), controller.get().phaseLabel(JobPhase.FETCHING_INFO))
        assertEquals(context.getString(R.string.phase_downloading), controller.get().phaseLabel(JobPhase.DOWNLOADING))
        assertEquals(context.getString(R.string.phase_converting), controller.get().phaseLabel(JobPhase.CONVERTING))
        assertEquals(context.getString(R.string.phase_merging), controller.get().phaseLabel(JobPhase.MERGING))
        assertEquals(context.getString(R.string.phase_done), controller.get().phaseLabel(JobPhase.DONE))
        assertEquals(context.getString(R.string.phase_error), controller.get().phaseLabel(JobPhase.ERROR))
        assertEquals(context.getString(R.string.phase_cancelled), controller.get().phaseLabel(JobPhase.CANCELLED))
    }

    // --- setupPhaseLabel() ---

    @Test
    fun `setupPhaseLabel returns the preparing label for every non-UPDATING phase`() {
        val service = controller.get()
        assertEquals(context.getString(R.string.notification_preparing), service.setupPhaseLabel(SetupPhase.IDLE))
        assertEquals(context.getString(R.string.notification_preparing), service.setupPhaseLabel(SetupPhase.PREPARING))
        assertEquals(context.getString(R.string.notification_preparing), service.setupPhaseLabel(SetupPhase.READY))
        assertEquals(context.getString(R.string.notification_preparing), service.setupPhaseLabel(SetupPhase.FAILED))
    }

    @Test
    fun `setupPhaseLabel returns the updating label for UPDATING`() {
        assertEquals(context.getString(R.string.notification_updating), controller.get().setupPhaseLabel(SetupPhase.UPDATING))
    }

    // --- openAppIntent()'s found-a-launcher-activity branch ---

    @Test
    fun `notification carries a content intent when the app declares a launcher activity`() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val packageManager = context.packageManager
        val launcherComponent = android.content.ComponentName(context.packageName, "expo.modules.ytdlp.FakeLauncherActivity")
        shadowOf(packageManager).addActivityIfNotPresent(launcherComponent)
        shadowOf(packageManager).addIntentFilterForActivity(
            launcherComponent,
            android.content.IntentFilter(Intent.ACTION_MAIN).apply { addCategory(Intent.CATEGORY_LAUNCHER) }
        )
        seedJob(DownloadJob("id-1", "https://youtu.be/x", "audio", "320"))
        controller.create()

        controller.get().onStartCommand(null, 0, 1)

        assertNotNull(postedNotification()?.contentIntent)
    }

    // --- revision observer ---

    @Test
    fun `observing the revision flow refreshes the notification and stops the service once work finishes`() {
        val job = DownloadJob("id-1", "https://youtu.be/x", "audio", "320")
        seedJob(job)
        controller.create()
        controller.get().onStartCommand(null, 0, 1)
        assertFalse(shadowOf(controller.get()).isStoppedBySelf)

        job.phase = JobPhase.DONE
        val revisionField = DownloadQueue::class.java.getDeclaredField("_revision").apply { isAccessible = true }
        @Suppress("UNCHECKED_CAST")
        val revision = revisionField.get(DownloadQueue) as MutableStateFlow<Long>
        revision.value = revision.value + 1
        shadowOf(android.os.Looper.getMainLooper()).idle()

        assertTrue(shadowOf(controller.get()).isStoppedBySelf)
    }
}
