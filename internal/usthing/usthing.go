package usthing

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
)

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

// TimeSlot 结构体用于解析 JSON 返回的场地时间段信息
type USThingTimeSlot struct {
	FacilityID     int    `json:"facilityID"`
	TimeslotDate   string `json:"timeslotDate"`
	StartTime      string `json:"startTime"`
	EndTime        string `json:"endTime"`
	TimeslotStatus string `json:"timeslotStatus"`
	ActivityName   string `json:"activityName"`
}

// USThingTimeslotResponse 结构体用于解析 扫场请求的 JSON 响应
type USThingTimeslotResponse struct {
	Status     string            `json:"status"`
	Message    string            `json:"message"`
	FacilityID int               `json:"facilityID"`
	UserType   string            `json:"userType"`
	UstID      string            `json:"ustID"`
	StartDate  string            `json:"startDate"`
	EndDate    string            `json:"endDate"`
	TimeSlots  []USThingTimeSlot `json:"timeslot"`
}

// USThingBookingResponse 结构体用于解析 Booking请求的 JSON 响应
type USThingBookingResponse struct {
	Status        string        `json:"status"`
	Message       string        `json:"message"`
	ErrorCode     string        `json:"errorCode"`
	TotalRecord   int           `json:"totalRecord"`
	UserType      string        `json:"userType"`
	UstID         string        `json:"ustID"`
	EmailAddr     string        `json:"emailAddr"`
	FacilityID    int           `json:"facilityID"`
	TimeslotDate  string        `json:"timeslotDate"`
	StartTime     string        `json:"startTime"`
	EndTime       string        `json:"endTime"`
	BookingRef    int           `json:"bookingRef"`
	CancelInd     *string       `json:"cancelInd"` // 因为 cancelInd 可以为 null，所以使用指针类型
	BookingResult []interface{} `json:"bookingResult"`
}

// GetUSThingAvailableTimeslots 函数用于扫描空闲场地
func GetAvailableTimeSlots(ustID, userType, facilityID, startDate, endDate string) ([]USThingTimeSlot, error) {
	// 如果ustID为空，使用默认值
	if ustID == "" {
		ustID = "yanag"
	}
	url := fmt.Sprintf("https://ms.api.usthing.xyz/v1/fbs/facilityTimeslot?ustID=%s&userType=%s&facilityID=%s&startDate=%s&endDate=%s", ustID, userType, facilityID, startDate, endDate)

	log.Printf("正在请求API: %s", url)

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

	log.Printf("API响应状态码: %d", resp.StatusCode)

	// 读取响应
	body, err := io.ReadAll(resp.Body)
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
		log.Printf("API返回非200状态: %s, 错误信息: %s", response.Status, response.Message)
		return nil, fmt.Errorf("unexpected status: %s, message: %s", response.Status, response.Message)
	}

	log.Printf("成功获取时间段数据，总数: %d", len(response.TimeSlots))

	// 过滤出所有 timeslotStatus 为 "Available" 的时间段
	availableSlots := []USThingTimeSlot{}
	for _, slot := range response.TimeSlots {
		if slot.TimeslotStatus == "Available" {
			availableSlots = append(availableSlots, slot)
		}
	}

	log.Printf("筛选出可用时间段数: %d", len(availableSlots))

	return availableSlots, nil
}

// USThingBooking 函数，负责发送 HTTP POST 请求，预定场地并返回解析后的响应
func Booking(ustID, userType, facilityID, timeslotDate, startTime, endTime, cancelInd string) (*USThingBookingResponse, error) {
	// API URL
	url := fmt.Sprintf("https://ms.api.usthing.xyz/v1/fbs/book?ustID=%s&userType=%s&facilityID=%s&timeslotDate=%s&startTime=%s&endTime=%s&cancelInd=%s", ustID, userType, facilityID, timeslotDate, startTime, endTime, cancelInd)

	// 创建一个新的 HTTP POST 请求
	req, err := http.NewRequest("POST", url, nil)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %v", err)
	}

	// 复用 header
	req.Header = GenerateHeaders()

	// 发送请求
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println(resp.Status)
		return nil, fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()

	// 读取响应体
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response body: %v", err)
	}

	// 检查 HTTP 响应状态
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("received non-OK HTTP status: %s, body: %s", resp.Status, string(body))
	}

	// 解析 JSON 响应
	var bookingResponse USThingBookingResponse
	if err := json.Unmarshal(body, &bookingResponse); err != nil {
		return nil, fmt.Errorf("error parsing JSON response: %v", err)
	}

	// 检查 API 返回的 status 字段
	if bookingResponse.Status == "200" {
		fmt.Println("Booking successful!")
	} else {
		// 如果 status 不为 200，输出错误信息
		fmt.Printf("Booking failed: %s\n", bookingResponse.Message)
	}

	return &bookingResponse, nil
}
