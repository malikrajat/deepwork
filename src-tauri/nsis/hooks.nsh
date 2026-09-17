; DeepWork NSIS installer hooks.
;
; Tauri injects these macros into its own installer.nsi, so this file only adds
; behaviour — it never replaces the stock template.
;
; WHAT THIS DOES
;   Right after the files are installed, asks whether DeepWork should start with
;   Windows. If the user accepts, it writes the same per-user Run entry the app
;   itself manages:
;
;     HKCU\Software\Microsoft\Windows\CurrentVersion\Run\DeepWork
;       = "<install dir>\deepwork.exe" --autostart
;
;   The value name "DeepWork" matches ${PRODUCTNAME}, which Tauri's uninstaller
;   already deletes, so no uninstall hook is needed here — uninstalling always
;   leaves no startup entry behind.
;
; The `--autostart` flag makes a login-launched copy start hidden in the system
; tray instead of opening a window on top of the user's desktop.
;
; Silent (/S) and passive installs skip the prompt entirely and leave startup
; off; those users can enable it later from DeepWork Settings, the tray menu or
; the first-run dialog.

!macro NSIS_HOOK_POSTINSTALL
  ${IfNot} ${Silent}
  ${AndIfNot} $PassiveMode = 1
    MessageBox MB_YESNO|MB_ICONQUESTION "Start DeepWork automatically when Windows starts?$\r$\n$\r$\nDeepWork will open quietly in the system tray (next to the clock) instead of on top of your desktop. You can change this any time in DeepWork Settings or from the tray menu." IDNO deepwork_skip_startup
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DeepWork" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" --autostart"
    deepwork_skip_startup:
  ${EndIf}
!macroend
