"use client";
import React, { useState, useEffect, useCallback } from 'react';
import SettingsSidebar from '@/components/settings/SettingsSidebar';
import {
  Radio, CheckCircle, XCircle, Clock, Copy, Check,
  Monitor, Terminal, AlertCircle, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';

const RELAY_KEY = 'DRAIS-355DF9C35EB60899009C01DD948EAD14';
const DEVICE_SN = 'GED7254601154';

interface RelayStatus {
  online: boolean;
  last_seen?: string;
  device_sn?: string;
  pending?: number;
}

function CopyBlock({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center gap-2 bg-gray-900 dark:bg-gray-950 rounded-lg px-4 py-3 font-mono text-sm text-green-400 select-all overflow-x-auto">
      <span className="flex-1 whitespace-nowrap">{text}</span>
      <button onClick={copy} title={`Copy ${label}`}
        className="ml-2 flex-shrink-0 text-gray-400 hover:text-white transition-colors">
        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

function StepBlock({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
        {num}
      </div>
      <div className="flex-1 space-y-2">
        <p className="font-medium text-gray-900 dark:text-gray-100">{title}</p>
        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">{children}</div>
      </div>
    </div>
  );
}

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        {title}
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && <div className="px-4 pb-4 pt-2 space-y-3 border-t border-gray-200 dark:border-gray-700">{children}</div>}
    </div>
  );
}

