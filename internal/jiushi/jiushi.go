package jiushi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// GenerateHeaders 生成通用的 HTTP 请求头，直接使用 cURL 中的静态参数
func GenerateHeaders() http.Header {
	headers := http.Header{}
	headers.Set("Connection", "keep-alive")
	headers.Set("app_id", "0ff444f417de34c1352af3b3ffc30348")
	headers.Set("cookie", "ssxmod_itna3=C50qzx2D9GYYqDvI4QT4CqPxRh4xnDWu5PDQYKpDUBA+40ydidYXDExDPD8DXxBKGRU6M5iDGGG4DzRcdY+ND7oeDsUxBoDThe+LklDQHQ33WeRDPa3WP3KDZnxBdDqx0EH1H=SPSHW9W4zslhsD3YhsC2dYAYD02qDRxD1i4i79YExPK7+BhiGVPBPam0+Iz8=E88=4D;; acw_tc=ac11000117320139878728712e01289119415469e04ea58c2bca1128695933")
	headers.Set("os_type", "wechat_mini")
	headers.Set("content-type", "application/json")
	headers.Set("os_version", "iOS 18.1")
	headers.Set("fullMobile", "[object Undefined]")
	headers.Set("gw_channel", "api")
	headers.Set("device_type", "iPhone 13<iPhone14,5>")
	headers.Set("js_sign", "Y2Y1YmUyYzNmMzE3OTAyM2I4YzM1YThkY2JhOWU4NmM=") // 静态签名
	headers.Set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.54(0x18003625) NetType/WIFI Language/zh_CN")
	headers.Set("Referer", "https://servicewechat.com/wxbd4ec54a9e9ce6dd/119/page-frame.html")
	return headers
}

// Ground represents a single ground returned by the API
type Ground struct {
	GroundId string `json:"groundId"`
	Name     string `json:"name"`
}

// BlockModel represents the availability and pricing of a ground at a specific time
type BlockModel struct {
	GroundId   string `json:"groundId"`
	GroundName string `json:"groundName"`
	Id         string `json:"id"`
	Price      string `json:"price"`
	SportsType string `json:"sportsType"`
	Status     string `json:"status"` // 0 for available, 1 for unavailable
}

// StatusList contains the block models for a specific time range
type StatusList struct {
	BlockModel []BlockModel `json:"blockModel"`
	StartTime  int64        `json:"startTime"`
	EndTime    int64        `json:"endTime"`
	MinHour    string       `json:"minHour"`
}

// VenueResponse is the full API response structure
type VenueResponse struct {
	Data struct {
		GroundList []Ground     `json:"groundList"`
		StatusList []StatusList `json:"statusList"`
	} `json:"data"`
	RtnCode    string `json:"rtnCode"`
	RtnMessage string `json:"rtnMessage"`
}

// QueryVenueData queries the API for venue data
func QueryVenueData(venueId string, bookTime int64) (*VenueResponse, error) {
	url := "https://jsapp.jussyun.com/jiushi-core/venue/getVenueGround"

	// 构造请求体
	payload := map[string]interface{}{
		"venueId":  venueId,
		"bookTime": bookTime * 1000, // Convert to milliseconds
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("error marshalling payload: %v", err)
	}
	payloadString := string(payloadBytes)

	// Debugging: Print the URL and body
	fmt.Printf("Request URL: %s\n", url)
	fmt.Printf("Request Body: %s\n", payloadString)

	// 创建 HTTP 请求
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return nil, fmt.Errorf("error creating request: %v", err)
	}

	// 设置请求头
	req.Header = GenerateHeaders()

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()

	// 读取响应体
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response body: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected HTTP status: %s, response body: %s", resp.Status, string(body))
	}

	var venueResponse VenueResponse
	if err := json.Unmarshal(body, &venueResponse); err != nil {
		return nil, fmt.Errorf("error parsing JSON response: %v", err)
	}

	if venueResponse.RtnCode != "10000" {
		return nil, fmt.Errorf("API returned error: %s", venueResponse.RtnMessage)
	}

	return &venueResponse, nil
}

// ExampleUsage demonstrates how to use the module
func ExampleUsage() {
	bookTime := time.Date(2024, 11, 20, 0, 0, 0, 0, time.UTC).Unix()
	venueId := "27" // Example: 27 for 9-35号场

	response, err := QueryVenueData(venueId, bookTime)
	if err != nil {
		fmt.Printf("Error querying venue data: %v\n", err)
		return
	}

	for _, ground := range response.Data.GroundList {
		fmt.Printf("Ground: %s, ID: %s\n", ground.Name, ground.GroundId)
	}
}
