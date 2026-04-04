// Drais SDK — standalone bridge between Drais Cloud and local ZKTeco devices.
//
// Usage:
//
//	drais-sdk [flags]
//
// Flags:
//
//	-config     path to config file (default: ~/.drais-sdk/config.json)
//	-device-ip  ZKTeco device IP address (overrides config)
//	-device-port ZKTeco device port      (overrides config, default: 4370)
//	-token      Drais Auth Token          (overrides config)
//	-ws-url     Drais Cloud WebSocket URL (overrides config)
//	-port       Dashboard HTTP port       (overrides config, default: 7430)
//	-school-id  School ID                 (overrides config)
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"drais-sdk/internal/bridge"
	"drais-sdk/internal/config"
	"drais-sdk/internal/hub"
	"drais-sdk/internal/ui"
	"drais-sdk/internal/zk"
)

const version = "1.0.0"

const banner = `
 ██████╗ ██████╗  █████╗ ██╗███████╗    ███████╗██████╗ ██╗  ██╗
 ██╔══██╗██╔══██╗██╔══██╗██║██╔════╝    ██╔════╝██╔══██╗██║ ██╔╝
 ██║  ██║██████╔╝███████║██║███████╗    ███████╗██║  ██║█████╔╝
 ██║  ██║██╔══██╗██╔══██║██║╚════██║    ╚════██║██║  ██║██╔═██╗
 ██████╔╝██║  ██║██║  ██║██║███████║    ███████║██████╔╝██║  ██╗
 ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝   ╚══════╝╚═════╝ ╚═╝  ╚═╝
`

func main() {
	// ── Flags ──────────────────────────────────────────────────────────────
	cfgFile := flag.String("config", "", "path to config file (default: ~/.drais-sdk/config.json)")
	deviceIP := flag.String("device-ip", "", "ZKTeco device IP address")
	devicePort := flag.Int("device-port", 0, "ZKTeco device port (default: 4370)")
	token := flag.String("token", "", "Drais Auth Token")
	wsURL := flag.String("ws-url", "", "Drais Cloud WebSocket URL")
	port := flag.Int("port", 0, "dashboard HTTP port (default: 7430)")
	schoolID := flag.Int("school-id", 0, "school ID")
	flag.Parse()

	// ── Config ─────────────────────────────────────────────────────────────
	cfgPath := *cfgFile
	if cfgPath == "" {
		cfgPath = config.ConfigPath()
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load config from %s: %v\n", cfgPath, err)
		os.Exit(1)
	}
	cfgPtr := &cfg

	// Apply flag overrides
	if *deviceIP != "" {
		cfgPtr.DeviceIP = *deviceIP
	}
	if *devicePort > 0 {
		cfgPtr.DevicePort = *devicePort
	}
	if *token != "" {
		cfgPtr.AuthToken = *token
	}
	if *wsURL != "" {
		cfgPtr.CloudWSURL = *wsURL
	}
	if *port > 0 {
		cfgPtr.BridgePort = *port
	}
	if *schoolID > 0 {
		cfgPtr.SchoolID = *schoolID
	}

	// Save updated config (persists any flag overrides)
	if err := config.Save(cfgPath, *cfgPtr); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: could not save config: %v\n", err)
	}

	// ── Banner ─────────────────────────────────────────────────────────────
	fmt.Print(banner)
	fmt.Printf("\n  Drais SDK v%s\n", version)
	fmt.Printf("  Dashboard  →  http://127.0.0.1:%d\n", cfgPtr.BridgePort)
	if cfgPtr.DeviceIP != "" {
		fmt.Printf("  Device     →  %s:%d\n", cfgPtr.DeviceIP, cfgPtr.DevicePort)
	} else {
		fmt.Printf("  Device     →  (not configured — set via dashboard)\n")
	}
	if cfgPtr.CloudWSURL != "" {
		fmt.Printf("  Cloud WS   →  %s\n", cfgPtr.CloudWSURL)
	}
	fmt.Printf("  Config     →  %s\n\n", cfgPath)

	// ── Event Hub ──────────────────────────────────────────────────────────
	h := hub.New()
	h.Emit(hub.LevelInfo, "sdk", "Drais SDK v%s starting…", version)

	// ── Graceful shutdown ──────────────────────────────────────────────────
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	// ── Background: device health probe (every 30 s) ───────────────────────
	go watchDevice(ctx, cfgPtr, h)

	// ── Background: cloud WebSocket bridge ────────────────────────────────
	if cfgPtr.CloudWSURL != "" && cfgPtr.AuthToken != "" {
		go bridge.Run(ctx, cfgPtr, h)
	} else {
		h.Emit(hub.LevelWarn, "sdk", "Cloud bridge disabled — configure ws-url and token in dashboard")
	}

	// ── Foreground: embedded dashboard (blocks until shutdown) ────────────
	srv := ui.New(cfgPtr, cfgPath, h)
	if err := srv.Start(ctx); err != nil {
		// http.ErrServerClosed is expected on graceful shutdown
		if ctx.Err() == nil {
			fmt.Fprintf(os.Stderr, "Dashboard error: %v\n", err)
			os.Exit(1)
		}
	}

	h.Emit(hub.LevelInfo, "sdk", "Drais SDK stopped.")
}

// watchDevice periodically pings the ZKTeco device and updates hub status.
func watchDevice(ctx context.Context, cfg *config.Config, h *hub.Hub) {
	probe := func() {
		if cfg.DeviceIP == "" {
			return
		}
		dev := zk.New(cfg.DeviceIP, cfg.DevicePort, 5*time.Second)
		if err := dev.Connect(); err != nil {
			if h.Status().DeviceOnline {
				h.Emit(hub.LevelWarn, "sdk", "Device %s unreachable: %v", cfg.DeviceIP, err)
			}
			h.SetDeviceOnline(false)
			return
		}
		dev.Disconnect()
		if !h.Status().DeviceOnline {
			h.Emit(hub.LevelOK, "sdk", "Device %s is back online", cfg.DeviceIP)
		}
		h.SetDeviceOnline(true, cfg.DeviceIP)
	}

	// Initial probe immediately
	probe()

	tick := time.NewTicker(30 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			probe()
		}
	}
}
