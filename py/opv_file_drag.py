# -*- coding: utf-8 -*-
"""把一张图片拖到别的软件。这个进程和 ComfyUI 分开。

松手由低级鼠标钩子判断，不读 GetAsyncKeyState。系统拖拽进行时那个函数会一直报左键按着，
拖拽就退不出去，鼠标会一直被占住。松手后若拖拽还卡在别的窗口里，这个进程直接退出。
"""
import ctypes
import os
import sys
import threading
import time
import uuid

_UP = threading.Event()
_RELEASED = threading.Event()
_DONE = threading.Event()
_STOP = threading.Event()
_ARM_AT = 0.0
_BTN = [True]
_HOOK = {"handle": None, "proc": None}
_BROWSERS = ("chrome.exe", "msedge.exe", "brave.exe", "opera.exe", "vivaldi.exe", "chromium.exe")
_PIDS = set()
_COVERS = []
_BROWSER_RECTS = []
_PAD = {"hwnd": None, "user32": None}


class _POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]


class _RECT(ctypes.Structure):
    _fields_ = [("left", ctypes.c_long), ("top", ctypes.c_long), ("right", ctypes.c_long), ("bottom", ctypes.c_long)]


class _GUID(ctypes.Structure):
    _fields_ = [
        ("Data1", ctypes.c_uint32),
        ("Data2", ctypes.c_uint16),
        ("Data3", ctypes.c_uint16),
        ("Data4", ctypes.c_ubyte * 8),
    ]


class _MSG(ctypes.Structure):
    _fields_ = [
        ("hwnd", ctypes.c_void_p),
        ("message", ctypes.c_uint),
        ("wParam", ctypes.c_size_t),
        ("lParam", ctypes.c_ssize_t),
        ("time", ctypes.c_uint),
        ("pt_x", ctypes.c_long),
        ("pt_y", ctypes.c_long),
    ]


def _guid(text):
    return _GUID.from_buffer_copy(uuid.UUID(text).bytes_le)


