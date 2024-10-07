package main

import (
	// alumni "FBS_HKUST_SPIDER/internal/alumni"

	pushdeer "FBS_HKUST_SPIDER/internal/pushdeer"
	service "FBS_HKUST_SPIDER/internal/service"
	"fmt"
	"time"
)

// 获取当前时间（UTC+8）
func getCurrentTimeInUTC8() time.Time {
	// 定义 UTC+8 时区
	utc8 := time.FixedZone("UTC+8", 8*3600)
	// 获取当前 UTC 时间，并将其转换为 UTC+8
	return time.Now().In(utc8)
}

// 等待到指定的目标时间
func waitUntilTargetTime() {
	for {
		now := time.Now()
		// 定义目标时间为 UTC+8 的 8:00:10
		target := time.Date(now.Year(), now.Month(), now.Day(), 8, 00, 10, 0, time.FixedZone("UTC+8", 8*3600))

		// 如果当前时间已经超过了目标时间，则等待明天的同一时间
		if now.After(target) {
			target = target.Add(24 * time.Hour)
		}

		// 计算到目标时间的剩余时间
		sleepDuration := time.Until(target)
		fmt.Printf("Waiting until %s (UTC+8)...\n", target.Format("15:04:05"))

		// 睡眠到目标时间
		time.Sleep(sleepDuration)

		// 到达目标时间后，退出函数
		return
	}
}

func main() {
	// PushDeer PushKey 列表
	pushKeys := []string{
		"PDU6737T1Qnk6LJpLDpreHNd9JM0voDWIT1cs8SB",
		// 添加更多 PushKey...
	}

	// 创建 PushDeerService
	pushDeerService := pushdeer.NewPushDeerService(pushKeys)

	// 创建一个 Ticker，每隔 1 分钟触发一次
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	// 无限循环以定期运行任务
	for {
		now := getCurrentTimeInUTC8()
		hour := now.Hour()

		// 如果当前时间在 8:00 到 22:00 之间，执行任务
		if hour >= 8 && hour < 22 {
			fmt.Println("开始执行任务: ", now)

			// 调用 UpdateTimeSlots 函数，获取可用的时间段
			unifiedSlots, err := service.UpdateTimeSlots()
			if err != nil {
				fmt.Println("Error updating timeslots:", err)
				continue
			}

			// 调用 PushDeerService 推送结果
			err = pushDeerService.PushTimeSlots(unifiedSlots)
			if err != nil {
				fmt.Println("Error pushing timeslots:", err)
			}

			// 休眠1分钟后再次检查并执行任务
			time.Sleep(1 * time.Minute)

		} else {
			// 如果当前时间晚于 22:00 或早于 8:00，则等待到第二天 8:00
			fmt.Println("当前时间不在 8:00 到 22:00 之间，进入休眠...")
			waitUntilTargetTime()
		}
	}
}
