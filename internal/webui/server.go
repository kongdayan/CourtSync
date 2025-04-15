package webui

import (
	"FBS_HKUST_SPIDER/internal/service"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// 定义WebSocket升级器
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// 允许所有跨域请求
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// 存储所有连接的客户端
var clients = make(map[*websocket.Conn]bool)
var clientsMutex sync.Mutex

// 存储最新的球场数据
var courtData []service.UnifiedTimeSlot
var courtDataMutex sync.Mutex

// 启动WebSocket服务器
func StartWebSocketServer(port string) {
	// 设置静态文件服务
	fs := http.FileServer(http.Dir("./templates"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	// 设置主页路由
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./templates/index.html")
	})

	// 设置WebSocket路由
	http.HandleFunc("/ws", handleConnections)

	// 启动更新球场数据的goroutine
	go updateCourtData()

	// 启动广播数据的goroutine
	go broadcastCourtData()

	log.Printf("WebSocket服务器启动在端口 %s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

// 处理WebSocket连接
func handleConnections(w http.ResponseWriter, r *http.Request) {
	// 升级HTTP连接为WebSocket连接
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("升级连接失败: %v", err)
		return
	}
	defer ws.Close()

	// 注册新客户端
	clientsMutex.Lock()
	clients[ws] = true
	clientsMutex.Unlock()

	log.Println("新客户端已连接")

	// 发送当前数据给新客户端
	courtDataMutex.Lock()
	if len(courtData) > 0 {
		data, err := json.Marshal(map[string]interface{}{
			"data": formatCourtDataForDisplay(courtData),
		})
		if err == nil {
			ws.WriteMessage(websocket.TextMessage, data)
		}
	}
	courtDataMutex.Unlock()

	// 监听客户端消息（虽然我们不期望收到任何消息）
	for {
		_, _, err := ws.ReadMessage()
		if err != nil {
			clientsMutex.Lock()
			delete(clients, ws)
			clientsMutex.Unlock()
			log.Println("客户端已断开连接")
			break
		}
	}
}

// 更新球场数据
func updateCourtData() {
	for {
		// 获取最新的球场数据
		newData, err := service.UpdateTimeSlots()
		if err != nil {
			log.Printf("获取球场数据失败: %v", err)
		} else {
			// 更新存储的数据
			courtDataMutex.Lock()
			courtData = newData
			courtDataMutex.Unlock()
			log.Printf("已更新球场数据，共 %d 条记录", len(newData))
		}

		// 每分钟更新一次
		time.Sleep(1 * time.Minute)
	}
}

// 广播球场数据给所有客户端
func broadcastCourtData() {
	for {
		// 获取当前数据
		courtDataMutex.Lock()
		currentData := courtData
		courtDataMutex.Unlock()

		if len(currentData) > 0 {
			// 格式化数据用于显示
			displayData := formatCourtDataForDisplay(currentData)

			// 准备要发送的JSON数据
			data, err := json.Marshal(map[string]interface{}{
				"data": displayData,
			})
			if err != nil {
				log.Printf("序列化数据失败: %v", err)
				continue
			}

			// 向所有客户端广播
			clientsMutex.Lock()
			for client := range clients {
				err := client.WriteMessage(websocket.TextMessage, data)
				if err != nil {
					log.Printf("发送消息失败: %v", err)
					client.Close()
					delete(clients, client)
				}
			}
			clientsMutex.Unlock()
		}

		// 每5秒广播一次
		time.Sleep(5 * time.Second)
	}
}

// 格式化球场数据用于显示
func formatCourtDataForDisplay(data []service.UnifiedTimeSlot) []string {
	var result []string

	for _, slot := range data {
		if slot.Status == "Available" {
			// 解析日期和时间
			dateTime, err := time.Parse("2006-01-02 15:04", slot.Date+" "+slot.StartTime)
			if err != nil {
				continue
			}

			// 格式化为用户友好的字符串
			formatted := fmt.Sprintf("%d月%d日%s - %s %s", 
				dateTime.Month(), dateTime.Day(), 
				slot.StartTime, slot.EndTime, 
				getFacilityName(slot.FacilityID))
			
			result = append(result, formatted)
		}
	}

	return result
}

// 根据设施ID获取设施名称
func getFacilityName(facilityID string) string {
	// 定义设施ID到名称的映射
	facilityMap := map[string]string{
		"2":  "LG1-C1",
		"3":  "LG1-C2",
		"4":  "LG1-C3",
		"5":  "LG1-C4",
		"79": "LG1-C5",
		"80": "LG1-C6",
		"100": "SF-C1",
		"101": "SF-C2",
		"27": "九师场地", // 九师场地ID
	}

	if name, ok := facilityMap[facilityID]; ok {
		return name
	}
	return facilityID
}