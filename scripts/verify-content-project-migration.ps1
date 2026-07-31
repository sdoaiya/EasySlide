param(
  [Parameter(Mandatory = $true)]
  [string]$DatabasePath,
  [string]$UploadFolder,
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$python = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
  throw "Project Python runtime not found: $python"
}
$database = Resolve-Path -LiteralPath $DatabasePath
$output = if ($OutputDirectory) {
  [System.IO.Path]::GetFullPath($OutputDirectory)
} else {
  Join-Path $projectRoot '.codex-tmp\content-project-verification'
}
$arguments = @(
  (Join-Path $projectRoot 'backend\services\content_project_migration.py'),
  $database.Path,
  '--output-dir',
  $output
)
if ($UploadFolder) {
  $arguments += @('--file-root', (Resolve-Path -LiteralPath $UploadFolder).Path)
}

& $python @arguments
exit $LASTEXITCODE
