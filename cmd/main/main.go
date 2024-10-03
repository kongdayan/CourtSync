package main

import (
	// alumni "FBS_HKUST_SPIDER/internal/alumni"
	usthing "FBS_HKUST_SPIDER/internal/usthing"
	"fmt"
	"time"
)

// getNextWeekSameDay 函数，计算下一周的同一天日期
func getNextWeekSameDay() string {
	// 获取当前日期
	today := time.Now()

	// 增加 7 天，得到下一周的同一天
	nextWeek := today.AddDate(0, 0, 7)

	// 格式化日期为 YYYY-MM-DD 格式
	return nextWeek.Format("2006-01-02")
}

// 获取目标时间并等待至指定的时间点
func waitUntilTargetTime() {
	for {
		now := time.Now()
		// 计算当天 UTC+8 的 7:59:50 时间
		target := time.Date(now.Year(), now.Month(), now.Day(), 7, 59, 50, 0, time.FixedZone("UTC+8", 8*3600))

		// 如果已经过了今天的目标时间，等待明天的目标时间
		if now.After(target) {
			target = target.Add(24 * time.Hour)
		}

		// 计算需要睡眠的时间
		sleepDuration := time.Until(target)
		fmt.Printf("Waiting until %s (UTC+8)...\n", target.Format("15:04:05"))

		// 睡眠至目标时间
		time.Sleep(sleepDuration)

		// 到达目标时间后，返回
		return
	}
}

func main() {
	// availableSlots, err := alumni.GetAvailableTimeSlots("29", "2024-10-03", "2024-10-10")
	// if err != nil {
	// 	fmt.Println("Error:", err)
	// 	return
	// }
	
	// for _, slot := range availableSlots {
	// 	fmt.Printf("Available Slot: %s %s - %s\n", slot.Date, slot.StartTime, slot.EndTime)
	// }
	availableSlots, err := usthing.GetUSThingAvailableTimeslots("20789731", "01", "4", "2024-10-03", "2024-10-10")
	if err != nil {
		fmt.Println("Error:", err)
		return
	}

	// 输出可用的时间段
	for _, slot := range availableSlots {
		fmt.Printf("Available Slot: %s %s - %s\n", slot.TimeslotDate, slot.StartTime, slot.EndTime)
	}
}

	// // 可选的 facilityID 列表
	// facilityIDs := []string{"2", "3", "4", "5"}
	// alumni.Booking("2", "19:00", "20:00", "2021-09-30")

	// // 持续运行
	// for {
	// 	// 等待至每天 UTC+8 的 7:59:50
	// 	waitUntilTargetTime()

	// 	// 自动计算下一周的同一天
	// 	nextWeekDate := getNextWeekSameDay()

	// 	// 开始发送请求
	// 	ticker := time.NewTicker(1 * time.Second) // 每秒发送一轮请求
	// 	stopTimer := time.After(20 * time.Second) // 在 20 秒后停止 (从 7:59:50 到 8:00:10 共计20秒)
	// 	done := false

	// 	for !done {
	// 		select {
	// 		case <-stopTimer:
	// 			fmt.Println("Stopping requests at 8:00:10 (UTC+8)")
	// 			done = true
	// 		case <-ticker.C:
	// 			for _, facilityID := range facilityIDs {
	// 				fmt.Println(facilityID, nextWeekDate)
	// 				// 依次发送请求
	// 				err := alumni.Booking(facilityID, "19:00", "20:00", nextWeekDate)
	// 				if err != nil {
	// 					fmt.Printf("Error booking for facility %s: %v\n", facilityID, err)
	// 				} else {
	// 					fmt.Printf("Successfully booked for facility %s\n", facilityID)
	// 				}
	// 			}
	// 		}
	// 	}

	// 	ticker.Stop()
	// }
// }
