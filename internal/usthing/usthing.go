package usthing

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// TokenManager 管理 Azure AD token 的获取与刷新
type TokenManager struct {
	mu          sync.Mutex
	accessToken string
	expiresAt   time.Time
	username    string
	password    string
}

var defaultTokenManager *TokenManager

func init() {
	defaultTokenManager = &TokenManager{
		username: os.Getenv("USTHING_USERNAME"),
		password: os.Getenv("USTHING_PASSWORD"),
	}
}

// SetCredentials 设置认证凭据
func SetCredentials(username, password string) {
	defaultTokenManager.mu.Lock()
	defer defaultTokenManager.mu.Unlock()
	defaultTokenManager.username = username
	defaultTokenManager.password = password
	defaultTokenManager.accessToken = "" // 强制重新获取
}

// ForceRefresh 强制刷新 token（当 API 返回 401 时调用）
func ForceRefresh() {
	defaultTokenManager.mu.Lock()
	defer defaultTokenManager.mu.Unlock()
	defaultTokenManager.accessToken = ""
	log.Println("[Auth] Token cache cleared — will re-acquire on next request")
}

func (tm *TokenManager) getAccessToken() (string, error) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	if tm.accessToken != "" && time.Now().Add(5*time.Minute).Before(tm.expiresAt) {
		return tm.accessToken, nil
	}

	if tm.username == "" || tm.password == "" {
		return "", fmt.Errorf("USTHING_USERNAME or USTHING_PASSWORD not set")
	}

	data := url.Values{}
	data.Set("grant_type", "password")
	data.Set("client_id", "04b07795-8ddb-461a-bbee-02f9e1bf7b46")
	data.Set("scope", "openid profile email offline_access")
	data.Set("username", tm.username)
	data.Set("password", tm.password)

	req, err := http.NewRequest("POST",
		"https://login.microsoftonline.com/c917f3e2-9322-4926-9bb3-daca730413ca/oauth2/v2.0/token",
		strings.NewReader(data.Encode()))
	if err != nil {
		return "", fmt.Errorf("error creating token request: %v", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("error fetching token: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("error reading token response: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token endpoint returned %d: %s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return "", fmt.Errorf("error parsing token response: %v", err)
	}

	tm.accessToken = tokenResp.AccessToken
	tm.expiresAt = time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)
	log.Printf("[Auth] Token refreshed, expires in %ds", tokenResp.ExpiresIn)

	return tm.accessToken, nil
}

// GetAccessToken 获取当前有效的 access token
func GetAccessToken() (string, error) {
	return defaultTokenManager.getAccessToken()
}

// generateHeaders 生成 HTTP 请求头
func generateHeaders() (http.Header, error) {
	token, err := defaultTokenManager.getAccessToken()
	if err != nil {
		return nil, err
	}

	headers := http.Header{}
	headers.Set("Accept", "application/json")
	headers.Set("Connection", "keep-alive")
	headers.Set("Cookie", "language=en-US")
	headers.Set("User-Agent", "USThing/428 CFNetwork/3860.100.1 Darwin/25.0.0")
	headers.Set("Authorization", "Bearer "+token)
	return headers, nil
}

// isAuthError 判断响应是否为 token 过期
func isAuthError(statusCode int, body []byte) bool {
	if statusCode == http.StatusUnauthorized {
		return true
	}
	bodyStr := string(body)
	return strings.Contains(bodyStr, "jwt malformed") ||
		strings.Contains(bodyStr, "JsonWebTokenError") ||
		strings.Contains(bodyStr, "Missing Authorization Header")
}

