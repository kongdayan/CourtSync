package service

import (
	"FBS_HKUST_SPIDER/internal/alumni"
	"FBS_HKUST_SPIDER/internal/usthing"
	"fmt"
	"time"
)

// UnifiedTimeSlot 代表统一的数据结构
type UnifiedTimeSlot struct {
	FacilityID   string // 将整数转换为字符串
	Date         string // 统一使用 date/timeslotDate
	StartTime    string
	EndTime      string
	Status       string // 统一使用 status/timeslotStatus
	ActivityName string
}

// String 方法将 UnifiedTimeSlot 转换为字符串
func (u UnifiedTimeSlot) String() string {
	return fmt.Sprintf("FacilityID: %s, Date: %s, StartTime: %s, EndTime: %s, Status: %s, ActivityName: %s",
		u.FacilityID, u.Date, u.StartTime, u.EndTime, u.Status, u.ActivityName)
}

// ConvertAlumniToUnified 将 AlumniTimeSlot 转换为 UnifiedTimeSlot
func ConvertAlumniToUnified(alumniSlots []alumni.AlumniTimeSlot) []UnifiedTimeSlot {
	var unifiedSlots []UnifiedTimeSlot

	for _, slot := range alumniSlots {
		unifiedSlot := UnifiedTimeSlot{
			FacilityID:   slot.FacilityID,
			Date:         slot.Date,
			StartTime:    slot.StartTime,
			EndTime:      slot.EndTime,
			Status:       slot.Status,
			ActivityName: slot.ActivityName,
		}
		unifiedSlots = append(unifiedSlots, unifiedSlot)
	}

	return unifiedSlots
}

// ConvertUSThingToUnified 将 USThingTimeSlot 转换为 UnifiedTimeSlot
func ConvertUSThingToUnified(usthingSlots []usthing.USThingTimeSlot) []UnifiedTimeSlot {
	var unifiedSlots []UnifiedTimeSlot

	for _, slot := range usthingSlots {
		unifiedSlot := UnifiedTimeSlot{
			FacilityID:   fmt.Sprintf("%d", slot.FacilityID), // 将 int 转换为 string
			Date:         slot.TimeslotDate,
			StartTime:    slot.StartTime,
			EndTime:      slot.EndTime,
			Status:       slot.TimeslotStatus,
			ActivityName: slot.ActivityName,
		}
		unifiedSlots = append(unifiedSlots, unifiedSlot)
	}

	return unifiedSlots
}

// GetNextWeekSameDay 获取下周同一天的日期
func GetNextWeekSameDay() string {
	today := time.Now()
	nextWeek := today.AddDate(0, 0, 7)
	return nextWeek.Format("2006-01-02")
}

// UpdateTimeSlots 获取所有场地下周同一天的时间段，并转换为统一格式
func UpdateTimeSlots() ([]UnifiedTimeSlot, error) {
	// 定义需要循环的场地 ID
	facilityIDs := []string{"29", "3", "4", "5"}

	// 存放所有合并的时间段
	var allAlumniSlots []alumni.AlumniTimeSlot

	// 获取当前日期
	toDay := time.Now().Format("2006-01-02")

	// 获取下周同一天的日期
	nextWeekDate := GetNextWeekSameDay()

	// 遍历每个场地 ID，获取时间段并合并
	for _, facilityID := range facilityIDs {
		slots, err := alumni.GetAvailableTimeSlots(facilityID, toDay, nextWeekDate)
		if err != nil {
			return nil, fmt.Errorf("error fetching timeslots for facility %s: %v", facilityID, err)
		}

		// 合并时间段
		allAlumniSlots = append(allAlumniSlots, slots...)
	}

	// 将合并的所有时间段转换为 UnifiedTimeSlot
	unifiedSlots := ConvertAlumniToUnified(allAlumniSlots)

	return unifiedSlots, nil
}
