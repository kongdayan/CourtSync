@echo off
set PROJECT_NAME=FBS_HKUST_SPIDER
set MAIN_DIR=..\cmd\main

rem 清理依赖
go mod tidy

rem 编译项目
echo Building project %PROJECT_NAME% ...
go build -o %PROJECT_NAME% %MAIN_DIR%

rem 检查是否编译成功
if %ERRORLEVEL% equ 0 (
    echo Build successful!
) else (
    echo Build failed!
    exit /b 1
)
