@echo off
REM PatternForge launcher - klik dua kali file ini untuk menjalankan aplikasi.
REM Jangan tutup jendela hitam ini selama memakai aplikasi.
cd /d "%~dp0apps\desktop"
echo Menyalakan PatternForge, tunggu sebentar...
start http://localhost:4173/
npx vite preview --port 4173 --strictPort
pause
