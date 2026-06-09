package main

import (
	"FBS_HKUST_SPIDER/internal/pushdeer"
	"FBS_HKUST_SPIDER/internal/service"
	"FBS_HKUST_SPIDER/internal/usthing"
	"FBS_HKUST_SPIDER/internal/webui"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"
)

func getCurrentTimeInUTC8() time.Time {
	utc8 := time.FixedZone("UTC+8", 8*3600)
	return time.Now().In(utc8)
}

func main() {
	sourceFlag := flag.String("source", "", "Data sources to use: usthing,jiushi (comma-separated, default: configured sources)")
	onceFlag := flag.Bool("once", false, "Run once and exit (no cron/WebSocket)")
	flag.Parse()

	// 解析启用的数据源
	enabledSources := resolveSources(*sourceFlag)

	if len(enabledSources) == 0 {
		fmt.Println("No data sources enabled.")
		fmt.Println("")
		fmt.Println("Usage:")
		fmt.Println("  courtsync                        Run with configured sources")
		fmt.Println("  courtsync --source=usthing       Run USThing only")
		fmt.Println("  courtsync --source=jiushi        Run Jiushi only")
		fmt.Println("  courtsync --source=usthing,jiushi Run both")
		fmt.Println("  courtsync --once                 Run once and exit")
		fmt.Println("")
		fmt.Println("Environment variables:")
		fmt.Println("  USTHING_USERNAME / USTHING_PASSWORD   Azure AD credentials")
		fmt.Println("  USTHING_UST_ID                        User ID (optional)")
		fmt.Println("  USTHING_FACILITY_IDS                  Comma-separated facility IDs")
		fmt.Println("  JIUSHI_VENUE_ID                       Jiushi venue ID (e.g. 27)")
		fmt.Println("  JIUSHI_MAX_DAYS                       Max days to fetch (default 9)")
		fmt.Println("  PUSHDEER_KEYS                         Comma-separated PushDeer keys")
		os.Exit(0)
	}

	log.Printf("Enabled sources: %s", strings.Join(enabledSources, ", "))

	// 验证凭据
	validateCredentials(enabledSources)

	// 一次性模式
	if *onceFlag {
		runOnce(enabledSources)
		return
	}

	// 常驻模式：WebSocket + 定时扫描
	fmt.Println("Starting WebSocket server on :8080...")
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			now := getCurrentTimeInUTC8()
			hour := now.Hour()
			if hour >= 8 && hour < 22 {
				log.Println("Running scheduled scan...")
				scanAll(enabledSources)
			} else {
				log.Println("Outside operating hours (08:00-22:00 HKT), skipping...")
			}
		}
	}()

	webui.StartWebSocketServer("8080")
}

func resolveSources(flagVal string) []string {
	if flagVal != "" {
		return parseSourceList(flagVal)
	}

	// 从环境变量自动检测：有凭据就启用
	var sources []string
	if os.Getenv("USTHING_USERNAME") != "" || os.Getenv("USTHING_BEARER") != "" {
		sources = append(sources, "usthing")
	}
	if os.Getenv("JIUSHI_VENUE_ID") != "" {
		sources = append(sources, "jiushi")
	}
	return sources
}

func parseSourceList(s string) []string {
	parts := strings.Split(s, ",")
	var result []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "usthing" || p == "jiushi" {
			result = append(result, p)
		}
	}
	return result
}

func validateCredentials(sources []string) {
	for _, s := range sources {
		switch s {
		case "usthing":
			if os.Getenv("USTHING_USERNAME") == "" && os.Getenv("USTHING_BEARER") == "" {
				log.Println("[WARN] USThing enabled but no credentials set (USTHING_USERNAME or USTHING_BEARER)")
			}
		case "jiushi":
			if os.Getenv("JIUSHI_VENUE_ID") == "" {
				log.Println("[WARN] Jiushi enabled but JIUSHI_VENUE_ID not set — defaulting to 27")
				os.Setenv("JIUSHI_VENUE_ID", "27")
			}
		}
	}
}

func runOnce(sources []string) {
	fmt.Println("Running one-time scan...")
	scanAll(sources)
	fmt.Println("Done.")
}

func scanAll(sources []string) {
	pushKeys := os.Getenv("PUSHDEER_KEYS")
	var pushService *pushdeer.PushDeerService
	if pushKeys != "" {
		pushService = pushdeer.NewPushDeerService(strings.Split(pushKeys, ","))
	}

	for _, s := range sources {
		switch s {
		case "usthing":
			slots, err := service.UpdateTimeSlots()
			if err != nil {
				if strings.Contains(err.Error(), "USTHING_USERNAME") || strings.Contains(err.Error(), "not set") {
					log.Printf("[USThing] Skipped — credentials not configured")
					continue
				}
				log.Printf("[USThing] Scan failed: %v", err)
				continue
			}
			log.Printf("[USThing] Found %d available slots", len(slots))
			if pushService != nil && len(slots) > 0 {
				if err := pushService.PushTimeSlots(slots); err != nil {
					log.Printf("[PushDeer] Push failed: %v", err)
				}
			}

		case "jiushi":
			venueID := os.Getenv("JIUSHI_VENUE_ID")
			if venueID == "" {
				venueID = "27"
			}
			jiushiSlots, err := service.UpdateJiushiTimeSlots(venueID)
			if err != nil {
				log.Printf("[Jiushi] Scan failed: %v", err)
				continue
			}
			log.Printf("[Jiushi] Found %d slots", len(jiushiSlots))

		default:
			log.Printf("[%s] Unknown source, skipping", s)
		}
	}
}

// 初始化 token manager
func init() {
	if u := os.Getenv("USTHING_USERNAME"); u != "" {
		if p := os.Getenv("USTHING_PASSWORD"); p != "" {
			usthing.SetCredentials(u, p)
		}
	}
}
