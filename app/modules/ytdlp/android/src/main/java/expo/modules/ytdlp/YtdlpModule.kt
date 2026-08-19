package expo.modules.ytdlp

import android.Manifest
import android.os.Build
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

private const val STATE_EVENT = "onStateChange"

/**
 * Thin bridge between JS and [DownloadQueue]. Holds no download logic itself, only forwards calls
 * and mirrors [DownloadQueue.revision] into the "onStateChange" event while JS is listening.
 */
class YtdlpModule : Module() {
    private var observerJob: Job? = null

    override fun definition() = ModuleDefinition {
        Name("Ytdlp")

        Events(STATE_EVENT)

        // DownloadQueue.prepare() is a suspend function (it awaits the Python/ffmpeg unpack and
        // the yt-dlp update check), so this needs the Coroutine wrapper instead of plain AsyncFunction.
        // The explicit "->" is required: a bodies-only lambda is ambiguous between the 0-arg and
        // 1-arg Coroutine overloads.
        AsyncFunction("initialize") Coroutine { ->
            DownloadQueue.prepare(appContext.reactContext!!)
        }

        AsyncFunction("getState") {
            DownloadQueue.snapshot()
        }

        AsyncFunction("enqueue") { url: String, format: String, quality: String ->
            DownloadQueue.enqueue(appContext.reactContext!!, url, format, quality)
        }

        AsyncFunction("cancel") { id: String ->
            DownloadQueue.cancel(id)
        }

        AsyncFunction("clearFinished") {
            DownloadQueue.clearFinished()
        }

        AsyncFunction("getDebugLogFile") {
            DebugLog.writeToFile(appContext.reactContext!!)
        }

        AsyncFunction("saveToDownloads") { filePath: String, filename: String, mimeType: String ->
            MediaStoreSaver.saveToDownloads(appContext.reactContext!!, filePath, filename, mimeType)
        }

        // Android 13+ only: without this the queue still runs, the notification just never
        // shows, which is exactly the "feels stuck" experience the app is meant to avoid.
        AsyncFunction("requestNotificationPermission") { promise: Promise ->
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                promise.resolve(true)
                return@AsyncFunction
            }
            val permissions = appContext.permissions
            if (permissions == null) {
                promise.resolve(false)
                return@AsyncFunction
            }
            permissions.askForPermissions(
                { result ->
                    val granted = result[Manifest.permission.POST_NOTIFICATIONS]?.status ==
                        PermissionsStatus.GRANTED
                    promise.resolve(granted)
                },
                Manifest.permission.POST_NOTIFICATIONS
            )
        }

        OnStartObserving {
            observerJob?.cancel()
            observerJob = CoroutineScope(Dispatchers.Main.immediate).launch {
                DownloadQueue.revision.collect {
                    sendEvent(STATE_EVENT, DownloadQueue.snapshot())
                }
            }
        }

        OnStopObserving {
            observerJob?.cancel()
            observerJob = null
        }

        OnDestroy {
            observerJob?.cancel()
            observerJob = null
        }
    }
}
