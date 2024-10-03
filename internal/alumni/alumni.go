package provider

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
)

// TimeSlot 结构体用于解析 JSON 返回的场地时间段信息
type TimeSlot struct {
	FacilityID  string `json:"facility_id"`
	Date        string `json:"date"`
	StartTime   string `json:"start_time"`
	EndTime     string `json:"end_time"`
	Status      string `json:"status"`
	ActivityName string `json:"activity_name"`
}

// FacilityTimeslotsResponse 结构体用于解析 API 返回的完整 JSON 响应
type FacilityTimeslotsResponse struct {
	Meta struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"meta"`
	Data struct {
		FacilityTimeslots []TimeSlot `json:"facility_timeslots"`
	} `json:"data"`
}

// Booking 函数，负责发送 HTTP POST 请求，预定场地
func Booking(facilityID, startTime, endTime, date string) error {
	url := "https://w5.ab.ust.hk/msalum/api/app/fbs/bookings"

	jsonData := []byte(fmt.Sprintf(`{
      "booking": {
        "facility_id": "%s",
        "start_time": "%s",
        "end_time": "%s",
        "date": "%s"
      }
    }`, facilityID, startTime, endTime, date))

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("error creating request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer oEtjM9HkL9aaEnEyabD8")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("error reading response: %v", err)
	}

	fmt.Println("Response Status:", resp.Status)
	fmt.Println("Response Body:", string(body))

	return nil
}

// GetAvailableTimeSlots 函数用于扫描空闲场地
func GetAvailableTimeSlots(facilityID, startDate, endDate string) ([]TimeSlot, error) {
	url := fmt.Sprintf("https://w5.ab.ust.hk/msalum/api/app/fbs/facility-timeslots?facility_id=%s&start_date=%s&end_date=%s", facilityID, startDate, endDate)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %v", err)
	}

	req.Header.Set("Authorization", "Bearer oEtjM9HkL9aaEnEyabD8")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response: %v", err)
	}

	var response FacilityTimeslotsResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("error parsing response: %v", err)
	}

	if response.Meta.Code != 200 {
		return nil, fmt.Errorf("unexpected response code: %d", response.Meta.Code)
	}

	availableSlots := []TimeSlot{}
	for _, slot := range response.Data.FacilityTimeslots {
		if slot.Status == "Available" {
			availableSlots = append(availableSlots, slot)
		}
	}

	return availableSlots, nil
}
