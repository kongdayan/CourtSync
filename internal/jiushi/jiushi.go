package jiushi

import (
	"bytes"
	"crypto/md5"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	jiushiSalt = "527093093C418483029EEC61F70E9DD1"
	jiushiAPI  = "https://jsapp.jussyun.com/jiushi-core/venue/getVenueGround"
)

// ---- Automated acw_tc cookie acquisition ----

var (
	cachedAcwTc     string
	cachedAcwTcExp  time.Time
	acwTcMu         sync.Mutex
)

// acquireAcwTc 自动获取阿里云 ESA WAF 的 acw_tc cookie。
// 发送一次不带 cookie 的预热请求，WAF 会在 Set-Cookie 中返回 token。
func acquireAcwTc() (string, error) {
	acwTcMu.Lock()
	defer acwTcMu.Unlock()

	if cachedAcwTc != "" && time.Now().Add(5*time.Minute).Before(cachedAcwTcExp) {
		return cachedAcwTc, nil
	}

	req, err := http.NewRequest("POST", jiushiAPI, bytes.NewBufferString("{}"))
	if err != nil {
		return "", fmt.Errorf("error creating warmup request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.54(0x18003625) NetType/WIFI Language/zh_CN")
	req.Header.Set("Referer", "https://servicewechat.com/wxbd4ec54a9e9ce6dd/119/page-frame.html")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("warmup request failed: %v", err)
	}
	resp.Body.Close()

	setCookie := resp.Header.Get("Set-Cookie")
	if setCookie == "" {
		return "", fmt.Errorf("WAF did not return Set-Cookie header")
	}

	acwStart := strings.Index(setCookie, "acw_tc=")
	if acwStart == -1 {
		return "", fmt.Errorf("acw_tc not found in Set-Cookie")
	}
	acwValue := setCookie[acwStart+7:]
	if semiIdx := strings.Index(acwValue, ";"); semiIdx != -1 {
		acwValue = acwValue[:semiIdx]
	}

	cachedAcwTc = "acw_tc=" + acwValue
	cachedAcwTcExp = time.Now().Add(3600 * time.Second)
	log.Println("[Jiushi] Acquired fresh acw_tc cookie")
	return cachedAcwTc, nil
}

func clearAcwTc() {
	acwTcMu.Lock()
	defer acwTcMu.Unlock()
	cachedAcwTc = ""
	log.Println("[Jiushi] acw_tc cache cleared")
}

// ---- Signing ----

func generateJsSign(payload map[string]interface{}) (string, error) {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("error marshalling payload: %v", err)
	}

	h := md5.New()
	h.Write([]byte(string(payloadBytes) + jiushiSalt))
	digest := h.Sum(nil)
	return base64.StdEncoding.EncodeToString([]byte(hex.EncodeToString(digest))), nil
}

// ---- Data structures ----

type Ground struct {
	GroundId string `json:"groundId"`
	Name     string `json:"name"`
}

type BlockModel struct {
	GroundId   string `json:"groundId"`
	GroundName string `json:"groundName"`
	Id         string `json:"id"`
	Price      string `json:"price"`
	SportsType string `json:"sportsType"`
	Status     string `json:"status"`
}

type StatusList struct {
	BlockModel []BlockModel `json:"blockModel"`
	StartTime  int64        `json:"startTime"`
	EndTime    int64        `json:"endTime"`
	MinHour    string       `json:"minHour"`
}

type VenueResponse struct {
	Data struct {
		GroundList []Ground     `json:"groundList"`
		StatusList []StatusList `json:"statusList"`
	} `json:"data"`
	RtnCode    string `json:"rtnCode"`
	RtnMessage string `json:"rtnMessage"`
}

// ---- API call ----

func makeHeaders(cookie, jsSign string) http.Header {
	headers := http.Header{}
	headers.Set("Connection", "keep-alive")
	headers.Set("app_id", "0ff444f417de34c1352af3b3ffc30348")
	headers.Set("os_type", "wechat_mini")
	headers.Set("Content-Type", "application/json")
	headers.Set("os_version", "iOS 18.1")
	headers.Set("device_type", "iPhone 13<iPhone14,5>")
	headers.Set("gw_channel", "api")
	headers.Set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.54(0x18003625) NetType/WIFI Language/zh_CN")
	headers.Set("Referer", "https://servicewechat.com/wxbd4ec54a9e9ce6dd/119/page-frame.html")
	headers.Set("Cookie", cookie)
	headers.Set("js_sign", jsSign)
	return headers
}

func QueryVenueData(venueId string, bookTime int64) (*VenueResponse, error) {
	payload := map[string]interface{}{
		"venueId":  venueId,
		"bookTime": bookTime * 1000,
	}

	jsSign, err := generateJsSign(payload)
	if err != nil {
		return nil, err
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("error marshalling payload: %v", err)
	}

	// 获取 cookie
	cookie, err := acquireAcwTc()
	if err != nil {
		log.Printf("[Jiushi] Warmup failed (will try without cookie): %v", err)
		cookie = ""
	}

	// 第一次尝试
	req, err := http.NewRequest("POST", jiushiAPI, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return nil, fmt.Errorf("error creating request: %v", err)
	}
	req.Header = makeHeaders(cookie, jsSign)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response: %v", err)
	}

	// 如果被 WAF 拦截，刷新 cookie 重试
	if resp.StatusCode == 403 && strings.Contains(string(body), "Denied by http_custom") {
		log.Println("[Jiushi] WAF blocked — refreshing acw_tc and retrying...")
		clearAcwTc()
		cookie, err = acquireAcwTc()
		if err != nil {
			return nil, fmt.Errorf("WAF block and cookie refresh failed: %v", err)
		}

		req, _ = http.NewRequest("POST", jiushiAPI, bytes.NewBuffer(payloadBytes))
		req.Header = makeHeaders(cookie, jsSign)
		resp, err = client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("retry after cookie refresh failed: %v", err)
		}
		defer resp.Body.Close()
		body, _ = io.ReadAll(resp.Body)
	}

	if resp.StatusCode != http.StatusOK {
		bodyPreview := string(body)
		if len(bodyPreview) > 400 {
			bodyPreview = bodyPreview[:400] + "..."
		}
		return nil, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, bodyPreview)
	}

	var venueResponse VenueResponse
	if err := json.Unmarshal(body, &venueResponse); err != nil {
		return nil, fmt.Errorf("error parsing JSON: %v\nResponse body: %s", err, string(body))
	}

	if venueResponse.RtnCode != "10000" {
		return nil, fmt.Errorf("API error: %s", venueResponse.RtnMessage)
	}

	log.Printf("[Jiushi] Success: %d grounds, %d time blocks",
		len(venueResponse.Data.GroundList), len(venueResponse.Data.StatusList))
	return &venueResponse, nil
}

// ExampleUsage demonstrates the module
func ExampleUsage() {
	tomorrow := time.Now().AddDate(0, 0, 1)
	tomorrowMidnight := time.Date(tomorrow.Year(), tomorrow.Month(), tomorrow.Day(), 0, 0, 0, 0, time.UTC).Unix()

	response, err := QueryVenueData("27", tomorrowMidnight)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}

	for _, ground := range response.Data.GroundList {
		fmt.Printf("Ground: %s, ID: %s\n", ground.Name, ground.GroundId)
	}
}
