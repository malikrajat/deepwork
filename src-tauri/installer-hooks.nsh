; DeepWork's NSIS installer hooks.
;
; ## Why this file exists
;
; Tauri's Windows uninstaller asks one question, in a check box on its own
; confirmation page: *Delete the application data*. Unticked, it is harmless.
; Ticked, it runs
;
;     RmDir /r "$APPDATA\com.deepwork.app"
;
; and that directory is where DeepWork keeps `deepwork.db` — every task the user
; has finished, every session they sat through, their journal, their settings.
; The checkbox is not wrong to exist (a user really may want a clean slate), but
; "the application data" reads like caches and preferences, and the app's whole
; promise is that this data never leaves the machine and is never sent anywhere.
; Someone uninstalling before a reinstall can lose years of work to a phrase that
; did not say so.
;
; So the hook below does one thing: when the uninstaller is about to run, it says
; in plain words what the data is, where it lives, and that ticking the box
; removes it. It cannot untick the box for the user — that would be the same kind
; of surprise in the other direction — and it deliberately does not run during an
; in-place update, which must never be interrupted by a dialog.
;
; `tauri.conf.json` points at this file with
; `bundle.windows.nsis.installerHooks`; Tauri includes it into its own
; `installer.nsi` and calls whichever of these macros it finds.

; ## NSIS_HOOK_PREUNINSTALL
;
; Runs at the top of the uninstaller's `Section Uninstall`, before anything is
; deleted, and **only when `$UpdateMode` is not 1**.
;
; The update guard is load-bearing. Every NSIS update is a silent uninstall
; followed by a reinstall, and a modal dialog in that path would either stall an
; automatic update or be dismissed by a user who is only here to update. The
; update case is also already safe by construction: Tauri's own app-data deletion
; is inside a `${If} $UpdateMode <> 1` block, so an update cannot reach the code
; that removes the database.
;
; `MB_ICONEXCLAMATION` rather than a question: this is information the user needs
; *before* they reach the checkbox on the next page, and a Yes/No dialog here
; would only be a second thing to click through.
!macro NSIS_HOOK_PREUNINSTALL
  ${If} $UpdateMode <> 1
    MessageBox MB_ICONEXCLAMATION|MB_OK \
      "DeepWork keeps everything on this computer, in:$\r$\n$\r$\n$APPDATA\${BUNDLEID}$\r$\n$\r$\nYour tasks, completed sessions, journal and settings are all in that folder — nothing is stored anywhere else, and uninstalling DeepWork does not remove it.$\r$\n$\r$\nThe next page offers 'Delete the application data'. Ticking it deletes that folder and everything in it, for good.$\r$\n$\r$\nIf you plan to install DeepWork again, leave it unticked: your work will still be here."
  ${EndIf}
!macroend