export default function RelaySetupPage() {
  const [status, setStatus] = useState<RelayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'linux' | 'windows' | 'macos'>('linux');
  const [keyCopied, setKeyCopied] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/relay-status?poll=1&device_sn=${DEVICE_SN}&relay_key=${RELAY_KEY}`);
      if (res.ok) {
        const data = await res.json();
        setStatus({ online: true, pending: data.commands?.length ?? 0 });
      } else {
        setStatus({ online: false });
      }
    } catch {
      setStatus({ online: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, 5000);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  const copyKey = () => {
    navigator.clipboard.writeText(RELAY_KEY);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const tabs = [
    { id: 'linux' as const, label: 'Linux', icon: '🐧' },
    { id: 'windows' as const, label: 'Windows', icon: '🪟' },
    { id: 'macos' as const, label: 'macOS', icon: '🍎' },
  ];

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      <SettingsSidebar />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <Radio className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Relay Agent Setup</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Run this on the school&apos;s LAN computer to enable remote fingerprint enrollment
              </p>
            </div>
          </div>

          {/* How it works banner */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-800 dark:text-blue-200">
            <strong>How it works:</strong> The relay agent runs silently on a PC that shares the same local network as the ZKTeco device.
            It polls DRAIS every 2 seconds and executes fingerprint enrollment commands the moment they are triggered — from any browser, anywhere in the world.
          </div>

          {/* Live status card */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Live Relay Status</h2>
              <button onClick={fetchStatus} title="Refresh status"
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" /> Checking…
              </div>
            ) : status?.online ? (
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                <div>
                  <p className="font-medium text-green-700 dark:text-green-400 text-sm flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4" /> Relay is online
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Polling active · {status.pending === 0 ? 'No pending commands' : `${status.pending} command(s) queued`}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div>
                  <p className="font-medium text-red-700 dark:text-red-400 text-sm flex items-center gap-1.5">
                    <XCircle className="w-4 h-4" /> Relay is offline
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Start the relay agent on the school&apos;s LAN computer to enable remote enrollment.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Relay key */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Your Relay Key</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              This key authenticates the relay agent with the DRAIS server. Keep it private.
            </p>
            <div className="flex items-center gap-2 bg-gray-900 dark:bg-gray-950 rounded-lg px-4 py-3 font-mono text-sm text-green-400 overflow-x-auto">
              <span className="flex-1 select-all whitespace-nowrap">{RELAY_KEY}</span>
              <button onClick={copyKey} title="Copy relay key"
                className="flex-shrink-0 text-gray-400 hover:text-white transition-colors ml-2">
                {keyCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* OS tabs + setup instructions */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="border-b border-gray-200 dark:border-gray-800 px-5 pt-4 flex gap-1">
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg -mb-px transition-colors ${
                    tab === t.id
                      ? 'bg-white dark:bg-gray-900 border border-b-white dark:border-b-gray-900 border-gray-200 dark:border-gray-700 text-indigo-600 dark:text-indigo-400'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border border-transparent'
                  }`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            <div className="p-5 space-y-5">
              {tab === 'linux' && (
                <>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                    <Monitor className="w-3.5 h-3.5" />
                    Works on Ubuntu, Debian, Fedora, and any systemd-based Linux distro
                  </div>
                  <div className="space-y-5">
                    <StepBlock num={1} title="Get the relay binary">
                      <p>Copy <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">drais-relay-linux</code> from your DRAIS admin&apos;s machine (<code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">workers/dist/</code>) to this computer via USB or file share.</p>
                    </StepBlock>
                    <StepBlock num={2} title="Run the installer script">
                      <p>Copy <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">install.sh</code> to the same folder as the binary, then run:</p>
                      <CopyBlock text="bash install.sh" label="install command" />
                      <p>The script will ask for your DRAIS URL, device IP, device serial, and relay key — then install everything automatically.</p>
                    </StepBlock>
                    <StepBlock num={3} title="What the installer sets up">
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Binary installed to <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">~/.local/bin/drais-relay</code></li>
                        <li>Config saved to <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">~/.config/drais-relay/config.json</code></li>
                        <li>systemd user service created and enabled</li>
                        <li>Auto-starts on boot forever — no terminal needed</li>
                      </ul>
                    </StepBlock>
                    <Collapsible title="Manual setup (without install.sh)">
                      <CopyBlock text="chmod +x drais-relay-linux && ./drais-relay-linux" label="manual run command" />
                      <p className="text-xs mt-2">Set these environment variables before running:</p>
                      <CopyBlock text={`DRAIS_URL=https://sims.drais.pro\nDEVICE_IP=192.168.1.197\nDEVICE_SN=${DEVICE_SN}\nRELAY_KEY=${RELAY_KEY}`} label="env vars" />
                    </Collapsible>
                    <Collapsible title="Verify the relay is running">
                      <CopyBlock text="systemctl --user status drais-relay" label="status check" />
                      <p className="text-xs mt-2">You should see <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">active (running)</code>. The status card above will turn green within 5 seconds.</p>
                    </Collapsible>
                  </div>
                </>
              )}

              {tab === 'windows' && (
                <>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                    <Monitor className="w-3.5 h-3.5" />
                    Works on Windows 10 and Windows 11 — full GUI with system tray icon
                  </div>
                  <div className="space-y-5">
                    <StepBlock num={1} title="Get the relay package">
                      <p>Copy <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">DRAIS-Relay-Windows.zip</code> from your DRAIS admin&apos;s machine (<code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">workers/dist/</code>) to this computer, then extract it.</p>
                    </StepBlock>
                    <StepBlock num={2} title="Run DRAIS Relay.exe">
                      <p>Inside the extracted folder, double-click <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">DRAIS Relay.exe</code>. A tray icon appears in the bottom-right corner of the taskbar.</p>
                      <p>The app starts the relay automatically and shows live connection status.</p>
                    </StepBlock>
                    <StepBlock num={3} title="Configure your device (first time only)">
                      <p>Click the tray icon → <strong>Open Control Panel</strong> → expand <strong>Settings</strong>. Enter your device IP, serial number, and the relay key from above, then click <strong>Save &amp; Restart</strong>.</p>
                    </StepBlock>
                    <StepBlock num={4} title="Enable auto-start with Windows">
                      <p>In the Settings panel, toggle <strong>Start with Windows login</strong> to ON — or double-click <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">install-windows.bat</code> (inside the extracted folder) to create a startup shortcut automatically.</p>
                    </StepBlock>
                    <Collapsible title="If Windows Defender blocks the .exe">
                      <p className="text-xs">Click <strong>More info</strong> → <strong>Run anyway</strong>. The binary is safe — Defender flags unsigned apps from unknown publishers.</p>
                      <p className="text-xs mt-1">Alternatively, right-click the .exe → Properties → tick <strong>Unblock</strong> → Apply.</p>
                    </Collapsible>
                    <Collapsible title="Verify the relay is running">
                      <p className="text-xs">The tray icon turns <strong>green</strong> when connected to the device. The status card at the top of this page also turns green within 5 seconds. You can also check Task Manager → Background processes → <strong>DRAIS Relay.exe</strong>.</p>
                    </Collapsible>
                  </div>
                </>
              )}

              {tab === 'macos' && (
                <>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                    <Monitor className="w-3.5 h-3.5" />
                    Works on macOS 12 Monterey and later (Intel + Apple Silicon)
                  </div>
                  <div className="space-y-5">
                    <StepBlock num={1} title="Get the relay files">
                      <p>Copy both files from your DRAIS admin&apos;s machine (<code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">workers/dist/</code>) to your Mac:</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">drais-relay-macos</code></li>
                        <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">install.sh</code></li>
                      </ul>
                    </StepBlock>
                    <StepBlock num={2} title="Open Terminal and run the installer">
                      <p>Open <strong>Terminal</strong> (Spotlight → Terminal), navigate to the folder, then run:</p>
                      <CopyBlock text="bash install.sh" label="install command" />
                    </StepBlock>
                    <StepBlock num={3} title="Allow the binary in Security settings">
                      <p>macOS may block the binary on first run. Go to <strong>System Settings → Privacy &amp; Security</strong> and click <strong>Allow Anyway</strong> next to the drais-relay entry.</p>
                    </StepBlock>
                    <StepBlock num={4} title="What the installer sets up">
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Binary installed to <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">~/.local/bin/drais-relay</code></li>
                        <li>LaunchAgent plist created at <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">~/Library/LaunchAgents/pro.drais.relay.plist</code></li>
                        <li>Auto-starts on login with <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">launchctl</code></li>
                        <li>Restarts automatically if the process exits</li>
                      </ul>
                    </StepBlock>
                    <Collapsible title="Verify the relay is running">
                      <CopyBlock text="launchctl list | grep drais" label="status check" />
                      <p className="text-xs mt-2">You should see <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">pro.drais.relay</code> listed with a PID. The status card above will turn green within 5 seconds.</p>
                    </Collapsible>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Requirements callout */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium text-sm">
              <AlertCircle className="w-4 h-4" /> Requirements
            </div>
            <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-1 pl-6 list-disc">
              <li>The computer running the relay <strong>must be on the same local network</strong> as the ZKTeco fingerprint device</li>
              <li>The computer needs a stable internet connection to reach DRAIS</li>
              <li>The ZKTeco device must be reachable at its configured IP on the LAN</li>
              <li>The computer should stay powered on and connected — the relay is lightweight (&lt;1% CPU)</li>
            </ul>
          </div>

          {/* Config reference card */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2">
              <Terminal className="w-4 h-4 text-gray-400" /> Configuration Reference
            </h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {[
                { label: 'DRAIS Server URL', value: 'https://sims.drais.pro' },
                { label: 'Device IP', value: '192.168.1.197' },
                { label: 'Device Port', value: '4370' },
                { label: 'Device Serial', value: DEVICE_SN },
                { label: 'Poll Interval', value: 'every 2 seconds' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
                  <p className="font-mono text-gray-800 dark:text-gray-200 text-xs bg-gray-50 dark:bg-gray-800 rounded px-2 py-1">{value}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
