// Package zk implements the ZKTeco TCP SDK protocol (V2.xx).
// Packet format (TCP variant used by K40 Pro):
//
//	PREFIX [0x50 0x50 0x82 0x7D] + LENGTH (2 bytes LE, bytes 4-5) + INNER PACKET
//	INNER PACKET: [CMD 2b LE][CHECKSUM 2b LE][SESSION_ID 2b LE][REPLY_ID 2b LE][DATA...]
package zk

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"net"
	"time"
)

// ZKTeco protocol command codes
const (
	CmdConnect       = 1000
	CmdExit          = 1001
	CmdEnableDevice  = 1002
	CmdDisableDevice = 1003
	CmdTestVoice     = 1017
	CmdGetVersion    = 1100
	CmdStartEnroll   = 61
	CmdCancelCapture = 62
	CmdGetTime       = 201
	CmdDbRRQ         = 7
	CmdUserWRQ       = 8
	CmdAckOK         = 2000
	CmdAckError      = 2001
	CmdPrepareData   = 1500
	CmdData          = 1501
	CmdFreeData      = 1502
	CmdDataWRRQ      = 1503
	CmdDataRDY       = 1504
)

// TCP prefix for all ZKTeco TCP packets
var tcpPrefix = []byte{0x50, 0x50, 0x82, 0x7D}

// Device holds an active TC connection to one ZKTeco device.
type Device struct {
	IP        string
	Port      int
	conn      net.Conn
	sessionID uint16
	replyID   uint16
	timeout   time.Duration
}

// New creates a Device. Call Connect() to open the socket.
func New(ip string, port int, timeout time.Duration) *Device {
	return &Device{IP: ip, Port: port, timeout: timeout}
}

// Connect opens the TCP socket and handshakes CMD_CONNECT.
func (d *Device) Connect() error {
	addr := fmt.Sprintf("%s:%d", d.IP, d.Port)
	conn, err := net.DialTimeout("tcp", addr, d.timeout)
	if err != nil {
		return fmt.Errorf("connect %s: %w", addr, err)
	}
	d.conn = conn
	d.sessionID = 0
	d.replyID = 0

	reply, err := d.execute(CmdConnect, nil)
	if err != nil {
		d.conn.Close()
		d.conn = nil
		return fmt.Errorf("CMD_CONNECT: %w", err)
	}
	if len(reply) >= 6 {
		d.sessionID = binary.LittleEndian.Uint16(reply[4:6])
	}
	return nil
}

// Disconnect sends CMD_EXIT and closes the socket.
func (d *Device) Disconnect() {
	if d.conn == nil {
		return
	}
	_, _ = d.execute(CmdExit, nil)
	d.conn.Close()
	d.conn = nil
}

// TestVoice triggers a beep on the device.
func (d *Device) TestVoice() error {
	_, err := d.execute(CmdTestVoice, nil)
	return err
}

// DisableDevice suppresses button-press / RFID events on the device UI.
func (d *Device) DisableDevice() error {
	_, err := d.execute(CmdDisableDevice, nil)
	return err
}

// EnableDevice restores normal device operation.
func (d *Device) EnableDevice() error {
	_, err := d.execute(CmdEnableDevice, nil)
	return err
}

// StartEnroll sends CMD_STARTENROLL for the given UID and finger index.
// uid: device user index (1–65535), finger: 0–9.
func (d *Device) StartEnroll(uid uint16, finger uint8) error {
	if uid == 0 || uid > 65535 {
		return errors.New("uid must be 1–65535")
	}
	if finger > 9 {
		return errors.New("finger must be 0–9")
	}

	// Cancel any current capture first
	_, _ = d.execute(CmdCancelCapture, nil) //nolint:errcheck

	// Payload: [uid lo][uid hi][finger]
	payload := []byte{byte(uid & 0xFF), byte(uid >> 8), finger}
	_, err := d.execute(CmdStartEnroll, payload)
	return err
}

// CancelEnroll cancels an in-progress enrollment or capture.
func (d *Device) CancelEnroll() error {
	_, err := d.execute(CmdCancelCapture, nil)
	return err
}

// GetUsers returns the slice of users stored on the device.
func (d *Device) GetUsers() ([]User, error) {
	_, err := d.execute(CmdDbRRQ, []byte{0x09, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00})
	if err != nil {
		return nil, err
	}
	raw, err := d.readLargeData()
	if err != nil {
		return nil, err
	}
	_, _ = d.execute(CmdFreeData, nil) //nolint:errcheck
	return decodeUsers(raw), nil
}