// doWithAuthRetry 执行 HTTP 请求，若遇到 401 则自动刷新 token 并重试一次
func doWithAuthRetry(req *http.Request) (*http.Response, error) {
	client := &http.Client{Timeout: 15 * time.Second}

	// 第一次尝试
	headers, err := generateHeaders()
	if err != nil {
		return nil, err
	}
	req.Header = headers

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}

	// 如果不是 401，直接返回
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	if !isAuthError(resp.StatusCode, body) {
		// 重建 body reader 以便调用方读取
		resp.Body = io.NopCloser(strings.NewReader(string(body)))
		return resp, nil
	}

	log.Printf("[Auth] Received %d from API, refreshing token and retrying...", resp.StatusCode)

	// 强制刷新 token
	ForceRefresh()

	// 重试
	headers, err = generateHeaders()
	if err != nil {
		return nil, err
	}
	req.Header = headers

	resp2, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("retry after token refresh failed: %v", err)
	}

	log.Printf("[Auth] Retry completed with status %d", resp2.StatusCode)
	return resp2, nil
}

// ---- 数据结构 ----

// USThingTimeSlot 场地时间段
type USThingTimeSlot struct {
	FacilityID     int    `json:"facilityID"`
	TimeslotDate   string `json:"timeslotDate"`
	StartTime      string `json:"startTime"`
	EndTime        string `json:"endTime"`
	TimeslotStatus string `json:"timeslotStatus"`
	ActivityName   string `json:"activityName"`
}

// USThingTimeslotResponse 时段查询响应
type USThingTimeslotResponse struct {
	Status     string            `json:"status"`
	Message    string            `json:"message"`
	ErrorCode  string            `json:"errorCode"`
	FacilityID int               `json:"facilityID"`
	UserType   string            `json:"userType"`
	UstID      string            `json:"ustID"`
	StartDate  string            `json:"startDate"`
	EndDate    string            `json:"endDate"`
	TimeSlots  []USThingTimeSlot `json:"timeslot"`
}

// USThingBookingResponse 预订响应
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
	CancelInd     *string       `json:"cancelInd"`
	BookingResult []interface{} `json:"bookingResult"`
}

// USThingFacility 设施信息
type USThingFacility struct {
	FacilityID   int    `json:"facilityID"`
	FacilityName string `json:"facilityName"`
	Location     string `json:"location"`
}

// USThingFacilityResponse 设施列表响应
type USThingFacilityResponse struct {
	Status      string            `json:"status"`
	Message     string            `json:"message"`
	TotalRecord int               `json:"totalRecord"`
	UserType    string            `json:"userType"`
	UstID       string            `json:"ustID"`
	Facilities  []USThingFacility `json:"facility"`
}

// USThingBookingInfo 预订信息
type USThingBookingInfo struct {
	FacilityID   int    `json:"facilityID"`
	FacilityName string `json:"facilityName"`
	Location     string `json:"location"`
	TimeslotDate string `json:"timeslotDate"`
	StartTime    string `json:"startTime"`
	EndTime      string `json:"endTime"`
	BookingRef   int    `json:"bookingRef"`
}

// USThingBookingInfoResponse 预订列表响应
type USThingBookingInfoResponse struct {
	Status      string              `json:"status"`
	Message     string              `json:"message"`
	ErrorCode   string              `json:"errorCode"`
	TotalRecord int                 `json:"totalRecord"`
	UserType    string              `json:"userType"`
	UstID       string              `json:"ustID"`
	EmailAddr   string              `json:"emailAddr"`
	Bookings    []USThingBookingInfo `json:"booking"`
}

const baseURL = "https://ms.api.usthing.xyz"

// ---- API 函数（全部使用 doWithAuthRetry 自动刷新） ----

// GetFacilities 获取所有设施列表 (v3)
func GetFacilities() (*USThingFacilityResponse, error) {
	req, err := http.NewRequest("GET", baseURL+"/v3/msapi/fbs/facilities", nil)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %v", err)
	}
	log.Printf("[Facilities] GET %s", req.URL.String())

	resp, err := doWithAuthRetry(req)
	if err != nil {
		return nil, fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
	}

	var response USThingFacilityResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("error parsing response: %v", err)
	}

	log.Printf("[Facilities] Found %d facilities", response.TotalRecord)
	return &response, nil
}