def _bind():
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    shell32 = ctypes.WinDLL("shell32", use_last_error=True)
    ole32 = ctypes.WinDLL("ole32", use_last_error=True)
    dwm = ctypes.WinDLL("dwmapi", use_last_error=True)
    user32.SetThreadDpiAwarenessContext.argtypes = [ctypes.c_void_p]
    user32.SetThreadDpiAwarenessContext.restype = ctypes.c_void_p
    user32.GetAsyncKeyState.argtypes = [ctypes.c_int]
    user32.GetAsyncKeyState.restype = ctypes.c_short
    user32.GetCursorPos.argtypes = [ctypes.c_void_p]
    user32.GetCursorPos.restype = ctypes.c_bool
    user32.WindowFromPoint.argtypes = [_POINT]
    user32.WindowFromPoint.restype = ctypes.c_void_p
    user32.GetAncestor.argtypes = [ctypes.c_void_p, ctypes.c_uint]
    user32.GetAncestor.restype = ctypes.c_void_p
    user32.EnumWindows.restype = ctypes.c_bool
    user32.IsWindowVisible.argtypes = [ctypes.c_void_p]
    user32.IsWindowVisible.restype = ctypes.c_bool
    user32.IsIconic.argtypes = [ctypes.c_void_p]
    user32.IsIconic.restype = ctypes.c_bool
    user32.IsWindow.argtypes = [ctypes.c_void_p]
    user32.IsWindow.restype = ctypes.c_bool
    user32.GetWindowThreadProcessId.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint32)]
    user32.GetWindowThreadProcessId.restype = ctypes.c_uint32
    user32.GetWindowRect.argtypes = [ctypes.c_void_p, ctypes.POINTER(_RECT)]
    user32.GetWindowRect.restype = ctypes.c_bool
    user32.GetClassNameW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_int]
    user32.GetClassNameW.restype = ctypes.c_int
    user32.DefWindowProcW.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_size_t, ctypes.c_ssize_t]
    user32.DefWindowProcW.restype = ctypes.c_ssize_t
    user32.CreateWindowExW.argtypes = [
        ctypes.c_uint32, ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_uint32,
        ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
        ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p,
    ]
    user32.CreateWindowExW.restype = ctypes.c_void_p
    user32.DestroyWindow.argtypes = [ctypes.c_void_p]
    user32.DestroyWindow.restype = ctypes.c_bool
    user32.SetLayeredWindowAttributes.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_byte, ctypes.c_uint32]
    user32.SetLayeredWindowAttributes.restype = ctypes.c_bool
    user32.SetWindowPos.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_uint]
    user32.SetWindowPos.restype = ctypes.c_bool
    user32.ShowWindow.argtypes = [ctypes.c_void_p, ctypes.c_int]
    user32.ShowWindow.restype = ctypes.c_bool
    user32.RegisterClassW.argtypes = [ctypes.c_void_p]
    user32.RegisterClassW.restype = ctypes.c_uint16
    user32.PeekMessageW.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint]
    user32.PeekMessageW.restype = ctypes.c_bool
    user32.TranslateMessage.argtypes = [ctypes.c_void_p]
    user32.TranslateMessage.restype = ctypes.c_bool
    user32.DispatchMessageW.argtypes = [ctypes.c_void_p]
    user32.DispatchMessageW.restype = ctypes.c_ssize_t
    user32.MsgWaitForMultipleObjects.argtypes = [ctypes.c_uint32, ctypes.c_void_p, ctypes.c_bool, ctypes.c_uint32, ctypes.c_uint32]
    user32.MsgWaitForMultipleObjects.restype = ctypes.c_uint32
    hookproc = ctypes.WINFUNCTYPE(ctypes.c_ssize_t, ctypes.c_int, ctypes.c_size_t, ctypes.c_ssize_t)
    user32.SetWindowsHookExW.argtypes = [ctypes.c_int, hookproc, ctypes.c_void_p, ctypes.c_uint32]
    user32.SetWindowsHookExW.restype = ctypes.c_void_p
    user32.CallNextHookEx.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_size_t, ctypes.c_ssize_t]
    user32.CallNextHookEx.restype = ctypes.c_ssize_t
    user32.UnhookWindowsHookEx.argtypes = [ctypes.c_void_p]
    user32.UnhookWindowsHookEx.restype = ctypes.c_bool
    user32._hookproc = hookproc
    user32._enum = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_ssize_t)
    user32._wndproc = ctypes.WINFUNCTYPE(ctypes.c_ssize_t, ctypes.c_void_p, ctypes.c_uint, ctypes.c_size_t, ctypes.c_ssize_t)
    user32.EnumWindows.argtypes = [user32._enum, ctypes.c_ssize_t]
    kernel32.OpenProcess.argtypes = [ctypes.c_uint32, ctypes.c_bool, ctypes.c_uint32]
    kernel32.OpenProcess.restype = ctypes.c_void_p
    kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
    kernel32.CloseHandle.restype = ctypes.c_bool
    kernel32.QueryFullProcessImageNameW.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_wchar_p, ctypes.POINTER(ctypes.c_uint32)]
    kernel32.QueryFullProcessImageNameW.restype = ctypes.c_bool
    kernel32.GetModuleHandleW.argtypes = [ctypes.c_wchar_p]
    kernel32.GetModuleHandleW.restype = ctypes.c_void_p
    dwm.DwmGetWindowAttribute.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_uint32]
    dwm.DwmGetWindowAttribute.restype = ctypes.c_long
    ole32.OleInitialize.argtypes = [ctypes.c_void_p]
    ole32.OleInitialize.restype = ctypes.c_long
    shell32.ILCreateFromPathW.argtypes = [ctypes.c_wchar_p]
    shell32.ILCreateFromPathW.restype = ctypes.c_void_p
    shell32.ILClone.argtypes = [ctypes.c_void_p]
    shell32.ILClone.restype = ctypes.c_void_p
    shell32.ILRemoveLastID.argtypes = [ctypes.c_void_p]
    shell32.ILRemoveLastID.restype = ctypes.c_bool
    shell32.ILFindLastID.argtypes = [ctypes.c_void_p]
    shell32.ILFindLastID.restype = ctypes.c_void_p
    shell32.ILFree.argtypes = [ctypes.c_void_p]
    shell32.ILFree.restype = None
    shell32.SHCreateDataObject.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.POINTER(ctypes.c_void_p), ctypes.c_void_p, ctypes.POINTER(_GUID), ctypes.POINTER(ctypes.c_void_p)]
    shell32.SHCreateDataObject.restype = ctypes.c_long
    shell32.SHDoDragDrop.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint32, ctypes.POINTER(ctypes.c_uint32)]
    shell32.SHDoDragDrop.restype = ctypes.c_long
    try:
        user32.SetThreadDpiAwarenessContext(ctypes.c_void_p(-4))
    except Exception:
        pass
    return user32, kernel32, shell32, ole32, dwm


