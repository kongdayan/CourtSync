// Command jiushi-proxy is a minimal forward proxy for the Jiushi API.
// Run it on any VPS or home server (non-Cloudflare IP):
//
//	go run ./proxy/ -addr :8765 -token mysecret
//
// Then set JIUSHI_PROXY_URL=https://your-server:8765 in the Worker env.
package main

import (
	"crypto/md5"
	"encoding/base64"
	"encoding/hex"
	"flag"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	jiushiAPI  = "https://jsapp.jussyun.com/jiushi-core/venue/getVenueGround"
	jiushiSalt = "527093093C418483029EEC61F70E9DD1"
)

var (
	addr      = flag.String("addr", ":8765", "listen address")
	authToken = flag.String("token", "", "bearer token required to use this proxy")
)

var (
	cachedAcwTc     string
	cachedAcwTcExp  time.Time
	acwTcMu         sync.Mutex
)

func acquireAcwTc() (string, error) {
	acwTcMu.Lock()
	defer acwTcMu.Unlock()

	if cachedAcwTc != "" && time.Now().Add(5*time.Minute).Before(cachedAcwTcExp) {
		return cachedAcwTc, nil
	}

	req, _ := http.NewRequest("POST", jiushiAPI, strings.NewReader("{}"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148")
	req.Header.Set("Referer", "https://servicewechat.com/wxbd4ec54a9e9ce6dd/119/page-frame.html")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	resp.Body.Close()

	sc := resp.Header.Get("Set-Cookie")
	start := strings.Index(sc, "acw_tc=")
	if start == -1 {
		return "", nil
	}
	val := sc[start+7:]
	if semi := strings.Index(val, ";"); semi != -1 {
		val = val[:semi]
	}

	cachedAcwTc = "acw_tc=" + val
	cachedAcwTcExp = time.Now().Add(3600 * time.Second)
	log.Println("[proxy] acquired fresh acw_tc")
	return cachedAcwTc, nil
}

func proxyHandler(w http.ResponseWriter, r *http.Request) {
	if *authToken != "" {
		auth := r.Header.Get("Authorization")
		if auth != "Bearer "+*authToken {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
	}

	if r.Method != "POST" {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	r.Body.Close()

	// compute js_sign
	h := md5.New()
	h.Write([]byte(string(body) + jiushiSalt))
	digest := hex.EncodeToString(h.Sum(nil))
	jsSign := base64.StdEncoding.EncodeToString([]byte(digest))

	cookie, _ := acquireAcwTc()

	req, _ := http.NewRequest("POST", jiushiAPI, strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.54(0x18003625) NetType/WIFI Language/zh_CN")
	req.Header.Set("Referer", "https://servicewechat.com/wxbd4ec54a9e9ce6dd/119/page-frame.html")
	req.Header.Set("app_id", "0ff444f417de34c1352af3b3ffc30348")
	req.Header.Set("os_type", "wechat_mini")
	req.Header.Set("os_version", "iOS 18.1")
	req.Header.Set("device_type", "iPhone 13<iPhone14,5>")
	req.Header.Set("gw_channel", "api")
	req.Header.Set("js_sign", jsSign)
	req.Header.Set("Cookie", cookie)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, "upstream error: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for k, vs := range resp.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func main() {
	flag.Parse()
	log.Printf("Jiushi proxy listening on %s", *addr)
	log.Fatal(http.ListenAndServe(*addr, http.HandlerFunc(proxyHandler)))
}
