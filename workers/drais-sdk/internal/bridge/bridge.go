// Package bridge maintains a persistent WebSocket connection to the Drais Cloud
// and dispatches incoming commands to the local ZKTeco device.
package bridge

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"drais-sdk/internal/config"
	"drais-sdk/internal/hub"
	"drais-sdk/internal/zk"
	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

const src = "cloud"

// Command is received from the Drais Cloud via WebSocket.
type Command struct {
	Action    string `json:"action"`
	StudentID int    `json:"student_id,omitempty"`
	UID       int    `json:"uid,omitempty"`
	Finger    int    `json:"finger,omitempty"`
	Token     string `json:"token"`
	RequestID string `json:"request_id,omitempty"`
}

// Response is sent back to the Drais Cloud after executing a command.
type Response struct {
	RequestID string `json:"request_id,omitempty"`
	OK        bool   `json:"ok"`
	Message   string `json:"message"`
	UID       int    `json:"uid,omitempty"`
}

// Run connects to the Drais Cloud WebSocket and processes commands forever.
// It reconnects automatically on disconnect with exponential back-off.
func Run(ctx context.Context, cfg *config.Config, h *hub.Hub) {
	backoff := 2 * time.Second
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		if cfg.CloudWSURL == "" || cfg.AuthToken == "" {
			h.Emit(hub.LevelWarn, src, "Cloud URL or Auth Token not configured — cloud bridge disabled")
			select {
			case <-ctx.Done():
				return
			case <-time.After(15 * time.Second):
			}
			continue
		}

		err := runOnce(ctx, cfg, h)
		if err != nil && ctx.Err() == nil {
			h.Emit(hub.LevelWarn, src, "Connection lost: %v. Reconnecting in %s…", err, backoff)
			h.SetCloudStatus("reconnecting")
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff < 60*time.Second {
			backoff *= 2
		}
	}
}

func runOnce(ctx context.Context, cfg *config.Config, h *hub.Hub) error {
	dialCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	wsURL := fmt.Sprintf("%s?token=%s&school_id=%d", cfg.CloudWSURL, cfg.AuthToken, cfg.SchoolID)
	conn, _, err := websocket.Dial(dialCtx, wsURL, &websocket.DialOptions{
		HTTPHeader: map[string][]string{
			"Drais-Auth-Token": {cfg.AuthToken},
			"User-Agent":       {"drais-sdk/1.0"},
		},
	})
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "bye")

	h.Emit(hub.LevelOK, src, "Connected to Drais Cloud (%s)", cfg.CloudWSURL)
	h.SetCloudStatus("connected")

	// Start ping loop
	go func() {
		ticker := time.NewTicker(20 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := conn.Ping(ctx); err != nil {
					return
				}
				h.SetLastHeartbeat(time.Now())
			}
		}
	}()

	for {
		var cmd Command
		if err := wsjson.Read(ctx, conn, &cmd); err != nil {
			h.SetCloudStatus("disconnected")
			return fmt.Errorf("read: %w", err)
		}

		// Validate auth token
		if cmd.Token != cfg.AuthToken {
			h.Emit(hub.LevelWarn, src, "Rejected command with invalid token (action=%s)", cmd.Action)
			_ = wsjson.Write(ctx, conn, Response{
				RequestID: cmd.RequestID,
				OK:        false,
				Message:   "unauthorized",
			})
			continue
		}

		h.Emit(hub.LevelInfo, src, "Command received: action=%s uid=%d", cmd.Action, cmd.UID)
		resp := dispatch(cfg, h, cmd)
		resp.RequestID = cmd.RequestID

		if err := wsjson.Write(ctx, conn, resp); err != nil {
			return fmt.Errorf("write response: %w", err)
		}
	}
}

func dispatch(cfg *config.Config, h *hub.Hub, cmd Command) Response {
	dev := zk.New(cfg.DeviceIP, cfg.DevicePort, 8*time.Second)

	if err := dev.Connect(); err != nil {
		h.Emit(hub.LevelError, src, "Device connect failed: %v", err)
		h.SetDeviceOnline(false)
		return Response{OK: false, Message: fmt.Sprintf("device unreachable: %v", err)}
	}
	defer dev.Disconnect()
	h.SetDeviceOnline(true, cfg.DeviceIP)

	switch cmd.Action {
	case "enroll":
		uid := uint16(cmd.UID)
		finger := uint8(cmd.Finger)
		if err := dev.DisableDevice(); err != nil {
			h.Emit(hub.LevelWarn, src, "DisableDevice: %v", err)
		}
		if err := dev.StartEnroll(uid, finger); err != nil {
			_ = dev.EnableDevice()
			h.Emit(hub.LevelError, src, "StartEnroll uid=%d: %v", uid, err)
			return Response{OK: false, Message: err.Error()}
		}
		_ = dev.EnableDevice()
		h.Emit(hub.LevelOK, src, "Enrollment started → UID=%d finger=%d device=%s", uid, finger, cfg.DeviceIP)
		return Response{OK: true, UID: int(uid), Message: fmt.Sprintf("Enrollment started for UID %d, finger %d. Place finger on scanner.", uid, finger)}

	case "cancel":
		if err := dev.CancelEnroll(); err != nil {
			return Response{OK: false, Message: err.Error()}
		}
		h.Emit(hub.LevelInfo, src, "Enrollment cancelled")
		return Response{OK: true, Message: "Capture cancelled"}

	case "beep":
		if err := dev.TestVoice(); err != nil {
			return Response{OK: false, Message: err.Error()}
		}
		h.Emit(hub.LevelInfo, src, "Beep sent to %s", cfg.DeviceIP)
		return Response{OK: true, Message: "Beep sent"}

	case "list_users":
		users, err := dev.GetUsers()
		if err != nil {
			return Response{OK: false, Message: err.Error()}
		}
		msg, _ := json.Marshal(users)
		return Response{OK: true, Message: string(msg)}

	case "ping":
		h.Emit(hub.LevelInfo, src, "Ping from cloud — device online at %s", cfg.DeviceIP)
		return Response{OK: true, Message: "pong"}

	default:
		return Response{OK: false, Message: fmt.Sprintf("unknown action: %s", cmd.Action)}
	}
}
