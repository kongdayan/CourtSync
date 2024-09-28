package provider

import (
	"bytes"
	"fmt"
	"io/ioutil"
	"net/http"
)

// booking 函数，负责发送 HTTP POST 请求
func Booking(facilityID, startTime, endTime, date string) error {
	// API URL
	url := "https://w5.ab.ust.hk/msalum/api/app/fbs/bookings"

	// 构造 JSON 数据
	jsonData := []byte(fmt.Sprintf(`{
      "booking": {
        "facility_id": "%s",
        "start_time": "%s",
        "end_time": "%s",
        "date": "%s"
      }
    }`, facilityID, startTime, endTime, date))

	// 创建一个新的 HTTP POST 请求
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("error creating request: %v", err)
	}

	// 设置请求头
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer oEtjM9HkL9aaEnEyabD8")

	// 发送请求
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()

	// 读取响应
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("error reading response: %v", err)
	}

	// 输出响应状态和内容
	fmt.Println("Response Status:", resp.Status)
	fmt.Println("Response Body:", string(body))

	return nil
}