// User represents a user record on the ZKTeco device.
type User struct {
	UID      uint16
	UserID   string
	Name     string
	Role     uint8
	Password string
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

func (d *Device) execute(cmd uint16, data []byte) ([]byte, error) {
	if d.conn == nil {
		return nil, errors.New("not connected")
	}
	if cmd != CmdConnect {
		d.replyID++
		if d.replyID >= math.MaxUint16 {
			d.replyID = 1
		}
	}
	pkt := makeTCPPacket(cmd, d.sessionID, d.replyID, data)
	d.conn.SetDeadline(time.Now().Add(d.timeout))
	if _, err := d.conn.Write(pkt); err != nil {
		return nil, fmt.Errorf("write cmd %d: %w", cmd, err)
	}
	reply, err := d.readResponse()
	if err != nil {
		return nil, fmt.Errorf("reply cmd %d: %w", cmd, err)
	}
	return reply, nil
}

func (d *Device) readResponse() ([]byte, error) {
	buf := make([]byte, 4096)
	n, err := d.conn.Read(buf)
	if err != nil {
		return nil, err
	}
	return removeTCPHeader(buf[:n]), nil
}

// readLargeData handles the ZKTeco multi-chunk data transfer protocol.
func (d *Device) readLargeData() ([]byte, error) {
	// After CMD_DB_RRQ the device sends CMD_PREPARE_DATA + size, then the data
	buf := make([]byte, 65536)
	var collected []byte
	for {
		d.conn.SetDeadline(time.Now().Add(d.timeout))
		n, err := d.conn.Read(buf)
		if err != nil {
			break
		}
		inner := removeTCPHeader(buf[:n])
		if len(inner) < 2 {
			break
		}
		cmdReply := binary.LittleEndian.Uint16(inner[0:2])
		if cmdReply == CmdData {
			collected = append(collected, inner[8:]...)
		} else if cmdReply == CmdAckOK {
			break
		} else {
			// Could be prepare_data — keep reading
			collected = append(collected, inner[8:]...)
		}
		if n < 4096 {
			break
		}
	}
	return collected, nil
}

// makeTCPPacket builds a full ZKTeco TCP packet.
func makeTCPPacket(cmd, sessionID, replyID uint16, data []byte) []byte {
	inner := make([]byte, 8+len(data))
	binary.LittleEndian.PutUint16(inner[0:2], cmd)
	binary.LittleEndian.PutUint16(inner[2:4], 0) // checksum placeholder
	binary.LittleEndian.PutUint16(inner[4:6], sessionID)
	binary.LittleEndian.PutUint16(inner[6:8], replyID)
	copy(inner[8:], data)

	chk := calcChecksum(inner)
	binary.LittleEndian.PutUint16(inner[2:4], chk)

	// TCP prefix: [0x50 0x50 0x82 0x7D][len_lo len_hi 0x00 0x00] (length = len(inner))
	prefix := make([]byte, 8)
	copy(prefix[0:4], tcpPrefix)
	binary.LittleEndian.PutUint16(prefix[4:6], uint16(len(inner)))

	return append(prefix, inner...)
}

// removeTCPHeader strips the 8-byte TCP prefix if present.
func removeTCPHeader(buf []byte) []byte {
	if len(buf) < 8 {
		return buf
	}
	if buf[0] == 0x50 && buf[1] == 0x50 && buf[2] == 0x82 && buf[3] == 0x7D {
		return buf[8:]
	}
	return buf
}

// calcChecksum matches the ZKTeco algorithm (same as node-zklib createChkSum).
func calcChecksum(buf []byte) uint16 {
	var sum uint32
	for i := 0; i+1 < len(buf); i += 2 {
		sum += uint32(binary.LittleEndian.Uint16(buf[i : i+2]))
		sum %= math.MaxUint16
	}
	if len(buf)%2 == 1 {
		sum += uint32(buf[len(buf)-1])
		sum %= math.MaxUint16
	}
	return uint16(math.MaxUint16 - sum - 1)
}

// decodeUsers parses raw user data from the device (72-byte records).
func decodeUsers(raw []byte) []User {
	const recSize = 72
	var users []User
	for i := 0; i+recSize <= len(raw); i += recSize {
		rec := raw[i : i+recSize]
		uid := binary.LittleEndian.Uint16(rec[0:2])
		role := rec[2]
		password := nullterm(rec[3:11])
		name := nullterm(rec[11:35])
		// userId field at offset 35, 9 bytes (ZKTeco internal user number)
		userIDBytes := rec[35:44]
		userID := nullterm(userIDBytes)
		users = append(users, User{
			UID:      uid,
			UserID:   userID,
			Name:     name,
			Role:     role,
			Password: password,
		})
	}
	return users
}

func nullterm(b []byte) string {
	for i, c := range b {
		if c == 0 {
			return string(b[:i])
		}
	}
	return string(b)
}
