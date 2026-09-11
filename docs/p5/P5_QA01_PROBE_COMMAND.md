# P5 QA01 Probe Command

Do not use this command until the Draft PR exact head has passed CI and repository diff audit.

```powershell
& {
    Set-Location 'E:\AI_PROJECTS\VISUAL_CONSOLE'
    git fetch origin
    git switch feat/p5-qa01-scene-freeze
    git pull --ff-only origin feat/p5-qa01-scene-freeze
    powershell.exe -ExecutionPolicy Bypass -File '.\tools\P5_QA01_CAPABILITY_PROBE.ps1'
}
```

The script itself rejects a dirty worktree, wrong branch, or QA01 enablement. Its output is read-only capability evidence; it does not authorize model installation or inference.
