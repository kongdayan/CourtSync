$PROJECT_NAME = "FBS_HKUST_SPIDER"
$MAIN_DIR = "../cmd/main"

# 清理依赖
go mod tidy

# 编译项目
Write-Host "Building project $PROJECT_NAME ..."
go build -o $PROJECT_NAME $MAIN_DIR

# 检查是否编译成功
if ($LASTEXITCODE -eq 0) {
    Write-Host "Build successful!"
} else {
    Write-Host "Build failed!"
    exit 1
}
