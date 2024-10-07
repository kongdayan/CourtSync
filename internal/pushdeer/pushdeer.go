package service

import (
	"FBS_HKUST_SPIDER/internal/service"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// 定义一个 FacilityID 到实际设施名称的映射
var facilityMap = map[string]string{
	"2":  "LG1C1",
	"3":  "LG1C2",
	"4":  "LG1C3",
	"5":  "LG1C4",
	"79": "LG1-C5",
	"80": "LG1-C6",
}

// PushDeerService 代表 PushDeer 推送服务
type PushDeerService struct {
	PushKeys []string // Push keys 列表
}

// NewPushDeerService 创建一个 PushDeer 服务
func NewPushDeerService(pushKeys []string) *PushDeerService {
	return &PushDeerService{PushKeys: pushKeys}
}

// PushTimeSlots 将时间段信息推送到 PushDeer
func (p *PushDeerService) PushTimeSlots(timeslots []service.UnifiedTimeSlot) error {
	// 将 UnifiedTimeSlot 列表转换为字符串
	timeslotText := p.ConvertSlotsToText(timeslots)

	// 遍历每一个 PushKey 并发送推送
	for _, key := range p.PushKeys {
		err := p.sendPush(key, timeslotText)
		if err != nil {
			fmt.Printf("Error sending push for key %s: %v\n", key, err)
		}
	}

	return nil
}

// ConvertSlotsToText 将 UnifiedTimeSlot 列表转换为字符串
func (p *PushDeerService) ConvertSlotsToText(slots []service.UnifiedTimeSlot) string {
	var result strings.Builder

	for _, slot := range slots {
		// 获取对应的设施名称，如果不存在就使用原 FacilityID
		facilityName, exists := facilityMap[slot.FacilityID]
		if !exists {
			facilityName = slot.FacilityID
		}

		// 格式化为 "10月8日7点LG1C1" 这样的格式
		result.WriteString(fmt.Sprintf("%s月%s日%s点%s, ", slot.Date[5:7], slot.Date[8:], slot.StartTime[:2], facilityName))
	}

	// 删除最后一个多余的逗号
	if result.Len() > 0 {
		return result.String()[:result.Len()-2]
	}

	return result.String()
}

// sendPush 通过 PushDeer API 发送推送
func (p *PushDeerService) sendPush(key, text string) error {
	// API URL
	apiURL := fmt.Sprintf("https://api2.pushdeer.com/message/push?pushkey=%s&text=%s", key, url.QueryEscape(text))

	// 发送 HTTP GET 请求
	resp, err := http.Get(apiURL)
	if err != nil {
		return fmt.Errorf("error sending push: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("non-OK HTTP status: %s", resp.Status)
	}

	return nil
}
