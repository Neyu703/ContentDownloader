package expo.modules.ytdlp

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.documentfile.provider.DocumentFile
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

private const val STATE_EVENT = "onStateChange"

private const val FOLDER_GRANT_FLAGS = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION

/** The picked folder's own display name (its last path segment), or null if it's no longer reachable. */
private fun folderDisplayName(context: Context, treeUri: Uri): String? =
    DocumentFile.fromTreeUri(context, treeUri)?.name

/**
 * Thin bridge between JS and [DownloadQueue]. Holds no download logic itself, only forwards calls
 * and mirrors [DownloadQueue.revision] into the "onStateChange" event while JS is listening.
 */
class YtdlpModule : Module() {
    private var observerJob: Job? = null
    private var folderPickerLauncher: AppContextActivityResultLauncher<String, Uri?>? = null

    // Every AsyncFunction below runs while the module is attached to a live React context, so this
    // is never actually null in practice — asserted once here instead of at each call site.
    private val context: Context get() = appContext.reactContext!!

    override fun definition() = ModuleDefinition {
        Name("Ytdlp")

        Events(STATE_EVENT)

        RegisterActivityContracts {
            folderPickerLauncher = registerForActivityResult(OpenDocumentTreeContract())
        }

        // DownloadQueue.prepare() is a suspend function (it awaits the Python/ffmpeg unpack and
        // the yt-dlp update check), so this needs the Coroutine wrapper instead of plain AsyncFunction.
        // The explicit "->" is required: a bodies-only lambda is ambiguous between the 0-arg and
        // 1-arg Coroutine overloads.
        AsyncFunction("initialize") Coroutine { ->
            DownloadQueue.prepare(context)
        }

        AsyncFunction("getState") {
            DownloadQueue.snapshot()
        }

        AsyncFunction("enqueue") { url: String, format: String, quality: String, groupId: String?, groupTitle: String? ->
            DownloadQueue.enqueue(context, url, format, quality, groupId, groupTitle)
        }

        AsyncFunction("getPlaylistInfo") Coroutine { url: String, start: Int ->
            DownloadQueue.getPlaylistInfo(context, url, start)
        }

        AsyncFunction("cancel") { id: String ->
            DownloadQueue.cancel(id)
        }

        AsyncFunction("removeIfFinished") { id: String ->
            DownloadQueue.removeIfFinished(id)
        }

        AsyncFunction("clearFinished") {
            DownloadQueue.clearFinished()
        }

        AsyncFunction("getDebugLogFile") {
            DebugLog.writeToFile(context)
        }

        AsyncFunction("saveToDownloads") { filePath: String, filename: String, mimeType: String ->
            MediaStoreSaver.saveToDownloads(context, filePath, filename, mimeType)
        }

        // Opens Android's Storage Access Framework folder picker so the user can choose where
        // saveToDownloads() writes files instead of the default public Downloads folder. Returns
        // the picked folder's display name, or null if the user cancelled (or the picker was
        // somehow never registered — RegisterActivityContracts above always runs first in practice).
        AsyncFunction("pickDownloadsFolder") Coroutine { ->
            val launcher = folderPickerLauncher ?: return@Coroutine null
            val treeUri = launcher.launch("") ?: return@Coroutine null
            context.contentResolver.takePersistableUriPermission(treeUri, FOLDER_GRANT_FLAGS)
            DownloadsFolderPreference.set(context, treeUri.toString())
            folderDisplayName(context, treeUri)
        }

        // Null means "using the default public Downloads folder" — both when nothing was ever
        // picked, and (defensively) when a previously picked folder is no longer reachable.
        AsyncFunction("getDownloadsFolderName") {
            val treeUri = DownloadsFolderPreference.getUri(context) ?: return@AsyncFunction null
            folderDisplayName(context, treeUri)
        }

        AsyncFunction("resetDownloadsFolder") {
            DownloadsFolderPreference.getUri(context)?.let { treeUri ->
                // Best-effort: the permission may already be gone (folder deleted/moved), which
                // must not stop the preference itself from being cleared below.
                runCatching {
                    context.contentResolver.releasePersistableUriPermission(treeUri, FOLDER_GRANT_FLAGS)
                }
            }
            DownloadsFolderPreference.set(context, null)
        }

        // Cookies imported here are read by every yt-dlp invocation (see CookiesStore, DownloadQueue)
        // once present, letting downloads past YouTube's "sign in to confirm you're not a bot" gate.
        AsyncFunction("importCookies") { cookiesText: String ->
            CookiesStore.save(context, cookiesText)
        }

        AsyncFunction("hasCookies") {
            CookiesStore.path(context) != null
        }

        AsyncFunction("clearCookies") {
            CookiesStore.clear(context)
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
