param([ValidateSet("both","tauri","electrobun")][string]$Variant="both")
$ErrorActionPreference="Stop"
Push-Location $PSScriptRoot
try {
    if ($Variant -ne "electrobun") {
        cargo build --locked --release --manifest-path tauri-host/Cargo.toml
        if ($LASTEXITCODE -ne 0) {throw "Tauri build failed"}
        $out=New-Item -Force -ItemType Directory artifacts/tauri-windows-x64
        Copy-Item -LiteralPath tauri-host/target/release/wsearch-tauri-trial.exe -Destination $out.FullName
        $oldHelper=Join-Path $out.FullName 'wsearch-capture.exe'
        if(Test-Path -LiteralPath $oldHelper) { Remove-Item -LiteralPath $oldHelper }
    }
    if ($Variant -ne "tauri") {
        cmd /d /c native\build-windows.cmd
        if ($LASTEXITCODE -ne 0) {throw "Native capture build failed"}
        Push-Location electrobun-host
        try {
            bun install --frozen-lockfile
            if ($LASTEXITCODE -ne 0) {throw "Electrobun install failed"}
            bun run build
            if ($LASTEXITCODE -ne 0) {throw "Electrobun build failed"}
            $out=New-Item -Force -ItemType Directory ../artifacts/electrobun-windows-x64
            tar -xf 'build/stable-win-x64/wSearch Electrobun Trial-Setup.tar.zst' -C $out.FullName --strip-components 1
            if ($LASTEXITCODE -ne 0) {throw "Bundle extraction failed"}
        } finally {Pop-Location}
    }
    python -X utf8 bench/package_windows.py $Variant
    if ($LASTEXITCODE -ne 0) {throw "Portable archive failed"}
} finally {Pop-Location}

