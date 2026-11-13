"""Danbooru / cdn.donmai.us client.

Cloudflare now puts a Turnstile check in front of both the API and the image
CDN. Plain requests receive 403 and the browsers show an empty gallery.
A normal Chrome window can finish that check. We keep its cf_clearance and
replay it with curl_cffi (browser TLS). The cookie is tied to this machine's
IP and to the Chrome user agent, so the user agent is stored with it.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import socket
import subprocess
import threading
import time
import urllib.request
from urllib.parse import urlparse

_STORE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "donmai_cf.json")
_PROFILE = os.path.join(os.environ.get("TEMP") or os.environ.get("TMP") or ".", "danbooru_anima_cf_profile")
_LOCK = threading.Lock()
_CHROME_CANDIDATES = (
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
)


class DonmaiBlocked(RuntimeError):
    pass


def _proxies():
    found = urllib.request.getproxies() or {}
    proxies = {}
    for key in ("http", "https"):
        value = found.get(key)
        if value:
            proxies[key] = value
    return proxies


def _proxy_server():
    proxies = _proxies()
    return proxies.get("https") or proxies.get("http") or ""


def _load_store():
    try:
        with open(_STORE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return "", {}, ""
    ua = str(data.get("ua") or "")
    cookies = data.get("cookies") if isinstance(data.get("cookies"), dict) else {}
    cookies = {str(k): str(v) for k, v in cookies.items() if k and v}
    impersonate = str(data.get("impersonate") or "")
    return ua, cookies, impersonate


def _save_store(ua, cookies, impersonate=""):
    os.makedirs(os.path.dirname(_STORE), exist_ok=True)
    tmp = _STORE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"ua": ua, "cookies": cookies, "impersonate": impersonate}, f, ensure_ascii=False)
    os.replace(tmp, _STORE)


def _chrome_profiles():
    names = []
    try:
        from curl_cffi.requests.impersonate import BrowserType
        names = [x.value for x in BrowserType]
    except Exception:
        return [(0, "chrome")]
    found = []
    for name in names:
        if not name.startswith("chrome") or "android" in name or "macos" in name:
            continue
        digits = ""
        for ch in name[6:]:
            if ch.isdigit():
                digits += ch
            else:
                break
        if digits:
            found.append((int(digits), name))
    found.sort()
    return found or [(0, "chrome")]


def _chrome_major(ua):
    token = "Chrome/"
    i = str(ua or "").find(token)
    if i < 0:
        return 0
    j = i + len(token)
    text = str(ua or "")
    digits = ""
    while j < len(text) and text[j].isdigit():
        digits += text[j]
        j += 1
    try:
        return int(digits or "0")
    except Exception:
        return 0


def _impersonate_for_ua(ua):
    profiles = _chrome_profiles()
    major = _chrome_major(ua)
    if major <= 0:
        return profiles[-1][1]
    chosen = profiles[0][1]
    for ver, name in profiles:
        if ver <= major:
            chosen = name
        else:
            break
    return chosen


def _chrome_path():
    for path in _CHROME_CANDIDATES:
        if path and os.path.isfile(path):
            return path
    try:
        import winreg
        keys = (
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"),
            (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"),
        )
        for root, sub in keys:
            try:
                with winreg.OpenKey(root, sub) as key:
                    val, _typ = winreg.QueryValueEx(key, "")
            except OSError:
                continue
            if val and os.path.isfile(val):
                return val
    except Exception:
        pass
    return ""


def _free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _is_challenge(resp):
    if getattr(resp, "status_code", 0) != 403:
        return False
    mitigated = ""
    try:
        mitigated = resp.headers.get("cf-mitigated") or ""
    except Exception:
        mitigated = ""
    if mitigated:
        return True
    text = (getattr(resp, "text", "") or "")[:2500].lower()
    return "just a moment" in text or "请稍候" in text or "cdn-cgi/challenge" in text or "turnstile" in text


def _basic_header(user, key):
    """Danbooru 用登录名 + API Key 做 HTTP Basic。缺一就不登录。"""
    user = str(user or "").strip()
    key = str(key or "").strip()
    if not user or not key or key == "***":
        return ""
    token = base64.b64encode((user + ":" + key).encode("utf-8")).decode("ascii")
    return "Basic " + token


def _auth_for(url, auth):
    """只给 danbooru.donmai.us 的接口加凭据，图片 CDN 不带 Key。"""
    host = (urlparse(url).hostname or "").lower()
    if host != "danbooru.donmai.us":
        return ""
    if auth is not None:
        if isinstance(auth, (tuple, list)) and len(auth) >= 2:
            return _basic_header(auth[0], auth[1])
        return ""
    try:
        from .config import load_settings
        settings = load_settings()
    except Exception:
        return ""
    return _basic_header(settings.get("danbooru_username"), settings.get("danbooru_api_key"))


def _raw(method, url, params, timeout, data=None, auth=None):
    from curl_cffi import requests as cr

    ua, cookies, impersonate = _load_store()
    if not impersonate:
        impersonate = _impersonate_for_ua(ua)
    headers = {
        "Accept": "application/json,image/avif,image/webp,image/*,*/*;q=0.8",
        "Referer": "https://danbooru.donmai.us/",
    }
    auth_header = _auth_for(url, auth)
    if auth_header:
        headers["Authorization"] = auth_header
    if ua:
        headers["User-Agent"] = ua
    proxies = _proxies() or None
    if isinstance(timeout, (tuple, list)):
        timeout = timeout[-1] if timeout else 30
    kw = dict(
        params=params,
        headers=headers,
        cookies=cookies or None,
        proxies=proxies,
        impersonate=impersonate or "chrome",
        timeout=timeout or 30,
    )
    if data is not None:
        kw["data"] = data
    return cr.request(method or "GET", url, **kw)


async def _cdp(ws, msg_id, method, params=None):
    await ws.send_json({"id": msg_id, "method": method, "params": params or {}})
    while True:
        msg = await ws.receive_json()
        if msg.get("id") == msg_id:
            return msg


def _cookie_map(raw):
    cookies = {}
    for item in raw or []:
        name = item.get("name")
        value = item.get("value")
        domain = (item.get("domain") or "")
        if name and value and "donmai.us" in domain:
            cookies[name] = value
    return cookies


async def _read_clearance(port, pid=0):
    import aiohttp

    deadline = time.time() + 15
    pages = None
    async with aiohttp.ClientSession() as sess:
        while time.time() < deadline:
            try:
                async with sess.get(f"http://127.0.0.1:{port}/json/list", timeout=2) as resp:
                    pages = await resp.json()
                if any("donmai.us" in (p.get("url") or "") for p in pages or []):
                    break
            except Exception:
                pass
            await asyncio.sleep(0.25)
        if not pages:
            return "", {}
        page = next((p for p in pages if "donmai.us" in (p.get("url") or "")), None)
        if not page:
            return "", {}
        async with sess.get(f"http://127.0.0.1:{port}/json/version", timeout=2) as resp:
            version = await resp.json()
        async with sess.ws_connect(page["webSocketDebuggerUrl"], max_msg_size=8 * 1024 * 1024) as ws:
            await _cdp(ws, 1, "Page.bringToFront")
            ua = ""
            cookies = {}
            for i in range(160):
                cookie_msg = await _cdp(
                    ws,
                    i + 2,
                    "Network.getCookies",
                    {"urls": ["https://danbooru.donmai.us/", "https://cdn.donmai.us/", "https://donmai.us/"]},
                )
                cookies = _cookie_map((cookie_msg.get("result") or {}).get("cookies"))
                if not cookies.get("cf_clearance"):
                    try:
                        async with sess.ws_connect(version["webSocketDebuggerUrl"], max_msg_size=4 * 1024 * 1024) as bws:
                            browser_msg = await _cdp(bws, 1, "Storage.getCookies")
                            cookies = _cookie_map((browser_msg.get("result") or {}).get("cookies")) or cookies
                    except Exception:
                        pass
                if cookies.get("cf_clearance"):
                    ua_msg = await _cdp(
                        ws,
                        9000,
                        "Runtime.evaluate",
                        {"expression": "navigator.userAgent", "returnByValue": True},
                    )
                    ua = ((ua_msg.get("result") or {}).get("result") or {}).get("value") or ""
                    return ua, cookies
                await asyncio.sleep(0.45)
            return ua, cookies


async def _click_turnstile(ws, msg_id):
    expr = (
        "(() => {"
        "var list = document.querySelectorAll('iframe');"
        "for (var i = 0; i < list.length; i++) {"
        "  var src = list[i].src || '';"
        "  if (src.indexOf('challenges.cloudflare.com') < 0 && src.indexOf('turnstile') < 0) continue;"
        "  var r = list[i].getBoundingClientRect();"
        "  if (r.width < 8 || r.height < 8) continue;"
        "  return {x: r.left + Math.min(30, r.width / 2), y: r.top + r.height / 2};"
        "}"
        "return null;"
        "})()"
    )
    msg = await _cdp(ws, msg_id, "Runtime.evaluate", {"expression": expr, "returnByValue": True})
    pos = ((msg.get("result") or {}).get("result") or {}).get("value")
    if not isinstance(pos, dict):
        return
    try:
        x = float(pos.get("x"))
        y = float(pos.get("y"))
    except Exception:
        return
    for kind in ("mouseMoved", "mousePressed", "mouseReleased"):
        await _cdp(ws, msg_id + 1, "Input.dispatchMouseEvent", {
            "type": kind,
            "x": x,
            "y": y,
            "button": "left",
            "clickCount": 1,
        })


def _family_pids(root):
    root = int(root or 0)
    if root <= 0:
        return set()
    try:
        import ctypes
        from ctypes import wintypes
        kernel32 = ctypes.windll.kernel32
        TH32CS_SNAPPROCESS = 0x00000002

        class PE(ctypes.Structure):
            _fields_ = [
                ("dwSize", wintypes.DWORD),
                ("cntUsage", wintypes.DWORD),
                ("th32ProcessID", wintypes.DWORD),
                ("th32DefaultHeapID", ctypes.c_size_t),
                ("th32ModuleID", wintypes.DWORD),
                ("cntThreads", wintypes.DWORD),
                ("th32ParentProcessID", wintypes.DWORD),
                ("pcPriClassBase", ctypes.c_long),
                ("dwFlags", wintypes.DWORD),
                ("szExeFile", wintypes.WCHAR * 260),
            ]

        snap = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
        if not snap or snap == ctypes.c_void_p(-1).value:
            return {root}
        edges = []
        try:
            pe = PE()
            pe.dwSize = ctypes.sizeof(PE)
            ok = kernel32.Process32FirstW(snap, ctypes.byref(pe))
            while ok:
                edges.append((int(pe.th32ProcessID), int(pe.th32ParentProcessID)))
                ok = kernel32.Process32NextW(snap, ctypes.byref(pe))
        finally:
            kernel32.CloseHandle(snap)
        children = {}
        for pid, parent in edges:
            children.setdefault(parent, []).append(pid)
        found = set()
        stack = [root]
        while stack:
            cur = stack.pop()
            if cur in found:
                continue
            found.add(cur)
            stack.extend(children.get(cur, []))
        return found or {root}
    except Exception:
        return {root}


def _raise_chrome(pid, steal_focus=False):
    """Keep the clearance window visible. A covered window never finishes Turnstile."""
    try:
        import ctypes
        from ctypes import wintypes
    except Exception:
        return
    user32 = ctypes.windll.user32
    pids = _family_pids(pid)
    found = []

    def _cb(hwnd, _lparam):
        if user32.IsWindowVisible(hwnd):
            owner = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(owner))
            if int(owner.value) in pids:
                rect = wintypes.RECT()
                user32.GetWindowRect(hwnd, ctypes.byref(rect))
                area = max(0, rect.right - rect.left) * max(0, rect.bottom - rect.top)
                if area >= 200 * 160:
                    found.append((area, hwnd))
        return True

    enum_proc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows(enum_proc(_cb), 0)
    if not found:
        return
    hwnd = max(found)[1]
    HWND_TOPMOST = -1
    SWP_SHOWWINDOW = 0x0040
    if steal_focus:
        user32.keybd_event.argtypes = [ctypes.c_ubyte, ctypes.c_ubyte, ctypes.c_uint, ctypes.c_void_p]
        user32.keybd_event(0x12, 0, 0, None)
    try:
        user32.ShowWindow(hwnd, 9)
        user32.SetWindowPos(hwnd, HWND_TOPMOST, 40, 40, 980, 720, SWP_SHOWWINDOW)
        if steal_focus:
            user32.SetForegroundWindow(hwnd)
    finally:
        if steal_focus:
            user32.keybd_event(0x12, 0, 2, None)


_CLEARANCE_ACTIVE = False
_CLEARANCE_HINT = "会弹出一个 Chrome 窗口。里面如果是勾选或者「请稍候」，就在那个窗口里做完，不要关掉。做完以后窗口里会出现图，这里会自己继续。如果窗口里已经是一排图，不用点。"


def clearance_active():
    return bool(_CLEARANCE_ACTIVE)


def _refresh_clearance():
    global _CLEARANCE_ACTIVE
    chrome = _chrome_path()
    if not chrome:
        raise DonmaiBlocked("本机没有找到 Chrome，过不了 Danbooru 现在的 Cloudflare 验证。")
    port = _free_port()
    os.makedirs(_PROFILE, exist_ok=True)
    url = "https://danbooru.donmai.us/posts?tags=rating:g"
    args = [
        chrome,
        f"--remote-debugging-port={port}",
        "--user-data-dir=" + _PROFILE,
        "--disable-quic",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-features=CalculateNativeWinOcclusion",
        "--window-position=40,40",
        "--window-size=980,720",
        url,
    ]
    proxy = _proxy_server()
    if proxy:
        args.insert(-1, "--proxy-server=" + proxy)
    print("[DanbooruAnima] Cloudflare 拦住了请求，正在打开 Chrome 让用户通过验证…")
    _CLEARANCE_ACTIVE = True
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    _raise_chrome(proc.pid, steal_focus=True)
    holder = {}

    def _run():
        try:
            holder["result"] = asyncio.run(_read_clearance(port, proc.pid))
        except Exception as exc:
            holder["error"] = exc

    worker = threading.Thread(target=_run, daemon=True)
    worker.start()
    opened = time.time()
    brought = False
    deadline = opened + 90
    try:
        while worker.is_alive() and time.time() < deadline:
            if not brought and time.time() > opened + 1.6:
                _raise_chrome(proc.pid, steal_focus=True)
                brought = True
            worker.join(0.4)
        worker.join(2)
        if holder.get("error"):
            raise holder["error"]
        ua, cookies = holder.get("result") or ("", {})
    finally:
        _CLEARANCE_ACTIVE = False
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
    if not cookies.get("cf_clearance"):
        raise DonmaiBlocked(_CLEARANCE_HINT)
    if not ua:
        ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36"
    _save_store(ua, cookies, _impersonate_for_ua(ua))
    print("[DanbooruAnima] Cloudflare 验证已通过")


def get(url, params=None, timeout=30, method="GET", data=None, auth=None, auth_fallback=True):
    """GET/POST a donmai.us URL, refreshing cf_clearance once if challenged.

    auth 为 (登录名, API Key) 时用这对凭据；为 None 时读 settings.json。
    凭据被 D 站拒绝（401）时，搜索仍退回匿名，避免填错把画廊打空。
    """
    host = (urlparse(url).hostname or "").lower()
    if not (host == "donmai.us" or host.endswith(".donmai.us")):
        raise ValueError("donmai_client only fetches donmai.us")

    def _fetch(auth_value):
        try:
            resp = _raw(method, url, params, timeout, data, auth_value)
        except ImportError as exc:
            raise DonmaiBlocked("缺少 curl_cffi，没法带着浏览器指纹访问 Danbooru。") from exc
        if not _is_challenge(resp):
            return resp
        with _LOCK:
            try:
                resp = _raw(method, url, params, timeout, data, auth_value)
            except ImportError as exc:
                raise DonmaiBlocked("缺少 curl_cffi，没法带着浏览器指纹访问 Danbooru。") from exc
            if not _is_challenge(resp):
                return resp
            _refresh_clearance()
            resp = _raw(method, url, params, timeout, data, auth_value)
        if _is_challenge(resp):
            raise DonmaiBlocked(_CLEARANCE_HINT)
        return resp

    resp = _fetch(auth)
    if auth_fallback and getattr(resp, "status_code", 0) == 401 and _auth_for(url, auth):
        resp = _fetch(("", ""))
    return resp
