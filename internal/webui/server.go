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

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

var (
	clients      = make(map[*websocket.Conn]bool)
	clientsMu    sync.Mutex
	courtData    []service.UnifiedTimeSlot
	courtDataMu  sync.Mutex
	scanFn       func() []service.UnifiedTimeSlot
)

// StartWebSocketServer 启动 WebSocket 服务器。
// scanner 参数是数据刷新函数，由调用方注入，避免硬编码数据源。
func StartWebSocketServer(port string, scanner func() []service.UnifiedTimeSlot) {
	scanFn = scanner

	fs := http.FileServer(http.Dir("./templates"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./templates/index.html")
	})
	http.HandleFunc("/ws", handleConnections)

	go updateCourtData()
	go broadcastCourtData()

	log.Printf("WebSocket server on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func handleConnections(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Upgrade failed: %v", err)
		return
	}
	defer ws.Close()

	clientsMu.Lock()
	clients[ws] = true
	clientsMu.Unlock()
	log.Println("Client connected")

	courtDataMu.Lock()
	if len(courtData) > 0 {
		data, _ := json.Marshal(map[string]interface{}{"data": formatDisplay(courtData)})
		ws.WriteMessage(websocket.TextMessage, data)
	}
	courtDataMu.Unlock()

	for {
		_, _, err := ws.ReadMessage()
		if err != nil {
			clientsMu.Lock()
			delete(clients, ws)
			clientsMu.Unlock()
			log.Println("Client disconnected")
			break
		}
	}
}

func updateCourtData() {
	for {
		if scanFn != nil {
			newData := scanFn()
			courtDataMu.Lock()
			courtData = newData
			courtDataMu.Unlock()
			log.Printf("Court data updated: %d records", len(newData))
		}
		time.Sleep(1 * time.Minute)
	}
}

func broadcastCourtData() {
	for {
		courtDataMu.Lock()
		current := courtData
		courtDataMu.Unlock()

		if len(current) > 0 {
			data, _ := json.Marshal(map[string]interface{}{"data": formatDisplay(current)})
			clientsMu.Lock()
			for client := range clients {
				if err := client.WriteMessage(websocket.TextMessage, data); err != nil {
					client.Close()
					delete(clients, client)
				}
			}
			clientsMu.Unlock()
		}
		time.Sleep(5 * time.Second)
	}
}

func formatDisplay(data []service.UnifiedTimeSlot) []string {
	var result []string
	for _, slot := range data {
		if slot.Status == "Available" {
			dateTime, err := time.Parse("2006-01-02 15:04", slot.Date+" "+slot.StartTime)
			if err != nil {
				continue
			}
			formatted := fmt.Sprintf("%d月%d日%s - %s %s",
				dateTime.Month(), dateTime.Day(),
				slot.StartTime, slot.EndTime,
				facilityName(slot.FacilityID))
			result = append(result, formatted)
		}
	}
	return result
}

func facilityName(id string) string {
	m := map[string]string{
		"2": "LG1-C1", "3": "LG1-C2", "4": "LG1-C3", "5": "LG1-C4",
		"79": "LG1-C5", "80": "LG1-C6", "100": "SF-C1", "101": "SF-C2",
	}
	if n, ok := m[id]; ok {
		return n
	}
	return id
}
