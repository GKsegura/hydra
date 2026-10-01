; Hydra — © 2026 José Segura (GKsegura) · MIT
; "Abrir com Hydra" no menu de contexto do Explorer: pastas, o fundo de uma pasta aberta e arquivos .code-workspace.
; Tudo em HKCU\Software\Classes (só para este usuário, sem precisar de admin — combina com o instalador perMachine:false).
; Não mexe no programa padrão: o duplo clique no .code-workspace continua abrindo o VS Code.

!macro customInstall
  WriteRegStr HKCU "Software\Classes\Directory\shell\Hydra" "" "Abrir com Hydra"
  WriteRegStr HKCU "Software\Classes\Directory\shell\Hydra" "Icon" "$INSTDIR\Hydra.exe"
  WriteRegStr HKCU "Software\Classes\Directory\shell\Hydra\command" "" '"$INSTDIR\Hydra.exe" "%1"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Hydra" "" "Abrir com Hydra"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Hydra" "Icon" "$INSTDIR\Hydra.exe"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Hydra\command" "" '"$INSTDIR\Hydra.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.code-workspace\shell\Hydra" "" "Abrir com Hydra"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.code-workspace\shell\Hydra" "Icon" "$INSTDIR\Hydra.exe"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.code-workspace\shell\Hydra\command" "" '"$INSTDIR\Hydra.exe" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\shell\Hydra"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\Hydra"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.code-workspace\shell\Hydra"
!macroend
