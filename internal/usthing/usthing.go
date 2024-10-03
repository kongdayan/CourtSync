package provider

import (
	"net/http"
	"encoding/json"
	"fmt"
	"io/ioutil"
)

// TimeSlot 结构体用于解析 JSON 返回的场地时间段信息
type USThingTimeSlot struct {
	FacilityID     int    `json:"facilityID"`
	TimeslotDate   string `json:"timeslotDate"`
	StartTime      string `json:"startTime"`
	EndTime        string `json:"endTime"`
	TimeslotStatus string `json:"timeslotStatus"`
	ActivityName   string `json:"activityName"`
}

// USThingTimeslotResponse 结构体用于解析 API 返回的完整 JSON 响应
type USThingTimeslotResponse struct {
	Status      string            `json:"status"`
	Message     string            `json:"message"`
	FacilityID  int               `json:"facilityID"`
	UserType    string            `json:"userType"`
	UstID       string            `json:"ustID"`
	StartDate   string            `json:"startDate"`
	EndDate     string            `json:"endDate"`
	TimeSlots   []USThingTimeSlot `json:"timeslot"`
}

// GenerateHeaders 生成通用的 HTTP 请求头
func GenerateHeaders() http.Header {
	headers := http.Header{}
	headers.Set("Accept", "application/json")
	headers.Set("Content-Length", "0")
	headers.Set("Connection", "keep-alive")
	headers.Set("Cookie", "language=en-US")
	headers.Set("User-Agent", "USThing/113 CFNetwork/1568.100.1 Darwin/24.0.0")
	headers.Set("Authorization", "Bearer eyJ0eXAiOiJKV1QiLCJub25jZSI6ImJJX2dTZTZIdkxtUjFvSVI2d2ZnOTlISE1fOUo0Y3o4THB1WVgyX2FSbVEiLCJhbGciOiJSUzI1NiIsIng1dCI6Ik1jN2wzSXo5M2c3dXdnTmVFbW13X1dZR1BrbyIsImtpZCI6Ik1jN2wzSXo5M2c3dXdnTmVFbW13X1dZR1BrbyJ9.eyJhdWQiOiIwMDAwMDAwMy0wMDAwLTAwMDAtYzAwMC0wMDAwMDAwMDAwMDAiLCJpc3MiOiJodHRwczovL3N0cy53aW5kb3dzLm5ldC9jOTE3ZjNlMi05MzIyLTQ5MjYtOWJiMy1kYWNhNzMwNDEzY2EvIiwiaWF0IjoxNzI3NTI5ODU3LCJuYmYiOjE3Mjc1Mjk4NTcsImV4cCI6MTcyNzUzNDg0NywiYWNjdCI6MSwiYWNyIjoiMSIsImFpbyI6IkFVUUF1LzhZQUFBQVlTc0pIWkZvZmJrUThMaVJuL0oyTnAyaUlCU2ZvWTRsTDh3ZE9VTjJtOXpTYTREdUVZT2xmVE9hWmJjanNHbXlIc3NyZ25KTTRBN2p3V3Jxa3RObEpBPT0iLCJhbHRzZWNpZCI6IjU6OjEwMDMyMDAxNjVFRTg3QjMiLCJhbXIiOlsicHdkIl0sImFwcF9kaXNwbGF5bmFtZSI6IlVTVGhpbmciLCJhcHBpZCI6ImI0YmM0YjlhLTcxNjItNDRjNS1iYjUwLWZlOTM1ZGNlMWY1YSIsImFwcGlkYWNyIjoiMCIsImVtYWlsIjoieWFuYWdAY29ubmVjdC51c3QuaGsiLCJpZHAiOiJodHRwczovL3N0cy53aW5kb3dzLm5ldC82YzFkNDE1Mi0zOWQwLTQ0Y2EtODhkOS1iOGQ2ZGRjYTA3MDgvIiwiaWR0eXAiOiJ1c2VyIiwiaXBhZGRyIjoiMTEyLjY1Ljk4LjEzMSIsIm5hbWUiOiJBTiBZaXFpIiwib2lkIjoiZDQ1Mjg2YzYtNTY1OS00ZDZlLWFmMDgtZDBlNjljYmNlMDcxIiwicGxhdGYiOiIyIiwicHVpZCI6IjEwMDMyMDAxRjM4MkJFMzYiLCJyaCI6IjAuQVZRQTR2TVh5U0tUSmttYnM5cktjd1FUeWdNQUFBQUFBQUFBd0FBQUFBQUFBQUJVQUpnLiIsInNjcCI6IlVzZXIuUmVhZCBwcm9maWxlIG9wZW5pZCBlbWFpbCIsInNpZ25pbl9zdGF0ZSI6WyJrbXNpIl0sInN1YiI6InRzam4zenRVTUxpQmpvLU1CT0tHYWt6bUY3VmhBdDJFQUxvMmVHQmwydUUiLCJ0ZW5hbnRfcmVnaW9uX3Njb3BlIjoiQVMiLCJ0aWQiOiJjOTE3ZjNlMi05MzIyLTQ5MjYtOWJiMy1kYWNhNzMwNDEzY2EiLCJ1bmlxdWVfbmFtZSI6InlhbmFnQGNvbm5lY3QudXN0LmhrIiwidXRpIjoicS1Cck9nVXBpMFdNZHNCSF9NQlNBQSIsInZlciI6IjEuMCIsIndpZHMiOlsiMTNiZDFjNzItNmY0YS00ZGNmLTk4NWYtMThkM2I4MGYyMDhhIl0sInhtc19pZHJlbCI6IjggNSIsInhtc19zdCI6eyJzdWIiOiJ1X3dGaktXQkFPSkdYbmp0Qi12ZjlmSndlb3BtenBMRjhCeURmcTR1eGFnIn0sInhtc190Y2R0IjoxNDM5MjgzNDM3fQ.FFFor0NOQLD4-yTJUL6fBaxdpQ4Ie1ef6gHYeD3ZKUaZbSj1Awa4cdncweE7pmCPB9owNy14wNFneWmMUhohSteSE7TI33oIf0DvA3WBoh_Vpvozandh4i2UxuYYReSXP7PgTK5FUSnLReJWMadu-xQNDHVQQAZVdYSSNmALkjBmhYPq1bQgzSTjG42CitSYQ3TcSHnbY6Y2LlqnYLfpdxJ6tIwJH9MOCefBpkAiAcZQ0JIbUC3KkJZJRKDGSFTFsO6m60jGDYn_RaCFSR4R_S51U2Zk_yP-g2u0GVV9v--j7l7BazzF5cjqFtCkUdBhvMPS_POgdfos5vrn1aWzbg")

	return headers
}

