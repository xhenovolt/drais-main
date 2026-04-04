// Package config handles persistent configuration for the Drais SDK.
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Config holds all runtime configuration.
type Config struct {
	DeviceIP    string `json:"device_ip"`
	DevicePort  int    `json:"device_port"`
	CloudWSURL  string `json:"cloud_ws_url"`
	AuthToken   string `json:"auth_token"`
	BridgePort  int    `json:"bridge_port"`
	SchoolID    int    `json:"school_id"`
}

// Default returns the default configuration.
func Default() Config {
	return Config{
		DeviceIP:   "192.168.1.197",
		DevicePort: 4370,
		CloudWSURL: "wss://sims.drais.pro/api/device/ws-bridge",
		AuthToken:  "",
		BridgePort: 7430,
		SchoolID:   0,
	}
}

// Load reads config from the given file path, merging defaults for missing fields.
func Load(path string) (Config, error) {
	cfg := Default()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil // first run — use defaults
		}
		return cfg, fmt.Errorf("read config: %w", err)
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("parse config: %w", err)
	}
	// Apply defaults for zero values
	if cfg.DevicePort == 0 {
		cfg.DevicePort = 4370
	}
	if cfg.BridgePort == 0 {
		cfg.BridgePort = 7430
	}
	return cfg, nil
}

// Save writes config to the given file path.
func Save(path string, cfg Config) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

// ConfigPath returns the default config file path ($HOME/.drais-sdk/config.json).
func ConfigPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "drais-sdk.json"
	}
	return filepath.Join(home, ".drais-sdk", "config.json")
}
