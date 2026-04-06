#!/usr/bin/env python3
"""
DRAIS Relay Manager — v2.0
Modern cross-platform GUI for managing the DRAIS ZKTeco fingerprint relay agent.

Supported platforms: Ubuntu 20.04+ / Windows 10+ / Raspberry Pi (ARM64)
"""

import os
import sys
import json
import platform
import subprocess
import threading
import queue
from pathlib import Path
from datetime import datetime
from tkinter import messagebox

# ── Optional: customtkinter (modern UI). Falls back to plain tk if not installed.
try:
    import customtkinter as ctk
    ctk.set_appearance_mode("dark")
    ctk.set_default_color_theme("blue")
    HAS_CTK = True
except ImportError:
    import tkinter as ctk  # type: ignore
    HAS_CTK = False
    print("[DRAIS] customtkinter not found — run: pip install customtkinter")

# ── Color palette (matches DRAIS web app slate theme) ─────────────────────────
C = {
    'bg':      '#0f172a',   # slate-900
    'card':    '#1e293b',   # slate-800
    'border':  '#334155',   # slate-700
    'text':    '#f1f5f9',   # slate-100
    'muted':   '#94a3b8',   # slate-400
    'blue':    '#3b82f6',
    'green':   '#10b981',
    'amber':   '#f59e0b',
    'red':     '#ef4444',
    'lime':    '#a3e635',   # log text color
}

# ── Paths ─────────────────────────────────────────────────────────────────────
IS_FROZEN   = getattr(sys, 'frozen', False)
APP_DIR     = Path(sys.executable).parent if IS_FROZEN else Path(__file__).parent.resolve()
DIST_DIR    = (APP_DIR.parent / 'dist') if not IS_FROZEN else APP_DIR
CONFIG_FILE = DIST_DIR / 'drais-relay.config.json'
# When frozen with --onefile, bundled resources live in _MEIPASS (temp extraction dir)
BUNDLE_DIR  = Path(getattr(sys, '_MEIPASS', str(APP_DIR)))

IS_WIN   = platform.system() == 'Windows'
IS_LINUX = platform.system() == 'Linux'
MACHINE  = platform.machine().lower()

DEFAULT_CONFIG = {
    "drais_url":   "https://sims.drais.pro",
    "device_ip":   "192.168.1.197",
    "device_sn":   "GED7254601154",
    "relay_key":   "DRAIS-355DF9C35EB60899009C01DD948EAD14",
    "device_port": 4370,
    "poll_ms":     2000,
    "autorun":     False,
}

# ── Config helpers ─────────────────────────────────────────────────────────────
def load_config() -> dict:
    try:
        with open(CONFIG_FILE) as f:
            data = json.load(f)
        return {**DEFAULT_CONFIG, **data}
    except Exception:
        return DEFAULT_CONFIG.copy()


def save_config(cfg: dict) -> None:
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    keys = list(DEFAULT_CONFIG.keys())
    with open(CONFIG_FILE, 'w') as f:
        json.dump({k: cfg[k] for k in keys if k in cfg}, f, indent=2)


def relay_binary() -> str | None:
    candidates = []
    if IS_WIN:
        candidates = [
            DIST_DIR / 'drais-relay-win-x64.exe',
            DIST_DIR / 'drais-relay-win.exe',
        ]
    elif 'arm' in MACHINE or 'aarch64' in MACHINE:
        candidates = [DIST_DIR / 'drais-relay-linux-arm64']
    else:
        candidates = [
            DIST_DIR / 'drais-relay-linux-x64',
            DIST_DIR / 'drais-relay-linux',
        ]
    for c in candidates:
        if c.exists():
            return str(c)
    return None


# ── Custom widgets (work in both ctk and plain tk) ─────────────────────────────
def _Frame(parent, **kw):
    if HAS_CTK:
        return ctk.CTkFrame(parent, **kw)
    else:
        import tkinter as tk
        f = tk.Frame(parent, bg=kw.get('fg_color', '#1e293b'))
        return f


