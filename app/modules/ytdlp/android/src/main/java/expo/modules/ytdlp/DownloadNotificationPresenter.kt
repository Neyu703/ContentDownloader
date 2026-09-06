package expo.modules.ytdlp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat

private const val CHANNEL_ID = "ytdlp_downloads"
private val PENDING_INTENT_FLAGS = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT

/** Shared by [DownloadNotificationPresenter] and [DownloadService], which both post to this notification. */
internal fun Context.notificationManager(): NotificationManager =
    getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

/** Builds the persistent download-progress notification and its channel for [DownloadService]. */
class DownloadNotificationPresenter(private val context: Context) {
    fun build(job: DownloadJob?, queuedCount: Int): Notification {
        val percent = job?.progress?.toInt() ?: 0
        val indeterminate = job?.progress == null

        val title = job?.title ?: setupPhaseLabel(DownloadQueue.setupPhase)
        val text = buildString {
            append(if (job != null) phaseLabel(job.phase) else context.getString(R.string.notification_please_wait))
            job?.progress?.let { append(" · ${it.toInt()} %") }
            job?.etaSeconds?.takeIf { it > 0 }?.let {
                append(" · ${context.getString(R.string.notification_eta_suffix, formatEta(it))}")
            }
            if (queuedCount > 0) append(" · ${context.getString(R.string.notification_queue_suffix, queuedCount)}")
        }

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setProgress(100, percent, indeterminate)
            .addAction(0, context.getString(R.string.notification_cancel_all), cancelAllIntent())

        openAppIntent()?.let { builder.setContentIntent(it) }
        return builder.build()
    }

    fun phaseLabel(phase: JobPhase): String = when (phase) {
        JobPhase.QUEUED -> context.getString(R.string.phase_queued)
        JobPhase.FETCHING_INFO -> context.getString(R.string.phase_fetching_info)
        JobPhase.DOWNLOADING -> context.getString(R.string.phase_downloading)
        JobPhase.CONVERTING -> context.getString(R.string.phase_converting)
        JobPhase.MERGING -> context.getString(R.string.phase_merging)
        JobPhase.DONE -> context.getString(R.string.phase_done)
        JobPhase.ERROR -> context.getString(R.string.phase_error)
        JobPhase.CANCELLED -> context.getString(R.string.phase_cancelled)
    }

    /** Mirrors setup.preparing/setup.updating in app/i18n, but resolved from Android string resources since this renders outside the JS bridge. */
    fun setupPhaseLabel(phase: SetupPhase): String = when (phase) {
        SetupPhase.UPDATING -> context.getString(R.string.notification_updating)
        else -> context.getString(R.string.notification_preparing)
    }

    private fun formatEta(seconds: Long): String {
        val minutes = seconds / 60
        val rest = seconds % 60
        return if (minutes > 0) "$minutes:${rest.toString().padStart(2, '0')} min" else "$rest s"
    }

    private fun cancelAllIntent(): PendingIntent {
        val intent = Intent(context, DownloadService::class.java).setAction(ACTION_CANCEL_ALL)
        return PendingIntent.getService(context, 1, intent, PENDING_INTENT_FLAGS)
    }

    private fun openAppIntent(): PendingIntent? {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
        return PendingIntent.getActivity(context, 0, launch, PENDING_INTENT_FLAGS)
    }

    fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = context.getString(R.string.notification_channel_description)
            setShowBadge(false)
        }
        context.notificationManager().createNotificationChannel(channel)
    }
}
