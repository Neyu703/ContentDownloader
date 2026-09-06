package expo.modules.ytdlp

import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

private const val NOTIFICATION_ID = 4711
internal const val ACTION_CANCEL_ALL = "expo.modules.ytdlp.CANCEL_ALL"
private val WAKELOCK_TIMEOUT_MS = TimeUnit.HOURS.toMillis(3)

/**
 * Keeps the process alive while downloads run, so leaving the app does not freeze or kill them,
 * and mirrors the queue state into a notification (built by [DownloadNotificationPresenter]).
 */
class DownloadService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val notificationPresenter by lazy { DownloadNotificationPresenter(this) }
    private var wakeLock: PowerManager.WakeLock? = null
    private var observing = false
    private var inForeground = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        notificationPresenter.createChannel()
        wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ytdlp:downloads")
            .apply {
                setReferenceCounted(false)
                acquire(WAKELOCK_TIMEOUT_MS)
            }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_CANCEL_ALL) {
            DownloadQueue.cancelAll()
        }

        // Must happen before any stopSelf() path, otherwise Android kills the app for starting a
        // foreground service without calling startForeground().
        goForeground()

        if (!observing) {
            observing = true
            scope.launch {
                DownloadQueue.revision.collect {
                    if (DownloadQueue.hasPendingWork()) {
                        notificationManager().notify(NOTIFICATION_ID, buildNotification())
                    } else {
                        finish()
                    }
                }
            }
        }

        if (!DownloadQueue.hasPendingWork()) finish()
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
        super.onDestroy()
    }

    internal fun goForeground() {
        if (inForeground) return
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
        } else {
            0
        }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), type)
        inForeground = true
    }

    private fun finish() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        inForeground = false
        stopSelf()
    }

    private fun buildNotification(): Notification =
        notificationPresenter.build(DownloadQueue.activeJob(), DownloadQueue.queuedCount())

    internal fun phaseLabel(phase: JobPhase): String = notificationPresenter.phaseLabel(phase)

    internal fun setupPhaseLabel(phase: SetupPhase): String = notificationPresenter.setupPhaseLabel(phase)

    companion object {
        fun start(context: Context) {
            val intent = Intent(context, DownloadService::class.java)
            // Fails only when Android forbids a background start; the queue still runs, it just
            // loses the process protection.
            runCatching { ContextCompat.startForegroundService(context, intent) }
        }
    }
}
