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
        return "", {}
    ua = str(data.get("ua") or "")
    cookies = data.get("cookies") if isinstance(data.get("cookies"), dict) else {}
    cookies = {str(k): str(v) for k, v in cookies.items() if k and v}
    return ua, cookies


def _save_store(ua, cookies):
    os.makedirs(os.path.dirname(_STORE), exist_ok=True)
    tmp = _STORE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"ua": ua, "cookies": cookies}, f, ensure_ascii=False)
    os.replace(tmp, _STORE)


def _chrome_path():
    for path in _CHROME_CANDIDATES:
        if path and os.path.isfile(path):
            return path
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

    ua, cookies = _load_store()
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
        impersonate="chrome",
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

    deadline = time.time() + 70
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
            for i in range(120):
                if pid and i in (0, 8):
                    _raise_chrome(pid)
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
                await asyncio.sleep(0.5)
            return ua, cookies


def _raise_chrome(pid):
    """Keep the clearance window above other apps. A covered window never finishes Turnstile."""
    try:
        import ctypes
        from ctypes import wintypes
    except Exception:
        return
    user32 = ctypes.windll.user32
    user32.keybd_event.argtypes = [ctypes.c_ubyte, ctypes.c_ubyte, ctypes.c_uint, ctypes.c_void_p]
    found = []

    def _cb(hwnd, _lparam):
        if user32.IsWindowVisible(hwnd):
            owner = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(owner))
            if owner.value == pid:
                found.append(hwnd)
        return True

    enum_proc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows(enum_proc(_cb), 0)
    if not found:
        return
    HWND_TOPMOST = -1
    SWP_SHOWWINDOW = 0x0040
    user32.keybd_event(0x12, 0, 0, None)
    try:
        for hwnd in found:
            user32.ShowWindow(hwnd, 9)
            user32.SetWindowPos(hwnd, HWND_TOPMOST, 40, 40, 980, 720, SWP_SHOWWINDOW)
            user32.SetForegroundWindow(hwnd)
    finally:
        user32.keybd_event(0x12, 0, 2, None)


def _refresh_clearance():
    chrome = _chrome_path()
    if not chrome:
        raise DonmaiBlocked("本机没有找到 Chrome，过不了 Danbooru 现在的 Cloudflare 验证。")
    port = _free_port()
    os.makedirs(_PROFILE, exist_ok=True)
    url = "https://danbooru.donmai.us/posts.json?limit=1&tags=rating:g"
    args = [
        chrome,
        f"--remote-debugging-port={port}",
        "--user-data-dir=" + _PROFILE,
        "--disable-quic",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-blink-features=AutomationControlled",
        "--window-position=40,40",
        "--window-size=980,720",
        url,
    ]
    proxy = _proxy_server()
    if proxy:
        args.insert(-1, "--proxy-server=" + proxy)
    print("[DanbooruAnima] Cloudflare 拦住了请求，正在打开 Chrome 通过验证…")
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.6)
    _raise_chrome(proc.pid)
    holder = {}

    def _run():
        try:
            holder["result"] = asyncio.run(_read_clearance(port, proc.pid))
        except Exception as exc:
            holder["error"] = exc

    worker = threading.Thread(target=_run, daemon=True)
    worker.start()
    worker.join(80)
    try:
        if holder.get("error"):
            raise holder["error"]
        ua, cookies = holder.get("result") or ("", {})
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
    if not cookies.get("cf_clearance"):
        raise DonmaiBlocked(
            "Danbooru 的 Cloudflare 验证没通过。请让弹出的 Chrome 停在前台，直到页面出现数据，然后再搜一次。"
        )
    if not ua:
        ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36"
    _save_store(ua, cookies)
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
            raise DonmaiBlocked("Danbooru 仍被 Cloudflare 拦住。请再搜一次；如果弹出 Chrome，让它停在前台直到出现数据。")
        return resp

    resp = _fetch(auth)
    if auth_fallback and getattr(resp, "status_code", 0) == 401 and _auth_for(url, auth):
        resp = _fetch(("", ""))
    return resp