// GetUSThingAvailableTimeslots 函数用于扫描空闲场地
func GetUSThingAvailableTimeslots(ustID, userType, facilityID, startDate, endDate string) ([]USThingTimeSlot, error) {
	url := fmt.Sprintf("https://ms.api.usthing.xyz/v1/fbs/facilityTimeslot?ustID=%s&userType=%s&facilityID=%s&startDate=%s&endDate=%s", ustID, userType, facilityID, startDate, endDate)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %v", err)
	}

	// 复用通用 header
	req.Header = GenerateHeaders()

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()

	// 读取响应
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response: %v", err)
	}

	// 解析 JSON
	var response USThingTimeslotResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("error parsing response: %v", err)
	}

	// 检查响应状态
	if response.Status != "200" {
		return nil, fmt.Errorf("unexpected status: %s", response.Status)
	}

	// 过滤出所有 timeslotStatus 为 "Reserved" 的时间段
	availableSlots := []USThingTimeSlot{}
	for _, slot := range response.TimeSlots {
		if slot.TimeslotStatus == "Available" {
			availableSlots = append(availableSlots, slot)
		}
	}

	return availableSlots, nil
}

// USThingBooking 函数，负责发送 HTTP POST 请求，预定场地
func Booking(ustID, userType, facilityID, timeslotDate, startTime, endTime, cancelInd string) error {
	// API URL
	url := fmt.Sprintf("https://ms.api.usthing.xyz/v1/fbs/book?ustID=%s&userType=%s&facilityID=%s&timeslotDate=%s&startTime=%s&endTime=%s&cancelInd=%s", ustID, userType, facilityID, timeslotDate, startTime, endTime, cancelInd)

	// 创建一个新的 HTTP POST 请求
	req, err := http.NewRequest("POST", url, nil)
	if err != nil {
		return fmt.Errorf("error creating request: %v", err)
	}

	// 复用 header
	req.Header = GenerateHeaders()

	// 发送请求
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("received non-OK HTTP status: %s", resp.Status)
	}

	fmt.Println("Booking successful!")

	return nil
}