def _button_down(user32):
    try:
        return bool(user32.GetAsyncKeyState(0x01) & 0x8000)
    except Exception:
        return False


def _say(kind, msg=""):
    sys.stdout.write(kind if not msg else (kind + "\t" + msg))
    sys.stdout.write("\n")
    sys.stdout.flush()


def _log(text):
    sys.stderr.write(text + "\n")
    sys.stderr.flush()


class _MSLL(ctypes.Structure):
    _fields_ = [
        ("x", ctypes.c_long),
        ("y", ctypes.c_long),
        ("mouseData", ctypes.c_uint32),
        ("flags", ctypes.c_uint32),
        ("time", ctypes.c_uint32),
        ("extra", ctypes.c_size_t),
    ]


def _hook_thread(user32):
    def _proc(nCode, wParam, lParam):
        if nCode >= 0 and int(wParam) == 0x0202:
            if _ARM_AT and time.monotonic() >= _ARM_AT:
                _RELEASED.set()
                _UP.set()
        return user32.CallNextHookEx(_HOOK["handle"], nCode, wParam, lParam)

    proc = user32._hookproc(_proc)
    _HOOK["proc"] = proc
    handle = user32.SetWindowsHookExW(14, proc, None, 0)
    _HOOK["handle"] = handle
    _HOOK["ready"] = True
    if not handle:
        _HOOK["err"] = ctypes.get_last_error()
        return
    msg = _MSG()
    while not _STOP.is_set():
        user32.MsgWaitForMultipleObjects(0, None, False, 30, 0x04FF)
        while user32.PeekMessageW(ctypes.addressof(msg), None, 0, 0, 1):
            user32.TranslateMessage(ctypes.addressof(msg))
            user32.DispatchMessageW(ctypes.addressof(msg))
    if handle:
        user32.UnhookWindowsHookEx(handle)
        _HOOK["handle"] = None


def _watch():
    if not _UP.wait(180):
        os._exit(4)
    if _DONE.wait(2.0):
        return
    os._exit(3)


def _pump(user32, stop, tid):
    user32.PostThreadMessageW.argtypes = [ctypes.c_uint32, ctypes.c_uint, ctypes.c_size_t, ctypes.c_ssize_t]
    user32.PostThreadMessageW.restype = ctypes.c_bool
    msg = _MSG()
    user32.PeekMessageW(ctypes.addressof(msg), None, 0, 0, 0)
    while not stop.is_set():
        try:
            down = _button_down(user32) and not _RELEASED.is_set()
            if not down and _ARM_AT and time.monotonic() < _ARM_AT:
                down = True
            _BTN[0] = down
            pt = _POINT()
            if user32.GetCursorPos(ctypes.addressof(pt)):
                lp = ((int(pt.y) & 0xFFFF) << 16) | (int(pt.x) & 0xFFFF)
                user32.PostThreadMessageW(int(tid), 0x0200 if down else 0x0202, 1 if down else 0, lp)
        except Exception:
            pass
        if stop.wait(0.02):
            break


def _pid(user32, hwnd):
    pid = ctypes.c_uint32()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    return int(pid.value or 0)


def _class(user32, hwnd):
    buf = ctypes.create_unicode_buffer(256)
    user32.GetClassNameW(hwnd, buf, 256)
    return buf.value or ""


