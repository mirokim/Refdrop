#!/usr/bin/env python3
"""
RefDrop Helper App
Bridges Chrome Extension → PureRef via clipboard + Ctrl+V
Communicates with the extension via Chrome Native Messaging (stdin/stdout JSON)
"""

import sys
import json
import struct
import base64
import tempfile
import os
import platform
import urllib.request
import urllib.error

SYSTEM = platform.system()  # 'Windows' or 'Darwin'

# ── Clipboard helpers ──────────────────────────────────────────────────────────

def set_clipboard_image_windows(img_bytes: bytes) -> None:
    import win32clipboard
    import win32con
    from io import BytesIO
    from PIL import Image

    # Convert to BMP DIB for clipboard
    img = Image.open(BytesIO(img_bytes))
    img = img.convert("RGB")
    output = BytesIO()
    img.save(output, format="BMP")
    bmp_data = output.getvalue()[14:]  # strip BMP file header, keep DIB

    win32clipboard.OpenClipboard()
    try:
        win32clipboard.EmptyClipboard()
        win32clipboard.SetClipboardData(win32con.CF_DIB, bmp_data)
    finally:
        win32clipboard.CloseClipboard()


def set_clipboard_image_macos(img_bytes: bytes) -> None:
    import subprocess
    from io import BytesIO
    from PIL import Image

    img = Image.open(BytesIO(img_bytes))
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        tmp_path = f.name
    try:
        img.save(tmp_path, format="PNG")
        subprocess.run(
            ["osascript", "-e",
             f'set the clipboard to (read (POSIX file "{tmp_path}") as JPEG picture)'],
            check=True, capture_output=True
        )
    finally:
        os.unlink(tmp_path)


# ── PureRef focus + paste ──────────────────────────────────────────────────────

def paste_to_pureref_windows() -> bool:
    """Focus PureRef window and send Ctrl+V. Returns False if PureRef not found."""
    import win32gui
    import win32con
    import win32api
    import time

    def find_pureref(hwnd, result):
        title = win32gui.GetWindowText(hwnd)
        if "pureref" in title.lower():
            result.append(hwnd)

    hwnds = []
    win32gui.EnumWindows(find_pureref, hwnds)
    if not hwnds:
        return False

    hwnd = hwnds[0]
    # Restore if minimized
    if win32gui.IsIconic(hwnd):
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
    win32gui.SetForegroundWindow(hwnd)
    time.sleep(0.15)

    # Send Ctrl+V
    VK_CONTROL = 0x11
    VK_V = 0x56
    win32api.keybd_event(VK_CONTROL, 0, 0, 0)
    win32api.keybd_event(VK_V, 0, 0, 0)
    win32api.keybd_event(VK_V, 0, win32con.KEYEVENTF_KEYUP, 0)
    win32api.keybd_event(VK_CONTROL, 0, win32con.KEYEVENTF_KEYUP, 0)
    return True


def paste_to_pureref_macos() -> bool:
    """Focus PureRef and send Cmd+V via AppleScript."""
    import subprocess
    script = '''
    tell application "System Events"
        set procs to name of every process
        if "PureRef" is in procs then
            tell process "PureRef"
                set frontmost to true
                delay 0.15
                keystroke "v" using command down
            end tell
            return true
        end if
    end tell
    return false
    '''
    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True, text=True
    )
    return result.stdout.strip() == "true"


# ── Image download ─────────────────────────────────────────────────────────────

def download_image(url: str, referrer: str = "") -> bytes:
    req = urllib.request.Request(url)
    req.add_header("User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36")
    if referrer:
        req.add_header("Referer", referrer)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read()


# ── Main handler ───────────────────────────────────────────────────────────────

def handle_message(msg: dict) -> dict:
    """
    Expected message format:
      { "type": "send_image", "url": "https://...", "referrer": "https://..." }
      { "type": "send_image", "data": "<base64>", "mime": "image/png" }
    """
    try:
        if msg.get("type") != "send_image":
            return {"ok": False, "error": "unknown_type"}

        # 1. Get image bytes
        if "data" in msg:
            img_bytes = base64.b64decode(msg["data"])
        elif "url" in msg:
            referrer = msg.get("referrer", "")
            try:
                img_bytes = download_image(msg["url"], referrer)
            except urllib.error.HTTPError as e:
                # YouTube maxresdefault returns 404 for some videos → try ytFallback
                fallback = msg.get("ytFallback", "")
                if e.code == 404 and fallback:
                    img_bytes = download_image(fallback, referrer)
                else:
                    raise
        else:
            return {"ok": False, "error": "no_image_data"}

        # 2. Write to clipboard
        if SYSTEM == "Windows":
            set_clipboard_image_windows(img_bytes)
            found = paste_to_pureref_windows()
        elif SYSTEM == "Darwin":
            set_clipboard_image_macos(img_bytes)
            found = paste_to_pureref_macos()
        else:
            return {"ok": False, "error": "unsupported_platform"}

        if not found:
            return {"ok": False, "error": "pureref_not_running"}

        return {"ok": True}

    except urllib.error.HTTPError as e:
        return {"ok": False, "error": f"http_{e.code}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ── Chrome Native Messaging protocol ──────────────────────────────────────────

def read_message() -> dict | None:
    raw_len = sys.stdin.buffer.read(4)
    if not raw_len or len(raw_len) < 4:
        return None
    msg_len = struct.unpack("=I", raw_len)[0]
    raw_msg = sys.stdin.buffer.read(msg_len)
    return json.loads(raw_msg.decode("utf-8"))


def send_message(msg: dict) -> None:
    encoded = json.dumps(msg).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def main():
    while True:
        msg = read_message()
        if msg is None:
            break
        response = handle_message(msg)
        send_message(response)


if __name__ == "__main__":
    main()
