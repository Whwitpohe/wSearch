@echo off
setlocal
cd /d "%~dp0"
for /f "usebackq tokens=*" %%i in (`"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "trialvs=%%i"
if not defined trialvs exit /b 1
call "%trialvs%\VC\Auxiliary\Build\vcvars64.bat" >nul || exit /b 1
if not exist bin\win32-x64 mkdir bin\win32-x64
cl /nologo /O2 /MT /EHsc /std:c++17 /utf-8 /Fo:bin\win32-x64\capture.obj windows.cpp /Fe:bin\win32-x64\wsearch-capture.exe /link user32.lib gdi32.lib /SUBSYSTEM:WINDOWS
exit /b %errorlevel%

