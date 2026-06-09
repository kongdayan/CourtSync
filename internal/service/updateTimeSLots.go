package service

import (
	"FBS_HKUST_SPIDER/internal/jiushi"
	"FBS_HKUST_SPIDER/internal/usthing"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"
)

// UnifiedTimeSlot 代表统一的数据结构
type UnifiedTimeSlot struct {
	FacilityID   string
	Date         string
	StartTime    string
	EndTime      string
	Status       string
	ActivityName string
}

func (u UnifiedTimeSlot) String() string {
	return fmt.Sprintf("FacilityID: %s, Date: %s, StartTime: %s, EndTime: %s, Status: %s, ActivityName: %s",
		u.FacilityID, u.Date, u.StartTime, u.EndTime, u.Status, u.ActivityName)
}

// ConvertUSThingToUnified 将 USThingTimeSlot 转换为 UnifiedTimeSlot
func ConvertUSThingToUnified(usthingSlots []usthing.USThingTimeSlot) []UnifiedTimeSlot {
	var unifiedSlots []UnifiedTimeSlot
	for _, slot := range usthingSlots {
		unifiedSlot := UnifiedTimeSlot{
			FacilityID:   fmt.Sprintf("%d", slot.FacilityID),
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

// getDefaultFacilityIDs 从环境变量或使用默认值
func getDefaultFacilityIDs() []string {
	ids := os.Getenv("USTHING_FACILITY_IDS")
	if ids != "" {
		return splitAndTrim(ids, ",")
	}
	return []string{"2", "3", "4", "5", "79", "80", "100", "101"}
}

func splitAndTrim(s, sep string) []string {
	parts := make([]string, 0)
	for _, p := range splitStr(s, sep) {
		p = trim(p)
		if p != "" {
			parts = append(parts, p)
		}
	}
	return parts
}

func splitStr(s, sep string) []string {
	var result []string
	start := 0
	for i := 0; i < len(s); i++ {
		if string(s[i]) == sep {
			result = append(result, s[start:i])
			start = i + 1
		}
	}
	result = append(result, s[start:])
	return result
}

func trim(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t') {
		s = s[1:]
	}
	for len(s) > 0 && (s[len(s)-1] == ' ' || s[len(s)-1] == '\t') {
		s = s[:len(s)-1]
	}
	return s
}

// UpdateTimeSlots 获取所有场地下周同一天的时间段，并转换为统一格式
func UpdateTimeSlots() ([]UnifiedTimeSlot, error) {
	facilityIDs := getDefaultFacilityIDs()
	var allUSThingSlots []usthing.USThingTimeSlot

	toDay := time.Now().Format("2006-01-02")
	nextWeekDate := GetNextWeekSameDay()

	for _, facilityID := range facilityIDs {
		slots, err := usthing.GetAvailableTimeSlots("", "01", facilityID, toDay, nextWeekDate)
		if err != nil {
			return nil, fmt.Errorf("error fetching timeslots for facility %s: %v", facilityID, err)
		}
		allUSThingSlots = append(allUSThingSlots, slots...)
	}

	return ConvertUSThingToUnified(allUSThingSlots), nil
}

// UpdateJiushiTimeSlots Jiushi 场地扫描
func UpdateJiushiTimeSlots(venueID string) ([]UnifiedTimeSlot, error) {
	maxDays := 9
	if d := os.Getenv("JIUSHI_MAX_DAYS"); d != "" {
		if n, err := strconv.Atoi(d); err == nil && n > 0 {
			maxDays = n
		}
	}

	groundFilter := make(map[string]bool)
	if ids := os.Getenv("JIUSHI_GROUND_IDS"); ids != "" {
		for _, id := range splitAndTrim(ids, ",") {
			groundFilter[id] = true
		}
	}

	var allSlots []UnifiedTimeSlot
	today := time.Now()

	for i := 0; i < maxDays; i++ {
		date := today.AddDate(0, 0, i)
		bookTime := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC).Unix()

		resp, err := jiushi.QueryVenueData(venueID, bookTime)
		if err != nil {
			return nil, fmt.Errorf("jiushi query failed for %s: %v", date.Format("2006-01-02"), err)
		}

		for _, status := range resp.Data.StatusList {
			startMs := status.StartTime
			endMs := status.EndTime
			slotDate := time.Unix(startMs/1000, 0).In(time.FixedZone("UTC+8", 8*3600)).Format("2006-01-02")
			startTime := time.Unix(startMs/1000, 0).In(time.FixedZone("UTC+8", 8*3600)).Format("15:04")
			endTime := time.Unix(endMs/1000, 0).In(time.FixedZone("UTC+8", 8*3600)).Format("15:04")

			for _, block := range status.BlockModel {
				if len(groundFilter) > 0 && !groundFilter[block.GroundId] {
					continue
				}
				statusLabel := "Unavailable"
				if block.Status == "1" {
					statusLabel = "Available"
				}
				allSlots = append(allSlots, UnifiedTimeSlot{
					FacilityID:   block.GroundId,
					Date:         slotDate,
					StartTime:    startTime,
					EndTime:      endTime,
					Status:       statusLabel,
					ActivityName: block.GroundName,
				})
			}
		}
	}

	log.Printf("[Jiushi] Scanned %d days, %d total slots", maxDays, len(allSlots))
	return allSlots, nil
}
