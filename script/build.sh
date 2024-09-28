#!/bin/bash

# 设置项目的主路径
PROJECT_NAME="FBS_HKUST_SPIDER"
MAIN_DIR="../cmd/main"

# 清理依赖
go mod tidy

# 编译项目
echo "Building project $PROJECT_NAME ..."
go build -o $PROJECT_NAME $MAIN_DIR

# 检查是否编译成功
if [ $? -eq 0 ]; then
    echo "Build successful!"
else
    echo "Build failed!"
    exit 1
fi
