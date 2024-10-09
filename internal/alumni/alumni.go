package alumni

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// GenerateHeaders 生成通用的 HTTP 请求头
func GenerateHeaders() http.Header {
	headers := http.Header{}
	headers.Set("Content-Type", "application/json")
	headers.Set("Authorization", "Bearer oEtjM9HkL9aaEnEyabD8")
	return headers
}

// AlumniBookingResponse 结构体用于解析 API 返回的 JSON 响应
type AlumniBookingResponse struct {
	Meta struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"meta"`
}

// TimeSlot 结构体用于解析 JSON 返回的场地时间段信息
type AlumniTimeSlot struct {
	FacilityID   string `json:"facility_id"`
	Date         string `json:"date"`
	StartTime    string `json:"start_time"`
	EndTime      string `json:"end_time"`
	Status       string `json:"status"`
	ActivityName string `json:"activity_name"`
}

// FacilityTimeslotsResponse 结构体用于解析 API 返回的完整 JSON 响应
type AlumniGetAvailableTimeSlotsResponse struct {
	Meta struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"meta"`
	Data struct {
		FacilityTimeslots []AlumniTimeSlot `json:"facility_timeslots"`
	} `json:"data"`
}

// Booking 函数，负责发送 HTTP POST 请求，预定场地并返回解析后的响应
func Booking(facilityID, startTime, endTime, date string) (*AlumniBookingResponse, error) {
	url := "https://w5.ab.ust.hk/msalum/api/app/fbs/bookings"

	// 构建请求体的 JSON 数据
	jsonData := []byte(fmt.Sprintf(`{
		"booking": {
			"facility_id": "%s",
			"start_time": "%s",
			"end_time": "%s",
			"date": "%s"
		}
	}`, facilityID, startTime, endTime, date))

	// 创建 HTTP POST 请求
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("error creating request: %v", err)
	}

	// 添加请求头信息
	req.Header = GenerateHeaders()

	// 发送请求并获取响应
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()

	// 读取响应体
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response: %v", err)
	}

	// 解析 JSON 响应
	var bookingResponse AlumniBookingResponse
	if err := json.Unmarshal(body, &bookingResponse); err != nil {
		return nil, fmt.Errorf("error parsing response: %v", err)
	}

	// 检查 API 返回的状态码
	if bookingResponse.Meta.Code == 200 {
		fmt.Println("Booking成功")
	} else if bookingResponse.Meta.Code == 400 {
		fmt.Printf("Booking失败: %s\n", bookingResponse.Meta.Message)
	} else {
		fmt.Printf("Unexpected response code: %d\n", bookingResponse.Meta.Code)
	}

	return &bookingResponse, nil
}

// GetAvailableTimeSlots 获得某个场地在某个日期范围内的可用时间段
func GetAvailableTimeSlots(facilityID, startDate, endDate string) ([]AlumniTimeSlot, error) {
	// 扫描 某个指定 facilityID 一段日期内的预定情况 (最长可一周)
	url := fmt.Sprintf("https://w5.ab.ust.hk/msalum/api/app/fbs/facility-timeslots?facility_id=%s&start_date=%s&end_date=%s", facilityID, startDate, endDate)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %v", err)
	}

	req.Header = GenerateHeaders()

	// 临时禁用证书验证
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
	client := &http.Client{Transport: tr}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response: %v", err)
	}

	var response AlumniGetAvailableTimeSlotsResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("error parsing response: %v", err)
	}

	if response.Meta.Code != 200 {
		return nil, fmt.Errorf("unexpected response code: %d", response.Meta.Code)
	}

	availableSlots := []AlumniTimeSlot{}
	for _, slot := range response.Data.FacilityTimeslots {
		if slot.Status == "Available" {
			availableSlots = append(availableSlots, slot)
		}
	}

	return availableSlots, nil
}
