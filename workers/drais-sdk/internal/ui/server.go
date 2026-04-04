// Package ui serves the embedded web dashboard for the Drais SDK.
package ui

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"time"

	"drais-sdk/internal/config"
	"drais-sdk/internal/hub"
	"drais-sdk/internal/zk"
)

//go:embed static
var staticFiles embed.FS

// Server is the embedded web dashboard.
type Server struct {
	cfg        *config.Config
	cfgPath    string
	h          *hub.Hub
	httpServer *http.Server
}

// New creates a new UI server.
func New(cfg *config.Config, cfgPath string, h *hub.Hub) *Server {
	return &Server{cfg: cfg, cfgPath: cfgPath, h: h}
}

// Start begins listening on the configured port.
func (s *Server) Start(ctx context.Context) error {
	mux := http.NewServeMux()

	// Static files (embedded)
	static, err := fs.Sub(staticFiles, "static")
	if err != nil {
		return err
	}
	mux.Handle("/", http.FileServer(http.FS(static)))

	// API endpoints
	mux.HandleFunc("/api/status", s.handleStatus)
	mux.HandleFunc("/api/logs", s.handleLogs)
	mux.HandleFunc("/api/config", s.handleConfig)
	mux.HandleFunc("/api/test", s.handleTest)
	mux.HandleFunc("/api/enroll", s.handleEnroll)
	mux.HandleFunc("/events", s.handleSSE)

	addr := fmt.Sprintf("127.0.0.1:%d", s.cfg.BridgePort)
	s.httpServer = &http.Server{Addr: addr, Handler: mux}

	go func() {
		<-ctx.Done()
		shutCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = s.httpServer.Shutdown(shutCtx)
	}()

	s.h.Emit(hub.LevelOK, "ui", "Dashboard running at http://%s", addr)
	return s.httpServer.ListenAndServe()
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	st := s.h.Status()
	json.NewEncoder(w).Encode(map[string]any{
		"device_online":  st.DeviceOnline,
		"device_ip":      s.cfg.DeviceIP,
		"cloud_status":   st.CloudStatus,
		"last_heartbeat": st.LastHeartbeat,
		"version":        "1.0.0",
	})
}

func (s *Server) handleLogs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s.h.Recent(100))
}

func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodPost {
		var incoming config.Config
		if err := json.NewDecoder(r.Body).Decode(&incoming); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		// Only update safe fields via UI
		if incoming.DeviceIP != "" {
			s.cfg.DeviceIP = incoming.DeviceIP
		}
		if incoming.DevicePort > 0 {
			s.cfg.DevicePort = incoming.DevicePort
		}
		if incoming.AuthToken != "" {
			s.cfg.AuthToken = incoming.AuthToken
		}
		if incoming.CloudWSURL != "" {
			s.cfg.CloudWSURL = incoming.CloudWSURL
		}
		if incoming.SchoolID > 0 {
			s.cfg.SchoolID = incoming.SchoolID
		}
		if err := config.Save(s.cfgPath, *s.cfg); err != nil {
			http.Error(w, fmt.Sprintf("save failed: %v", err), http.StatusInternalServerError)
			return
		}
		s.h.Emit(hub.LevelOK, "ui", "Configuration updated and saved")
	}
	// Return current config (mask token)
	safe := *s.cfg
	if len(safe.AuthToken) > 8 {
		safe.AuthToken = safe.AuthToken[:4] + "****" + safe.AuthToken[len(safe.AuthToken)-4:]
	}
	json.NewEncoder(w).Encode(safe)
}

func (s *Server) handleTest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	dev := zk.New(s.cfg.DeviceIP, s.cfg.DevicePort, 5*time.Second)
	if err := dev.Connect(); err != nil {
		s.h.Emit(hub.LevelError, "ui", "Device unreachable: %v", err)
		s.h.SetDeviceOnline(false)
		json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": err.Error()})
		return
	}
	_ = dev.TestVoice()
	dev.Disconnect()
	s.h.SetDeviceOnline(true, s.cfg.DeviceIP)
	s.h.Emit(hub.LevelOK, "ui", "Beep test OK — device at %s responded", s.cfg.DeviceIP)
	json.NewEncoder(w).Encode(map[string]any{"ok": true, "message": fmt.Sprintf("Beep sent to %s", s.cfg.DeviceIP)})
}

func (s *Server) handleEnroll(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		http.Error(w, "POST required", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		UID    uint16 `json:"uid"`
		Finger uint8  `json:"finger"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.UID == 0 {
		http.Error(w, "uid required", http.StatusBadRequest)
		return
	}

	dev := zk.New(s.cfg.DeviceIP, s.cfg.DevicePort, 8*time.Second)
	if err := dev.Connect(); err != nil {
		s.h.SetDeviceOnline(false)
		json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": err.Error()})
		return
	}
	defer dev.Disconnect()

	_ = dev.DisableDevice()
	if err := dev.StartEnroll(body.UID, body.Finger); err != nil {
		_ = dev.EnableDevice()
		s.h.Emit(hub.LevelError, "ui", "Enroll uid=%d failed: %v", body.UID, err)
		json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": err.Error()})
		return
	}
	_ = dev.EnableDevice()
	s.h.Emit(hub.LevelOK, "ui", "Enrollment triggered → UID=%d finger=%d @ %s", body.UID, body.Finger, s.cfg.DeviceIP)
	json.NewEncoder(w).Encode(map[string]any{
		"ok":      true,
		"uid":     body.UID,
		"message": fmt.Sprintf("Enrollment started for UID %d. Scan finger on device.", body.UID),
	})
}

// handleSSE streams live log events as Server-Sent Events.
func (s *Server) handleSSE(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "SSE not supported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	ch := s.h.Subscribe()
	defer s.h.Unsubscribe(ch)

	// Send recent events first
	for _, e := range s.h.Recent(50) {
		data, _ := json.Marshal(e)
		fmt.Fprintf(w, "data: %s\n\n", data)
	}
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case e, ok := <-ch:
			if !ok {
				return
			}
			data, _ := json.Marshal(e)
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		}
	}
}

var _ = log.Println // prevent import error
