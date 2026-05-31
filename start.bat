@echo off
chcp 65001 > nul
cd /d "%~dp0"
title MTG Token Finder

echo.
echo  ==========================================
echo   MTG Token Finder
echo  ==========================================
echo.

:: ---- Node.js チェック ----
node --version > nul 2>&1
if errorlevel 1 (
    echo [エラー] Node.js が見つかりません。
    echo.
    echo 以下のURLからインストールしてから、もう一度このファイルを開いてください。
    echo   https://nodejs.org/ja/
    echo.
    pause
    exit /b 1
)

:: ---- 依存パッケージ（初回のみ自動インストール） ----
if not exist "node_modules\" (
    echo 初回起動のため、必要なパッケージをインストールしています...
    echo （次回からはすぐ起動します）
    echo.
    npm install
    if errorlevel 1 (
        echo.
        echo [エラー] インストールに失敗しました。ネット接続を確認してください。
        pause
        exit /b 1
    )
    echo.
)

:: ---- 2秒後にブラウザを開く（バックグラウンドで予約） ----
start "" cmd /c "timeout /t 2 /nobreak > nul && start http://localhost:5177"

:: ---- サーバ起動（フォアグラウンド） ----
echo サーバを起動しています...
echo ブラウザが自動で開きます。http://localhost:5177
echo.
echo  このウィンドウを閉じると停止します。
echo  ──────────────────────────────────────────
echo.
node server.mjs

:: サーバが止まったとき
echo.
echo サーバが停止しました。このウィンドウを閉じてください。
pause > nul
