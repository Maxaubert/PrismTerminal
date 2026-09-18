; Prism Terminal is RESIDENT: closing its window hides it and the process
; stays, so the next launch is instant. An installer cannot replace an exe
; that is running, and the app's own close request only hides it again, so
; setup ends the process itself before it touches a file.
!macro customInit
  nsExec::Exec 'taskkill /F /T /IM PrismTerminal.exe'
  Pop $0
  Sleep 400
!macroend

; The Explorer verbs are the app's own writes (shellVerb.ts), made at first
; launch and from Settings, so the uninstaller is the only thing that can take
; them away again. Defined HERE, in the file electron-builder includes for the
; uninstaller build too: Prism's macro once sat in a file excluded under
; BUILD_UNINSTALLER, and every key survived every uninstall.
; src/main/shellVerbParity.test.ts asserts each key the app writes is below.
!macro customUnInit
  nsExec::Exec 'taskkill /F /T /IM PrismTerminal.exe'
  Pop $0
  Sleep 400
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\shell\PrismTerminal"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\PrismTerminal"
!macroend