// GetAvailableTimeSlots 获取可用时间段 (v3)
func GetAvailableTimeSlots(ustID, userType, facilityID, startDate, endDate string) ([]USThingTimeSlot, error) {
	if ustID == "" {
		ustID = os.Getenv("USTHING_UST_ID")
	}
	if userType == "" {
		userType = "01"
	}

	url := fmt.Sprintf("%s/v3/msapi/fbs/facilityTimeslot?ustID=%s&userType=%s&facilityID=%s&startDate=%s&endDate=%s",
		baseURL, ustID, userType, facilityID, startDate, endDate)
	log.Printf("[Timeslot] GET %s", url)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %v", err)
	}

	resp, err := doWithAuthRetry(req)
	if err != nil {
		return nil, fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response: %v", err)
	}

	log.Printf("[Timeslot] HTTP %d", resp.StatusCode)

	var response USThingTimeslotResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("error parsing response: %v", err)
	}

	if response.ErrorCode == "03" {
		log.Printf("[Timeslot] System closed: %s", response.Message)
		return nil, fmt.Errorf("system closed: %s", response.Message)
	}

	if response.Status != "200" {
		return nil, fmt.Errorf("unexpected status: %s, message: %s", response.Status, response.Message)
	}

	log.Printf("[Timeslot] Got %d timeslots", len(response.TimeSlots))

	availableSlots := make([]USThingTimeSlot, 0)
	for _, slot := range response.TimeSlots {
		if slot.TimeslotStatus == "Available" {
			availableSlots = append(availableSlots, slot)
		}
	}

	log.Printf("[Timeslot] Available: %d / %d", len(availableSlots), len(response.TimeSlots))
	return availableSlots, nil
}

// GetBookingInfo 获取当前预订列表 (v3)
func GetBookingInfo(ustID, userType string) (*USThingBookingInfoResponse, error) {
	if ustID == "" {
		ustID = os.Getenv("USTHING_UST_ID")
	}
	if userType == "" {
		userType = "01"
	}

	url := fmt.Sprintf("%s/v3/msapi/fbs/bookingInfo?ustID=%s&userType=%s", baseURL, ustID, userType)
	log.Printf("[BookingInfo] GET %s", url)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %v", err)
	}

	resp, err := doWithAuthRetry(req)
	if err != nil {
		return nil, fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response: %v", err)
	}

	var response USThingBookingInfoResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("error parsing response: %v", err)
	}

	log.Printf("[BookingInfo] status=%s, totalRecord=%d", response.Status, response.TotalRecord)
	return &response, nil
}

// Booking 预订/取消场地 (v2)
func Booking(ustID, userType, facilityID, timeslotDate, startTime, endTime, cancelInd string) (*USThingBookingResponse, error) {
	if ustID == "" {
		ustID = os.Getenv("USTHING_UST_ID")
	}

	url := fmt.Sprintf("%s/v2/fbs/book?ustID=%s&userType=%s&facilityID=%s&timeslotDate=%s&startTime=%s&endTime=%s&cancelInd=%s",
		baseURL, ustID, userType, facilityID, timeslotDate, startTime, endTime, cancelInd)
	log.Printf("[Booking] POST %s", url)

	req, err := http.NewRequest("POST", url, nil)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %v", err)
	}

	resp, err := doWithAuthRetry(req)
	if err != nil {
		return nil, fmt.Errorf("error sending request: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response body: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("received non-OK HTTP status: %s, body: %s", resp.Status, string(body))
	}

	var bookingResponse USThingBookingResponse
	if err := json.Unmarshal(body, &bookingResponse); err != nil {
		return nil, fmt.Errorf("error parsing JSON response: %v", err)
	}

	if bookingResponse.Status == "200" {
		log.Printf("[Booking] Success! bookingRef=%d", bookingResponse.BookingRef)
	} else {
		log.Printf("[Booking] Failed: %s (errorCode=%s)", bookingResponse.Message, bookingResponse.ErrorCode)
	}

	return &bookingResponse, nil
}
