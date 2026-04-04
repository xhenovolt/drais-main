// Package hub is the central event/log bus used by all SDK components.
package hub

import (
	"fmt"
	"sync"
	"time"
)

// Level represents log severity.
type Level string

const (
	LevelInfo  Level = "info"
	LevelWarn  Level = "warn"
	LevelError Level = "error"
	LevelOK    Level = "ok"
)

// Event is a single log entry.
type Event struct {
	Time    time.Time `json:"time"`
	Level   Level     `json:"level"`
	Source  string    `json:"source"`
	Message string    `json:"message"`
}

// Hub is a thread-safe event bus.
type Hub struct {
	mu          sync.RWMutex
	events      []Event
	subscribers []chan Event
	maxEvents   int

	// Exported status fields — read by the dashboard
	DeviceOnline  bool   `json:"device_online"`
	DeviceIP      string `json:"device_ip"`
	CloudStatus   string `json:"cloud_status"`
	LastHeartbeat time.Time `json:"last_heartbeat"`
}

// New creates a new Hub.
func New() *Hub {
	return &Hub{maxEvents: 200, CloudStatus: "disconnected"}
}

// Emit logs an event and broadcasts it to all subscribers.
func (h *Hub) Emit(level Level, source, msg string, args ...any) {
	if len(args) > 0 {
		msg = fmt.Sprintf(msg, args...)
	}
	e := Event{Time: time.Now(), Level: level, Source: source, Message: msg}

	h.mu.Lock()
	h.events = append(h.events, e)
	if len(h.events) > h.maxEvents {
		h.events = h.events[len(h.events)-h.maxEvents:]
	}
	subs := make([]chan Event, len(h.subscribers))
	copy(subs, h.subscribers)
	h.mu.Unlock()

	for _, sub := range subs {
		select {
		case sub <- e:
		default:
		}
	}
}

// Subscribe returns a channel that receives new events. Call Unsubscribe when done.
func (h *Hub) Subscribe() chan Event {
	ch := make(chan Event, 32)
	h.mu.Lock()
	h.subscribers = append(h.subscribers, ch)
	h.mu.Unlock()
	return ch
}

// Unsubscribe removes a subscriber channel.
func (h *Hub) Unsubscribe(ch chan Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for i, sub := range h.subscribers {
		if sub == ch {
			h.subscribers = append(h.subscribers[:i], h.subscribers[i+1:]...)
			close(ch)
			return
		}
	}
}

// Recent returns the last n events.
func (h *Hub) Recent(n int) []Event {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if n >= len(h.events) {
		out := make([]Event, len(h.events))
		copy(out, h.events)
		return out
	}
	out := make([]Event, n)
	copy(out, h.events[len(h.events)-n:])
	return out
}

// StatusSnapshot holds a safe copy of runtime status fields.
type StatusSnapshot struct {
	DeviceOnline  bool      `json:"device_online"`
	DeviceIP      string    `json:"device_ip"`
	CloudStatus   string    `json:"cloud_status"`
	LastHeartbeat time.Time `json:"last_heartbeat"`
}

// Status returns a thread-safe snapshot of the hub's status fields.
func (h *Hub) Status() StatusSnapshot {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return StatusSnapshot{
		DeviceOnline:  h.DeviceOnline,
		DeviceIP:      h.DeviceIP,
		CloudStatus:   h.CloudStatus,
		LastHeartbeat: h.LastHeartbeat,
	}
}

// SetDeviceOnline safely updates the DeviceOnline and DeviceIP fields.
func (h *Hub) SetDeviceOnline(v bool, ip ...string) {
	h.mu.Lock()
	h.DeviceOnline = v
	if len(ip) > 0 {
		h.DeviceIP = ip[0]
	}
	h.mu.Unlock()
}

// SetCloudStatus safely updates the CloudStatus field.
func (h *Hub) SetCloudStatus(v string) {
	h.mu.Lock()
	h.CloudStatus = v
	h.mu.Unlock()
}

// SetLastHeartbeat safely updates the LastHeartbeat field.
func (h *Hub) SetLastHeartbeat(t time.Time) {
	h.mu.Lock()
	h.LastHeartbeat = t
	h.mu.Unlock()
}