def _exe(kernel32, user32, hwnd):
    pid = _pid(user32, hwnd)
    if not pid:
        return ""
    handle = kernel32.OpenProcess(0x1000, False, pid)
    if not handle:
        return ""
    try:
        size = ctypes.c_uint32(1024)
        buf = ctypes.create_unicode_buffer(1024)
        if not kernel32.QueryFullProcessImageNameW(handle, 0, buf, ctypes.byref(size)):
            return ""
        return os.path.basename(buf.value or "").lower()
    finally:
        kernel32.CloseHandle(handle)


def _is_browser(user32, kernel32, hwnd):
    exe = _exe(kernel32, user32, hwnd)
    if exe in _BROWSERS:
        return True
    if exe:
        return False
    return _class(user32, hwnd).startswith("Chrome_WidgetWin_")


def _ensure_class(user32, kernel32):
    if getattr(user32, "_cover_ready", False):
        return True

    def _wnd(hwnd, msg, wparam, lparam):
        return user32.DefWindowProcW(hwnd, msg, wparam, lparam)

    proc = user32._wndproc(_wnd)
    user32._cover_proc = proc

    class _WNDCLASSW(ctypes.Structure):
        _fields_ = [
            ("style", ctypes.c_uint),
            ("lpfnWndProc", user32._wndproc),
            ("cbClsExtra", ctypes.c_int),
            ("cbWndExtra", ctypes.c_int),
            ("hInstance", ctypes.c_void_p),
            ("hIcon", ctypes.c_void_p),
            ("hCursor", ctypes.c_void_p),
            ("hbrBackground", ctypes.c_void_p),
            ("lpszMenuName", ctypes.c_wchar_p),
            ("lpszClassName", ctypes.c_wchar_p),
        ]

    wc = _WNDCLASSW()
    wc.lpfnWndProc = proc
    wc.hInstance = kernel32.GetModuleHandleW(None)
    wc.lpszClassName = "opv-drag-cover"
    user32._cover_wc = wc
    atom = user32.RegisterClassW(ctypes.byref(wc))
    if not atom and ctypes.get_last_error() != 1410:
        return False
    user32._cover_ready = True
    return True


def _drop_covers(user32):
    for hwnd in list(_COVERS):
        if hwnd and user32.IsWindow(hwnd):
            user32.DestroyWindow(hwnd)
    _COVERS[:] = []
    _PAD["hwnd"] = None


def _pad_follow():
    """只在鼠标还在浏览器上时，挡在浏览器前面那一层。别的窗口比它高，才能接住文件。"""
    user32 = _PAD.get("user32")
    hwnd = _PAD.get("hwnd")
    if not user32 or not hwnd:
        return
    try:
        pt = _POINT()
        if not user32.GetCursorPos(ctypes.addressof(pt)):
            return
        x, y = int(pt.x), int(pt.y)
        target = None
        for bh, left, top, right, bottom in _BROWSER_RECTS:
            if left <= x < right and top <= y < bottom and user32.IsWindow(bh):
                target = bh
                break
        if target is None:
            user32.ShowWindow(hwnd, 0)
            return
        user32.SetWindowPos(hwnd, target, x - 16, y - 16, 32, 32, 0x0010 | 0x0040)
    except Exception:
        pass


