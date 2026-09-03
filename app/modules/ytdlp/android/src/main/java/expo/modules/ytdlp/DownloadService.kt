package expo.modules.ytdlp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

private const val CHANNEL_ID = "ytdlp_downloads"
private const val NOTIFICATION_ID = 4711
private const val ACTION_CANCEL_ALL = "expo.modules.ytdlp.CANCEL_ALL"
private val WAKELOCK_TIMEOUT_MS = TimeUnit.HOURS.toMillis(3)

/**
 * Keeps the process alive while downloads run, so leaving the app does not freeze or kill them,
 * and mirrors the queue state into a notification.
 */
class DownloadService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var wakeLock: PowerManager.WakeLock? = null
    private var observing = false
    private var inForeground = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
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

    private fun buildNotification(): Notification {
        val job = DownloadQueue.activeJob()
        val queued = DownloadQueue.queuedCount()
        val percent = job?.progress?.toInt() ?: 0
        val indeterminate = job?.progress == null

        val title = job?.title ?: DownloadQueue.setupMessage.ifEmpty { "Wird vorbereitet…" }
        val text = buildString {
            append(if (job != null) phaseLabel(job.phase) else "Bitte warten")
            job?.progress?.let { append(" · ${it.toInt()} %") }
            job?.etaSeconds?.takeIf { it > 0 }?.let { append(" · noch ${formatEta(it)}") }
            if (queued > 0) append(" · +$queued in der Warteschlange")
        }

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setProgress(100, percent, indeterminate)
            .addAction(0, "Alle abbrechen", cancelAllIntent())

        openAppIntent()?.let { builder.setContentIntent(it) }
        return builder.build()
    }

    internal fun phaseLabel(phase: JobPhase): String = when (phase) {
        JobPhase.QUEUED -> "In der Warteschlange"
        JobPhase.FETCHING_INFO -> "Lädt Video-Informationen"
        JobPhase.DOWNLOADING -> "Lädt herunter"
        JobPhase.CONVERTING -> "Konvertiert"
        JobPhase.MERGING -> "Führt Video und Audio zusammen"
        JobPhase.DONE -> "Fertig"
        JobPhase.ERROR -> "Fehlgeschlagen"
        JobPhase.CANCELLED -> "Abgebrochen"
    }

    private fun formatEta(seconds: Long): String {
        val minutes = seconds / 60
        val rest = seconds % 60
        return if (minutes > 0) "$minutes:${rest.toString().padStart(2, '0')} min" else "$rest s"
    }

    private fun cancelAllIntent(): PendingIntent {
        val intent = Intent(this, DownloadService::class.java).setAction(ACTION_CANCEL_ALL)
        return PendingIntent.getService(
            this,
            1,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
    }

    private fun openAppIntent(): PendingIntent? {
        val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return null
        return PendingIntent.getActivity(
            this,
            0,
            launch,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
    }

    private fun notificationManager() =
        getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Downloads",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Zeigt den Fortschritt laufender Downloads"
            setShowBadge(false)
        }
        notificationManager().createNotificationChannel(channel)
    }

    companion object {
        fun start(context: Context) {
            val intent = Intent(context, DownloadService::class.java)
            // Fails only when Android forbids a background start; the queue still runs, it just
            // loses the process protection.
            runCatching { ContextCompat.startForegroundService(context, intent) }
        }
    }
}
