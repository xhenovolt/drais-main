package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
)

type Config struct {
	DRAISBaseURL   string `json:"drais_url"`
	RelayKey       string `json:"relay_key"`
	DeviceIP       string `json:"device_ip"`
	DevicePort     int    `json:"device_port"`
	DeviceSN       string `json:"device_sn"`
	PollIntervalMS int    `json:"poll_ms"`
	AutoStart      bool   `json:"auto_start"`
}

var Defaults = Config{
	DRAISBaseURL:   "https://sims.drais.pro",
	RelayKey:       "DRAIS-355DF9C35EB60899009C01DD948EAD14",
	DeviceIP:       "192.168.1.197",
	DevicePort:     4370,
	DeviceSN:       "GED7254601154",
	PollIntervalMS: 2000,
	AutoStart:      true,
}

// ConfigDir returns the OS-appropriate config directory.
func ConfigDir() string {
	if runtime.GOOS == "windows" {
		appData := os.Getenv("APPDATA")
		if appData == "" {
			appData, _ = os.UserHomeDir()
		}
		return filepath.Join(appData, "DRAIS", "Relay")
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "drais-relay")
}

func ConfigPath() string {
	return filepath.Join(ConfigDir(), "config.json")
}

func StatusPath() string {
	return filepath.Join(ConfigDir(), "status.json")
}

func LogPath() string {
	return filepath.Join(ConfigDir(), "relay.log")
}

func Load() (*Config, error) {
	path := ConfigPath()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			cfg := Defaults
			_ = Save(&cfg)
			return &cfg, nil
		}
		return nil, err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	// Apply defaults for zero-value fields
	if cfg.DevicePort == 0 {
		cfg.DevicePort = 4370
	}
	if cfg.PollIntervalMS == 0 {
		cfg.PollIntervalMS = 2000
	}
	if cfg.DRAISBaseURL == "" {
		cfg.DRAISBaseURL = Defaults.DRAISBaseURL
	}
	if cfg.RelayKey == "" {
		cfg.RelayKey = Defaults.RelayKey
	}
	return &cfg, nil
}

func Save(cfg *Config) error {
	path := ConfigPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}