def _raise_covers(user32, kernel32, dwm):
    """记下浏览器的位置，做一块小挡板。不再铺满屏幕，不然别的软件接不到文件。"""
    _BROWSER_RECTS[:] = []
    _PIDS.clear()
    _PAD["user32"] = user32
    if not _ensure_class(user32, kernel32):
        _log("[opv-drag] covers=0")
        return []

    @user32._enum
    def _visit(hwnd, _lp):
        if not user32.IsWindowVisible(hwnd) or user32.IsIconic(hwnd):
            return True
        cloaked = ctypes.c_int(0)
        dwm.DwmGetWindowAttribute(hwnd, 14, ctypes.byref(cloaked), 4)
        if cloaked.value:
            return True
        if not _is_browser(user32, kernel32, hwnd):
            return True
        rc = _RECT()
        if not user32.GetWindowRect(hwnd, ctypes.byref(rc)):
            return True
        width = int(rc.right - rc.left)
        height = int(rc.bottom - rc.top)
        if width <= 0 or height <= 0:
            return True
        _BROWSER_RECTS.append((hwnd, int(rc.left), int(rc.top), int(rc.right), int(rc.bottom)))
        pid = _pid(user32, hwnd)
        if pid:
            _PIDS.add(pid)
        return True

    user32._enum_cb = _visit
    user32.EnumWindows(_visit, 0)
    pt = _POINT()
    user32.GetCursorPos(ctypes.addressof(pt))
    pad = user32.CreateWindowExW(
        0x00080000 | 0x00000080 | 0x08000000,
        "opv-drag-cover",
        "opv-drag-cover",
        0x80000000,
        int(pt.x) - 16, int(pt.y) - 16, 32, 32,
        None, None, kernel32.GetModuleHandleW(None), None,
    )
    if pad:
        user32.SetLayeredWindowAttributes(pad, 0, 1, 0x02)
        _PAD["hwnd"] = pad
        _COVERS.append(pad)
        _pad_follow()
    _log("[opv-drag] covers=%s" % len(_BROWSER_RECTS))
    return _COVERS


def _data_object(shell32, path):
    full = shell32.ILCreateFromPathW(os.path.abspath(path))
    if not full:
        raise OSError("找不到这个文件的外壳路径")
    parent = shell32.ILClone(full)
    child = shell32.ILFindLastID(full) if parent else None
    if not parent or not child or not shell32.ILRemoveLastID(parent):
        if parent:
            shell32.ILFree(parent)
        shell32.ILFree(full)
        raise OSError("找不到这个文件的外壳路径")
    arr = (ctypes.c_void_p * 1)(child)
    iid = _guid("0000010e-0000-0000-C000-000000000046")
    out = ctypes.c_void_p()
    hr = shell32.SHCreateDataObject(parent, 1, arr, None, ctypes.byref(iid), ctypes.byref(out))
    if hr != 0 or not out.value:
        shell32.ILFree(parent)
        shell32.ILFree(full)
        raise OSError("无法把图片交给拖拽")
    return out, (full, parent)


def _guid_bytes(g):
    return ctypes.string_at(ctypes.addressof(g), ctypes.sizeof(g))


def _drop_source():
    qi_t = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, ctypes.POINTER(_GUID), ctypes.POINTER(ctypes.c_void_p))
    ref_t = ctypes.WINFUNCTYPE(ctypes.c_ulong, ctypes.c_void_p)
    cont_t = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, ctypes.c_int, ctypes.c_uint32)
    feed_t = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, ctypes.c_uint32)

    class VTable(ctypes.Structure):
        _fields_ = [("qi", qi_t), ("add", ref_t), ("rel", ref_t), ("cont", cont_t), ("feed", feed_t)]

    class Obj(ctypes.Structure):
        _fields_ = [("vtbl", ctypes.POINTER(VTable))]

    unk = _guid_bytes(_guid("00000000-0000-0000-C000-000000000046"))
    src = _guid_bytes(_guid("00000121-0000-0000-C000-000000000046"))
    state = {"ref": 1}

    def qi(this, riid, ppv):
        try:
            got = ctypes.string_at(ctypes.addressof(riid.contents), ctypes.sizeof(_GUID))
        except Exception:
            ppv[0] = None
            return -2147467262
        if got == unk or got == src:
            ppv[0] = this
            state["ref"] += 1
            return 0
        ppv[0] = None
        return -2147467262

    def add(this):
        state["ref"] += 1
        return state["ref"]

    def rel(this):
        state["ref"] = max(0, state["ref"] - 1)
        return state["ref"]

    def cont(this, escape, keys):
        if escape:
            return 0x00040101
        if _RELEASED.is_set() or not _BTN[0]:
            return 0x00040100
        return 0

    def feed(this, effect):
        return 0x00040102

    vtbl = VTable(qi_t(qi), ref_t(add), ref_t(rel), cont_t(cont), feed_t(feed))
    obj = Obj(ctypes.pointer(vtbl))
    return {"obj": obj, "vtbl": vtbl, "cbs": (qi, add, rel, cont, feed)}


