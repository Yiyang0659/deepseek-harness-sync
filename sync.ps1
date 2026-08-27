[CmdletBinding()]
param(
    [switch]$Push,
    [switch]$Pull,
    [switch]$Status,
    [string]$Message = ""
)

$DshDir = "C:\Users\wy_liuxiaoyang\.dsh"
Set-Location -Path $DshDir
$OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host "[SUCCESS] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

# Check git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Err "Git is not installed or not found in PATH."
    exit 1
}

# Check git repo
if (-not (Test-Path "$DshDir\.git")) {
    Write-Warn "Git repository is not initialized in $DshDir."
    Write-Info "Initializing repository..."
    git init
    git branch -M main
}

# Status Check
if ($Status -or (-not $Push -and -not $Pull)) {
    Write-Info "Checking DeepSeek Harness sync status..."
    $remotes = git remote -v
    if (-not $remotes) {
        Write-Warn "No remote repository configured."
        Write-Info "Run: git remote add origin <your-github-repo-url>"
    } else {
        Write-Success "Remote repository configured:"
        $remotes | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
    }
    Write-Host ""
    Write-Info "Tracked configurations status:"
    git status -s
    if (-not $Push -and -not $Pull) {
        exit 0
    }
}

# Pull
if ($Pull) {
    Write-Info "Pulling latest configurations from GitHub..."
    $remotes = git remote -v
    if (-not $remotes) {
        Write-Err "Cannot pull: No remote repository configured. Set one with: git remote add origin <url>"
        exit 1
    }

    $prevPkgHash = ""
    if (Test-Path "$DshDir\profiles\web\package.json") {
        $prevPkgHash = (Get-FileHash "$DshDir\profiles\web\package.json").Hash
    }

    git pull --rebase --autostash origin main
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Successfully pulled latest configuration!"
        
        # Check if package.json changed -> reinstall plugins
        if (Test-Path "$DshDir\profiles\web\package.json") {
            $newPkgHash = (Get-FileHash "$DshDir\profiles\web\package.json").Hash
            if ($prevPkgHash -ne $newPkgHash) {
                Write-Info "Detected plugin list changes in profiles/web/package.json. Reinstalling plugins..."
                Push-Location "$DshDir\profiles\web"
                pnpm install
                Pop-Location
                Write-Success "Plugins updated successfully!"
            }
        }
    } else {
        Write-Err "Failed to pull from GitHub. Please check network and remote configuration."
    }
}

# Push
if ($Push) {
    Write-Info "Checking for configuration changes..."
    
    # Track core configs
    git add settings.yaml
    git add profiles/web/package.json
    git add profiles/web/cordis.yml
    git add profiles/web/cordis.patch.yml
    git add profiles/web/pnpm-workspace.yaml
    if (Test-Path "$DshDir\profiles\web\pnpm-lock.yaml") { git add profiles/web/pnpm-lock.yaml }
    if (Test-Path "$DshDir\skills") { git add skills/ }
    git add .gitignore
    git add .credentials.yaml.example
    git add README.md
    git add sync.ps1
    git add sync-watch.ps1
    git add sync-push.bat
    git add sync-pull.bat
    git add sync-watch.bat
    git add sync-watch-silent.vbs
    git add restore.bat
    git add restore.ps1

    $changes = git status --porcelain
    if (-not $changes) {
        Write-Info "No configuration changes detected to commit."
    } else {
        if ([string]::IsNullOrWhiteSpace($Message)) {
            $Message = "Update DSH configs: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        }
        git commit -m "$Message"
        Write-Success "Committed local changes: $Message"
    }

    $remotes = git remote -v
    if (-not $remotes) {
        Write-Warn "No remote repository configured yet. Local commit completed."
        Write-Info "To push to GitHub, add your remote repository:"
        Write-Info "  git remote add origin https://github.com/<your-username>/<your-repo>.git"
        Write-Info "  git push -u origin main"
    } else {
        Write-Info "Pushing to GitHub..."
        git push origin main
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Configurations successfully synced to GitHub!"
        } else {
            Write-Err "Git push encountered an error. Please check your GitHub remote and token permissions."
        }
    }
}