# ── Main App ───────────────────────────────────────────────────────────────────
class RelayManagerApp(ctk.CTk if HAS_CTK else __import__('tkinter').Tk):  # type: ignore

    def __init__(self, autostart: bool = False):
        super().__init__()

        self.title('DRAIS Relay Manager')
        self.geometry('530x750')
        self.minsize(490, 640)

        if HAS_CTK:
            self.configure(fg_color=C['bg'])

        # Try to set icon
        try:
            icon_path = BUNDLE_DIR / 'drais-relay.png'
            if not icon_path.exists():
                icon_path = APP_DIR / 'drais-relay.png'
            if icon_path.exists():
                from PIL import Image, ImageTk  # type: ignore
                img = Image.open(icon_path).resize((64, 64))
                self._icon_img = ImageTk.PhotoImage(img)
                self.wm_iconphoto(True, self._icon_img)
        except Exception:
            pass

        self._cfg        = load_config()
        self._proc: subprocess.Popen | None = None
        self._log_q: queue.Queue = queue.Queue()
        self._running    = True
        self._start_at: datetime | None = None
        self._event_cnt  = 0

        self._build_ui()
        self._update_status('offline')
        self.protocol('WM_DELETE_WINDOW', self._on_close)

        if autostart or self._cfg.get('autorun', False):
            self.after(700, self._start_relay)

        self._schedule_log_drain()
        self._schedule_uptime()

    # ── UI ─────────────────────────────────────────────────────────────────────
    def _build_ui(self):
        # ── Header bar
        hdr = ctk.CTkFrame(self, fg_color=C['card'], corner_radius=0, height=64)
        hdr.pack(fill='x')
        hdr.pack_propagate(False)

        title_row = ctk.CTkFrame(hdr, fg_color='transparent')
        title_row.pack(side='left', padx=20, pady=10)

        ctk.CTkLabel(
            title_row, text='DRAIS',
            font=ctk.CTkFont('monospace', 26, 'bold'),
            text_color=C['blue'],
        ).pack(side='left')
        ctk.CTkLabel(
            title_row, text=' Relay Manager',
            font=ctk.CTkFont(size=20, weight='bold'),
            text_color=C['text'],
        ).pack(side='left')

        ctk.CTkLabel(
            hdr, text='v2.0',
            font=ctk.CTkFont(size=11),
            text_color=C['muted'],
        ).pack(side='right', padx=20)

        # ── Status + Control card
        ctrl = ctk.CTkFrame(self, fg_color=C['card'], corner_radius=14)
        ctrl.pack(fill='x', padx=16, pady=(12, 6))

        # Status indicator row
        sr = ctk.CTkFrame(ctrl, fg_color='transparent')
        sr.pack(fill='x', padx=18, pady=(16, 4))

        self._dot = ctk.CTkLabel(sr, text='⬤', font=ctk.CTkFont(size=18), text_color=C['red'])
        self._dot.pack(side='left')

        self._status_lbl = ctk.CTkLabel(
            sr, text='OFFLINE',
            font=ctk.CTkFont(size=13, weight='bold'),
            text_color=C['red'],
        )
        self._status_lbl.pack(side='left', padx=8)

        self._detail_lbl = ctk.CTkLabel(
            sr, text='Relay is not running',
            font=ctk.CTkFont(size=11),
            text_color=C['muted'],
        )
        self._detail_lbl.pack(side='left')

        # Big Start / Stop button
        self._toggle_btn = ctk.CTkButton(
            ctrl,
            text='▶   START RELAY',
            font=ctk.CTkFont(size=16, weight='bold'),
            height=56, corner_radius=10,
            fg_color=C['green'], hover_color='#059669',
            command=self._toggle,
        )
        self._toggle_btn.pack(fill='x', padx=18, pady=(6, 10))

        # Stats row
        stats = ctk.CTkFrame(ctrl, fg_color='transparent')
        stats.pack(fill='x', padx=18, pady=(0, 10))
        self._ev_val   = self._stat_box(stats, '0',   'Events')
        self._up_val   = self._stat_box(stats, '—',   'Uptime')
        self._last_val = self._stat_box(stats, '—',   'Last Scan')

        # Auto-run checkbox
        ar = ctk.CTkFrame(ctrl, fg_color='transparent')
        ar.pack(fill='x', padx=18, pady=(0, 14))
        self._autorun_var = ctk.BooleanVar(value=self._cfg.get('autorun', False))
        ctk.CTkCheckBox(
            ar,
            text='  Auto-start relay when app opens',
            variable=self._autorun_var,
            font=ctk.CTkFont(size=12),
            text_color=C['muted'],
            fg_color=C['blue'],
            hover_color='#2563eb',
            command=self._autorun_changed,
        ).pack(side='left')

        # ── Config section
        self._section_label('CONFIGURATION')

        cfg_card = ctk.CTkFrame(self, fg_color=C['card'], corner_radius=14)
        cfg_card.pack(fill='x', padx=16, pady=(4, 6))

        self._entries: dict = {}
        fields = [
            ('Server URL',    'drais_url',   False, 'https://sims.drais.pro'),
            ('Device IP',     'device_ip',   False, '192.168.1.197'),
            ('Device Serial', 'device_sn',   False, 'GED7254601154'),
            ('Relay Key',     'relay_key',   True,  '● ● ● ● ● ● ●'),
        ]

        for i, (label, key, secret, placeholder) in enumerate(fields):
            row = ctk.CTkFrame(cfg_card, fg_color='transparent')
            row.pack(fill='x', padx=16, pady=(10 if i == 0 else 5, 0))

            ctk.CTkLabel(
                row, text=label,
                font=ctk.CTkFont(size=12), text_color=C['muted'],
                width=118, anchor='w',
            ).pack(side='left')

            entry = ctk.CTkEntry(
                row,
                placeholder_text=placeholder,
                show='●' if secret else '',
                font=ctk.CTkFont('monospace', 12),
                fg_color=C['bg'], border_color=C['border'],
                text_color=C['text'], height=36,
            )
            entry.pack(side='left', fill='x', expand=True)
            entry.insert(0, self._cfg.get(key, ''))
            self._entries[key] = entry

            if secret:
                ctk.CTkButton(
                    row, text='👁', width=36, height=36,
                    fg_color=C['card'], hover_color=C['border'],
                    text_color=C['muted'], corner_radius=6,
                    command=lambda e=entry: self._toggle_secret(e),
                ).pack(side='left', padx=(4, 0))

        # Save row
        srow = ctk.CTkFrame(cfg_card, fg_color='transparent')
        srow.pack(fill='x', padx=16, pady=(12, 14))

        ctk.CTkLabel(
            srow, text='Restart relay to apply changes',
            font=ctk.CTkFont(size=10), text_color=C['muted'],
        ).pack(side='left')

        ctk.CTkButton(
            srow, text='Save Config',
            font=ctk.CTkFont(size=12, weight='bold'),
            height=34, corner_radius=8,
            fg_color=C['blue'], hover_color='#2563eb',
            command=self._save_config,
        ).pack(side='right')

        # ── Log section
        log_hdr = ctk.CTkFrame(self, fg_color='transparent')
        log_hdr.pack(fill='x', padx=16, pady=(8, 0))

        ctk.CTkLabel(
            log_hdr, text='LIVE LOG',
            font=ctk.CTkFont(size=11, weight='bold'),
            text_color=C['muted'],
        ).pack(side='left')

        ctk.CTkButton(
            log_hdr, text='Clear',
            font=ctk.CTkFont(size=11), width=52, height=24,
            fg_color='transparent', hover_color=C['border'],
            text_color=C['muted'], corner_radius=6,
            command=self._clear_log,
        ).pack(side='right')

        self._log_box = ctk.CTkTextbox(
            self,
            fg_color=C['card'],
            text_color=C['lime'],
            font=ctk.CTkFont('monospace', 11),
            corner_radius=14,
            border_width=0,
        )
        self._log_box.pack(fill='both', expand=True, padx=16, pady=(4, 16))
        self._log_box.configure(state='disabled')

    def _section_label(self, text: str):
        fr = ctk.CTkFrame(self, fg_color='transparent')
        fr.pack(fill='x', padx=16, pady=(8, 0))
        ctk.CTkLabel(
            fr, text=text,
            font=ctk.CTkFont(size=11, weight='bold'),
            text_color=C['muted'],
        ).pack(side='left')

    def _stat_box(self, parent, value: str, label: str):
        box = ctk.CTkFrame(parent, fg_color=C['bg'], corner_radius=8)
        box.pack(side='left', expand=True, fill='x', padx=(0, 8))
        val = ctk.CTkLabel(box, text=value, font=ctk.CTkFont(size=20, weight='bold'), text_color=C['text'])
        val.pack(pady=(8, 0))
        ctk.CTkLabel(box, text=label, font=ctk.CTkFont(size=10), text_color=C['muted']).pack(pady=(0, 8))
        return val

    # ── Status ─────────────────────────────────────────────────────────────────
    def _update_status(self, state: str, detail: str = ''):
        MAP = {
            'offline':      (C['red'],   'OFFLINE',       detail or 'Relay is not running'),
            'starting':     (C['amber'], 'STARTING…',     detail or 'Connecting to device'),
            'connected':    (C['green'], 'LIVE',          detail or 'Device connected'),
            'reconnecting': (C['amber'], 'RECONNECTING',  detail or 'Reconnecting to device'),
        }
        color, lbl, det = MAP.get(state, (C['red'], 'OFFLINE', 'Unknown'))
        self._dot.configure(text_color=color)
        self._status_lbl.configure(text=lbl, text_color=color)
        self._detail_lbl.configure(text=det[:72])

    # ── Relay process ──────────────────────────────────────────────────────────
    def _toggle(self):
        if self._proc is None:
            self._start_relay()
        else:
            self._stop_relay()

    def _start_relay(self):
        binary = relay_binary()
        if not binary:
            msg = (
                'Relay binary not found in dist/ folder.\n\n'
                'Expected one of:\n'
                '  drais-relay-linux-x64\n'
                '  drais-relay-win-x64.exe\n'
                '  drais-relay-linux-arm64\n\n'
                'Run the build script first.'
            )
            self._log_append('✗ ' + msg.replace('\n', ' '))
            messagebox.showerror('DRAIS Relay — Binary Not Found', msg)
            return

        cfg = self._config_from_entries()
        save_config(cfg)

        # Ensure binary is executable on Linux/macOS
        if IS_LINUX:
            try:
                os.chmod(binary, 0o755)
            except Exception:
                pass

        # Build environment — pass all config as ENV vars, bypassing wizard
        env = os.environ.copy()
        env['DRAIS_URL']   = cfg['drais_url']
        env['DEVICE_IP']   = cfg['device_ip']
        env['DEVICE_SN']   = cfg['device_sn']
        env['RELAY_KEY']   = cfg['relay_key']
        env['DEVICE_PORT'] = str(int(cfg.get('device_port', 4370)))
        env['POLL_MS']     = str(int(cfg.get('poll_ms', 2000)))

        # Windows: suppress console window flash
        popen_kwargs: dict = {}
        if IS_WIN:
            popen_kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW

        try:
            self._proc = subprocess.Popen(
                [binary],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                env=env,
                bufsize=1,
                text=True,
                **popen_kwargs,
            )
        except PermissionError:
            self._log_append(f'✗ Permission denied: {binary}')
            if IS_LINUX:
                self._log_append('  Try: chmod +x ' + binary)
            return
        except Exception as ex:
            self._log_append(f'✗ Failed to launch relay: {ex}')
            return

        self._start_at   = datetime.now()
        self._event_cnt  = 0
        device_ip = cfg['device_ip']
        self._update_status('starting', f'PID {self._proc.pid} → {device_ip}')
        self._toggle_btn.configure(
            text='■   STOP RELAY',
            fg_color=C['red'], hover_color='#dc2626',
        )
        self._log_append(f'▶  Relay started  (PID {self._proc.pid})  →  {device_ip}')

        threading.Thread(target=self._stdout_reader, daemon=True).start()

    def _stop_relay(self):
        proc = self._proc
        self._proc = None
        if proc:
            try:
                proc.terminate()
            except Exception:
                pass
        self._update_status('offline')
        self._toggle_btn.configure(
            text='▶   START RELAY',
            fg_color=C['green'], hover_color='#059669',
        )
        self._log_append('■  Relay stopped.')

    def _stdout_reader(self):
        """Runs in a daemon thread — reads relay process stdout into the queue."""
        proc = self._proc
        if proc is None:
            return
        try:
            for line in proc.stdout:  # type: ignore
                self._log_q.put(line.rstrip())
        except Exception:
            pass
        rc = proc.poll()
        self._log_q.put(f'[Process exited: code {rc}]')
        self.after(60, self._on_proc_died)

    def _on_proc_died(self):
        if self._proc is not None:
            self._proc = None
            self._update_status('offline', 'Process exited unexpectedly')
            self._toggle_btn.configure(
                text='▶   START RELAY',
                fg_color=C['green'], hover_color='#059669',
            )

    # ── Log ────────────────────────────────────────────────────────────────────
    def _schedule_log_drain(self):
        self._drain_log()
        if self._running:
            self.after(80, self._schedule_log_drain)

    def _drain_log(self):
        lines: list[str] = []
        while not self._log_q.empty():
            try:
                lines.append(self._log_q.get_nowait())
            except queue.Empty:
                break

        if not lines:
            return

        self._log_append('\n'.join(lines))

        # Parse status from log content
        for line in lines:
            ll = line.lower()
            if 'connected to zk' in ll or 'connected via tcp' in ll:
                self.after(0, lambda: self._update_status('connected'))
            elif 'reconnect' in ll or 'failed to connect' in ll:
                self.after(0, lambda: self._update_status('reconnecting'))
            if '→' in line or 'attendance' in ll or 'check-in' in ll:
                self._event_cnt += 1
                cnt = self._event_cnt
                self.after(0, lambda c=cnt: (
                    self._ev_val.configure(text=str(c)),
                    self._last_val.configure(text=datetime.now().strftime('%H:%M')),
                ))

    def _log_append(self, msg: str):
        ts = datetime.now().strftime('%H:%M:%S')
        text = f'[{ts}] {msg}\n'
        self._log_box.configure(state='normal')
        self._log_box.insert('end', text)
        self._log_box.see('end')
        # Trim log if too long (keep last 3000 lines)
        try:
            nlines = int(self._log_box.index('end').split('.')[0])
            if nlines > 3500:
                self._log_box.delete('1.0', f'{nlines - 3000}.0')
        except Exception:
            pass
        self._log_box.configure(state='disabled')

    def _clear_log(self):
        self._log_box.configure(state='normal')
        self._log_box.delete('1.0', 'end')
        self._log_box.configure(state='disabled')

    # ── Uptime ticker ──────────────────────────────────────────────────────────
    def _schedule_uptime(self):
        if self._running:
            self._tick_uptime()
            self.after(1000, self._schedule_uptime)

    def _tick_uptime(self):
        if self._proc and self._start_at:
            secs = int((datetime.now() - self._start_at).total_seconds())
            h, r = divmod(secs, 3600)
            m, s = divmod(r, 60)
            self._up_val.configure(text=f'{h:02d}:{m:02d}:{s:02d}')
        else:
            self._up_val.configure(text='—')

    # ── Config ─────────────────────────────────────────────────────────────────
    def _config_from_entries(self) -> dict:
        cfg = self._cfg.copy()
        for key, entry in self._entries.items():
            cfg[key] = entry.get().strip()
        cfg['autorun'] = self._autorun_var.get()
        return cfg

    def _save_config(self):
        cfg = self._config_from_entries()
        self._cfg = cfg
        save_config(cfg)
        self._log_append('✓  Config saved to drais-relay.config.json')
        if self._proc:
            self._log_append('↻  Stop and restart relay for changes to take effect.')

    def _autorun_changed(self):
        self._cfg['autorun'] = self._autorun_var.get()
        save_config(self._cfg)

    def _toggle_secret(self, entry):
        entry.configure(show='' if entry.cget('show') else '●')

    # ── Close ──────────────────────────────────────────────────────────────────
    def _on_close(self):
        if self._proc:
            ans = messagebox.askyesnocancel(
                'DRAIS Relay Manager',
                'The relay is currently running.\n\nStop relay and exit?',
            )
            if ans is None:  # Cancel
                return
            if ans:  # Yes — stop and exit
                self._stop_relay()
            # No — exit GUI but relay process continues (detached)
        self._running = False
        self.destroy()


# ── Entry point ────────────────────────────────────────────────────────────────
def main():
    autostart_flag = '--autostart' in sys.argv
    app = RelayManagerApp(autostart=autostart_flag)
    app.mainloop()


if __name__ == '__main__':
    main()