def _release(ptr):
    if not ptr:
        return
    obj = ctypes.cast(ptr, ctypes.POINTER(ctypes.c_void_p))
    vtbl = ctypes.cast(obj[0], ctypes.POINTER(ctypes.c_void_p))
    release = ctypes.WINFUNCTYPE(ctypes.c_ulong, ctypes.c_void_p)(vtbl[2])
    release(ptr)


def _check_hook():
    user32, _k, _s, _o, _d = _bind()
    th = threading.Thread(target=_hook_thread, args=(user32,), name="opv-hook")
    th.start()
    ok = False
    for _i in range(50):
        if _HOOK.get("ready"):
            ok = bool(_HOOK.get("handle")) and th.is_alive()
            break
        if not th.is_alive():
            break
        threading.Event().wait(0.02)
    if ok:
        threading.Event().wait(0.3)
        ok = th.is_alive() and bool(_HOOK.get("handle"))
    _STOP.set()
    th.join(timeout=1.0)
    if not ok:
        _say("ERR", "鼠标钩子没有装上")
        return 1
    _say("OK")
    return 0


def drag(path):
    user32, kernel32, shell32, ole32, dwm = _bind()
    if not _button_down(user32):
        _say("QUIET")
        return 2
    if not path or not os.path.isfile(path):
        _say("ERR", "文件不存在")
        return 1
    hook = threading.Thread(target=_hook_thread, args=(user32,), name="opv-hook")
    hook.start()
    watch = threading.Thread(target=_watch, name="opv-watch")
    watch.daemon = True
    watch.start()
    data = None
    pidls = ()
    hold = None
    stop_pump = threading.Event()
    pump = None
    try:
        hr = int(ole32.OleInitialize(None))
        if hr < 0 and (hr & 0xFFFFFFFF) != 0x00000001:
            _say("ERR", "拖出失败")
            return 1
        if not _button_down(user32):
            _say("QUIET")
            return 2
        data, pidls = _data_object(shell32, path)
        hold = _drop_source()
        kernel32.GetCurrentThreadId.argtypes = []
        kernel32.GetCurrentThreadId.restype = ctypes.c_uint32
        _BTN[0] = True
        _RELEASED.clear()
        _UP.clear()
        global _ARM_AT
        _ARM_AT = time.monotonic() + 0.4
        pump = threading.Thread(target=_pump, args=(user32, stop_pump, kernel32.GetCurrentThreadId()), name="opv-pump", daemon=True)
        pump.start()
        effect = ctypes.c_uint32(0)
        dhr = int(shell32.SHDoDragDrop(None, data, ctypes.addressof(hold["obj"]), 1, ctypes.byref(effect)))
        _DONE.set()
        code = dhr & 0xFFFFFFFF
        end_pt = _POINT()
        drop_cls = ""
        if user32.GetCursorPos(ctypes.addressof(end_pt)):
            hit = user32.WindowFromPoint(_POINT(int(end_pt.x), int(end_pt.y)))
            drop_cls = _class(user32, hit) if hit else ""
        _log("[opv-drag] hr=%08X effect=%s drop=%s" % (code, int(effect.value), drop_cls))
        if dhr < 0:
            _say("ERR", "拖出失败")
            return 1
        if code == 0x00040101:
            _say("QUIET")
            return 2
        if int(effect.value) == 0:
            _say("ERR", "松开时鼠标下面的窗口没有接住图片")
            return 1
        _say("OK")
        return 0
    except Exception:
        _DONE.set()
        _say("ERR", "拖出失败")
        return 1
    finally:
        _DONE.set()
        _STOP.set()
        stop_pump.set()
        if pump is not None:
            pump.join(timeout=1.0)
        if data:
            try:
                _release(data)
            except Exception:
                pass
        for one in pidls:
            try:
                shell32.ILFree(one)
            except Exception:
                pass
        hook.join(timeout=1.0)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--check":
        raise SystemExit(_check_hook())
    target = sys.argv[1] if len(sys.argv) > 1 else ""
    raise SystemExit(drag(target))
