import { app as animaApp } from "/scripts/app.js";

window.animaDsModelId = function (m) {
    m = (m == null || m === "") ? "" : String(m);
    if (!m) {
        try {
            m = localStorage.getItem("db_trans_ds_model") || localStorage.getItem("db_ds_model") || "";
        } catch (e) {
            m = "";
        }
    }
    if (!m || m === "flash") return "deepseek-flash";
    if (m === "pro") return "deepseek-v4-pro";
    if (m === "vision") return "deepseek-flash";
    return m;
};

// 每次翻译都重新读顶栏设置。节点里旧的闭包会把「免费/百度」和 Key 读错。
window.animaResolveTranslator = function () {
    function ls(k) {
        try { return localStorage.getItem(k) || ""; } catch (e) { return ""; }
    }
    var tp = ls("db_trans_provider") || "free";
    var fm = ls("db_trans_free_mode") || ls("db_free_mode") || "baidu";
    var provider = tp;
    var apiKey = "";
    var model = "";
    var baseUrl = "";
    var baiduAppid = "";
    if (tp === "deepseek") {
        provider = "deepseek";
        apiKey = ls("db_trans_key_ds");
        model = window.animaDsModelId(ls("db_trans_ds_model") || ls("db_ds_model") || "flash");
        baseUrl = "https://api.deepseek.com/v1";
    } else if (tp === "custom") {
        provider = "custom";
        apiKey = ls("db_trans_key_cu") || ls("db_trans_api_key");
        baseUrl = ls("db_trans_base_url_cu") || ls("db_trans_base_url");
        model = ls("db_trans_model_cu") || ls("db_trans_model");
    } else if (tp === "siliconflow") {
        provider = "siliconflow";
        apiKey = ls("db_trans_key_sf");
        baseUrl = "https://api.siliconflow.cn/v1";
        model = ls("db_trans_model_sf");
    } else {
        if (tp === "google") fm = "google";
        else if (tp === "baidu" || tp === "baidu_llm") fm = "baidu";
        else if (tp === "microsoft") fm = "microsoft";
        provider = fm || "baidu";
        if (provider === "baidu") {
            var nmtKey = ls("db_trans_key_bd");
            if (ls("db_trans_baidu_mode") === "llm") {
                provider = "baidu_llm";
                var bearer = ls("db_trans_key_bd_llm");
                if (!bearer && nmtKey && nmtKey.indexOf(":") < 0) bearer = nmtKey;
                if (bearer) {
                    apiKey = bearer;
                    baiduAppid = ls("db_trans_baidu_appid");
                    if (!baiduAppid && nmtKey.indexOf(":") >= 0) baiduAppid = nmtKey.split(":")[0];
                } else if (nmtKey.indexOf(":") >= 0) {
                    apiKey = nmtKey;
                }
            } else {
                apiKey = nmtKey;
            }
        } else if (provider === "microsoft") {
            apiKey = ls("db_trans_key_ms");
        } else {
            provider = "google";
            apiKey = "";
        }
    }
    return { provider: provider, apiKey: apiKey, model: model, baseUrl: baseUrl, freeMode: fm, rawProvider: tp, baiduAppid: baiduAppid };
};

window.animaTranslateFields = function () {
    var cfg = window.animaResolveTranslator();
    return {
        cfg: cfg,
        provider: cfg.provider,
        api_key: cfg.apiKey || "",
        model: cfg.model || "",
        base_url: cfg.baseUrl || "",
        baidu_appid: cfg.baiduAppid || ""
    };
};

window.animaTransConfigError = function (cfg) {
    if (!cfg) return "请先在顶栏 Anima 图标弹窗中设置翻译";
    var p = cfg.provider;
    if (p === "baidu") {
        if (!cfg.apiKey || cfg.apiKey.indexOf(":") < 0) return "请先在顶栏 Anima 图标弹窗中设置翻译（百度 Key 格式为 appid:密钥）";
    } else if (p === "baidu_llm") {
        if (cfg.apiKey && cfg.apiKey.indexOf(":") >= 0) return "";
        if (!cfg.apiKey) return "请先在总设置里填写百度大模型 API Key";
        if (!cfg.baiduAppid) return "请先在总设置里填写百度 APP ID。大模型翻译要 APP ID 和 API Key，不是通用翻译的 appid:密钥";
    } else if (p === "deepseek" || p === "siliconflow" || p === "microsoft") {
        if (!cfg.apiKey) return "请先在顶栏 Anima 图标弹窗中设置翻译";
    } else if (p === "custom") {
        if (!cfg.apiKey || !cfg.baseUrl) return "请先在顶栏 Anima 图标弹窗中设置翻译";
        if (!cfg.model) return "请先在总设置里点「获取模型」，再选一个模型";
    }
    return "";
};

window.animaPickTranslation = function (map, tag, apiTag) {
    if (!map) return "";
    function variants(s) {
        if (!s) return [];
        var raw = String(s);
        var clean = raw.replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\\[/g, "[").replace(/\\\]/g, "]");
        return [raw, clean, raw.replace(/ /g, "_"), clean.replace(/ /g, "_"), raw.replace(/_/g, " "), clean.replace(/_/g, " ")];
    }
    var cands = variants(apiTag).concat(variants(tag));
    var i;
    for (i = 0; i < cands.length; i++) {
        if (cands[i] && map[cands[i]]) return map[cands[i]];
    }
    var lower = {};
    for (var k in map) {
        if (Object.prototype.hasOwnProperty.call(map, k) && map[k]) lower[String(k).toLowerCase()] = map[k];
    }
    for (i = 0; i < cands.length; i++) {
        var lk = cands[i] ? String(cands[i]).toLowerCase() : "";
        if (lk && lower[lk]) return lower[lk];
    }
    return "";
};

// 分批请求。一整包标签一次打出去时，百度频率限制或模型长度会把后半段丢掉。
window.animaCloudTranslate = async function (tags, extra) {
    extra = extra || {};
    var cfg = extra.cfg || window.animaResolveTranslator();
    var list = tags || [];
    var out = {};
    if (!list.length) return out;
    var llm = cfg.provider === "deepseek" || cfg.provider === "custom" || cfg.provider === "siliconflow";
    var size = llm ? 24 : 40;
    for (var i = 0; i < list.length; i += size) {
        var part = list.slice(i, i + size);
        await (async function (batch) {
            var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
            var tid = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 90000) : 0;
            try {
                var payload = {
                    tags: batch,
                    provider: cfg.provider,
                    api_key: cfg.apiKey || "",
                    model: cfg.model || "",
                    base_url: cfg.baseUrl || ""
                };
                if (cfg.baiduAppid) payload.baidu_appid = cfg.baiduAppid;
                if (extra.from_lang) payload.from_lang = extra.from_lang;
                if (extra.to_lang) payload.to_lang = extra.to_lang;
                if (extra.as_sentence) payload.as_sentence = true;
                var opt = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
                if (ctrl) opt.signal = ctrl.signal;
                var r = await fetch("/danbooru_anima/cloud_translate", opt);
                var d = await r.json();
                if (d && d.success && d.translations) {
                    for (var k in d.translations) {
                        if (Object.prototype.hasOwnProperty.call(d.translations, k) && d.translations[k]) out[k] = d.translations[k];
                    }
                }
            } catch (e) {
                console.error("[Anima] 翻译分批失败", e);
            } finally {
                if (tid) clearTimeout(tid);
            }
        })(part);
    }
    return out;
};


(function () {
    if (window.__animaChipEntryCss) return;
    window.__animaChipEntryCss = true;
    var st = document.getElementById("anima-chip-entry-css");
    if (!st) {
        st = document.createElement("style");
        st.id = "anima-chip-entry-css";
        (document.head || document.documentElement).appendChild(st);
    }
    st.textContent =
        ".anima-chip-entry.is-on{display:flex!important;flex:0 0 auto!important;width:100%!important;min-height:40px!important;box-sizing:border-box!important;align-items:center!important;gap:6px!important;padding:4px 6px!important;}" +
        ".anima-chip-entry.is-on>.anima-chip-entry-input{display:block!important;flex:1 1 0%!important;width:auto!important;min-width:80px!important;height:32px!important;min-height:32px!important;max-height:32px!important;visibility:visible!important;opacity:1!important;position:static!important;margin:0!important;}" +
        ".anima-chip-entry.is-on>.anima-chip-entry-btn{display:inline-flex!important;flex:0 0 auto!important;align-items:center!important;visibility:visible!important;position:static!important;}";
})();

(function () {
    if (window.__animaPointerUnlockV5) return;
    window.__animaPointerUnlockV5 = true;
    var st = document.getElementById("anima-pointer-unlock-css");
    if (!st) {
        st = document.createElement("style");
        st.id = "anima-pointer-unlock-css";
        (document.head || document.documentElement).appendChild(st);
    }
    st.textContent =
        ".danbooru-anima-browser img,.gel-browser-root img,.animadex-browser img,.tile img,#lightbox-img,#peek-img{-webkit-user-drag:none!important;user-select:none;}" +
        ".sortable-fallback{pointer-events:none!important;}" +
        "html.anima-ptr-down .danbooru-anima-browser .db-img-card," +
        "html.anima-ptr-down .gel-browser-root .gel-img-card," +
        "html.anima-ptr-down .tile:hover img{transform:none!important;}";

    var _ptr = { id: null, el: null, downAt: 0, movedAt: 0 };

    function toast(msg) {
        try {
            var old = document.getElementById("anima-pointer-unlock-toast");
            if (old) old.remove();
            var t = document.createElement("div");
            t.id = "anima-pointer-unlock-toast";
            t.textContent = msg;
            t.style.cssText = "position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:8px 16px;border-radius:8px;background:rgba(20,24,32,.94);color:#e8eef8;font-size:13px;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,.45);";
            document.body.appendChild(t);
            setTimeout(function () { try { t.remove(); } catch (e) {} }, 1800);
        } catch (e) {}
    }

    function isCanvasStuck() {
        try {
            var c = window.app && window.app.canvas;
            if (!c) return false;
            if (c.pointer && (c.pointer.isDown || c.pointer.dragStarted)) return true;
            if (c.pointer_is_down || c.dragging_canvas) return true;
            if (c.state && (c.state.draggingCanvas || c.state.draggingItems)) return true;
            if (c.canvas && c.pointer && typeof c.pointer.pointerId === "number" && c.canvas.hasPointerCapture && c.canvas.hasPointerCapture(c.pointer.pointerId)) return true;
            return false;
        } catch (e) { return false; }
    }

    function releaseCapturedPointer() {
        var id = _ptr.id;
        var nodes = [];
        var n = _ptr.el;
        while (n && n.nodeType === 1) {
            nodes.push(n);
            n = n.parentElement;
        }
        try {
            var extra = document.querySelectorAll("#artist-pop-hd,#artist-pop-rs,#inspect-resizer,.cmp-frame");
            for (var i = 0; i < extra.length; i++) nodes.push(extra[i]);
        } catch (e0) {}
        for (var j = 0; j < nodes.length; j++) {
            try {
                if (typeof id === "number" && nodes[j].hasPointerCapture && nodes[j].hasPointerCapture(id)) {
                    nodes[j].releasePointerCapture(id);
                }
            } catch (e1) {}
        }
    }

    function resetCanvasPointer() {
        try {
            var c = window.app && window.app.canvas;
            if (c) {
                var pid = c.pointer && c.pointer.pointerId;
                if (c.pointer && typeof c.pointer.reset === "function") {
                    try { c.pointer.reset(); } catch (e1) {}
                }
                if (c.canvas && typeof pid === "number" && c.canvas.hasPointerCapture && c.canvas.hasPointerCapture(pid)) {
                    try { c.canvas.releasePointerCapture(pid); } catch (e1b) {}
                }
                try { c.pointer_is_down = false; } catch (e2) {}
                try { c.dragging_canvas = false; } catch (e3) {}
                if (c.state) {
                    try { c.state.draggingCanvas = false; } catch (e4) {}
                    try { c.state.draggingItems = false; } catch (e5) {}
                }
                if (c.canvas) {
                    try { c.canvas.style.cursor = ""; } catch (e6) {}
                }
            }
        } catch (e) {}
        try {
            var bc = document.body && document.body.style && document.body.style.cursor;
            if (bc === "grab" || bc === "grabbing" || bc === "move" || bc === "pointer") document.body.style.cursor = "";
            var hc = document.documentElement && document.documentElement.style && document.documentElement.style.cursor;
            if (hc === "grab" || hc === "grabbing" || hc === "move" || hc === "pointer") document.documentElement.style.cursor = "";
        } catch (e7) {}
        try {
            document.querySelectorAll(".sortable-fallback").forEach(function (el) { el.remove(); });
        } catch (e8) {}
    }

    function clearPtrUi() {
        releaseCapturedPointer();
        window.__animaGalleryPtrDown = 0;
        _ptr.id = null;
        _ptr.el = null;
        _ptr.downAt = 0;
        _ptr.movedAt = 0;
        try { document.documentElement.classList.remove("anima-ptr-down"); } catch (e0) {}
        try { document.body.classList.remove("is-resizing-artist", "is-resizing-inspect"); } catch (e1) {}
        try {
            document.querySelectorAll(".artist-pop-box.is-dragging").forEach(function (el) {
                el.classList.remove("is-dragging");
            });
        } catch (e2) {}
    }

    function exitPanMode() {
        try {
            var c = window.app && window.app.canvas;
            if (!c) return;
            try { c.read_only = false; } catch (e1) {}
            try { if (c.state) c.state.readOnly = false; } catch (e2) {}
            try { if (typeof c._updateCursorStyle === "function") c._updateCursorStyle(); } catch (e3) {}
            try {
                if (c.canvas && typeof c.canvas.dispatchEvent === "function") {
                    c.canvas.dispatchEvent(new CustomEvent("litegraph:read-only-changed", { detail: { readOnly: false } }));
                }
            } catch (e4) {}
        } catch (e) {}
    }

    function punchThroughMasks() {
        try {
            document.querySelectorAll(".anima-full-mask").forEach(function (el) {
                el.style.display = "none";
                el.style.pointerEvents = "none";
                el.style.opacity = "0";
                el.setAttribute("data-anima-open", "0");
            });
        } catch (e0) {}
        try {
            var kids = document.body ? document.body.children : [];
            for (var i = 0; i < kids.length; i++) {
                var el = kids[i];
                if (!el || el.nodeType !== 1) continue;
                var id = el.id || "";
                var cn = (typeof el.className === "string") ? el.className : "";
                if (/vue-app|graph-canvas|comfyui-body|litegraph|p-dialog/i.test(id + " " + cn)) continue;
                var s = window.getComputedStyle(el);
                if (s.position !== "fixed") continue;
                var r = el.getBoundingClientRect();
                if (r.width < window.innerWidth * 0.8 || r.height < window.innerHeight * 0.8) continue;
                var z = parseInt(s.zIndex, 10);
                var ours = cn.indexOf("anima-full-mask") >= 0 || cn.indexOf("db-fav-overlay") >= 0 || id === "anima-fav-backfill-mask";
                if (!ours && !(z >= 9000)) continue;
                el.style.pointerEvents = "none";
                for (var j = 0; j < el.children.length; j++) {
                    try { el.children[j].style.pointerEvents = "auto"; } catch (e1) {}
                }
            }
        } catch (e) {}
    }

    function hideStuckMasks() {
        try {
            document.querySelectorAll(".anima-full-mask").forEach(function (el) {
                if (el.getAttribute("data-anima-open") === "0") {
                    el.style.display = "none";
                    el.style.pointerEvents = "none";
                    return;
                }
                var cs = window.getComputedStyle(el);
                if (cs.display === "none") return;
                if (parseFloat(cs.opacity) === 0) {
                    el.style.display = "none";
                    el.style.pointerEvents = "none";
                    el.setAttribute("data-anima-open", "0");
                }
            });
        } catch (e) {}
    }

    function emergencyUnlock(notify) {
        var wasPan = false;
        try {
            var c0 = window.app && window.app.canvas;
            wasPan = !!(c0 && (c0.read_only || (c0.state && c0.state.readOnly)));
        } catch (e) {}
        exitPanMode();
        resetCanvasPointer();
        punchThroughMasks();
        clearPtrUi();
        if (notify || wasPan) toast("已解锁鼠标（退出抓手/平移）");
    }

    function onPointerIdle(e) {
        if (e && e.buttons) return;
        clearPtrUi();
        hideStuckMasks();
    }

    window.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        _ptr.id = e.pointerId;
        _ptr.el = e.target;
        _ptr.downAt = Date.now();
        _ptr.movedAt = _ptr.downAt;
        try { document.documentElement.classList.add("anima-ptr-down"); } catch (e1) {}
    }, true);
    window.addEventListener("gotpointercapture", function (e) {
        _ptr.id = e.pointerId;
        _ptr.el = e.target;
    }, true);
    window.addEventListener("pointerup", onPointerIdle, true);
    window.addEventListener("pointercancel", onPointerIdle, true);
    window.addEventListener("lostpointercapture", onPointerIdle, true);
    window.addEventListener("dragend", function () { onPointerIdle({ buttons: 0 }); }, true);
    window.addEventListener("pointermove", function (e) {
        _ptr.movedAt = Date.now();
        if (window.__animaGalleryPtrDown && _ptr.el && _ptr.el.nodeType === 1 && !_ptr.el.isConnected) {
            emergencyUnlock(false);
        }
    }, true);
    document.documentElement.addEventListener("mouseenter", function (e) {
        if (e.buttons) return;
        onPointerIdle(e);
    }, true);
    window.addEventListener("blur", function () {
        onPointerIdle({ buttons: 0 });
    });
    document.addEventListener("visibilitychange", function () {
        if (document.hidden) onPointerIdle({ buttons: 0 });
    });
    document.addEventListener("dragstart", function (e) {
        var t = e.target;
        if (!t || t.tagName !== "IMG") return;
        if (!t.closest) return;
        if (!(t.closest(".danbooru-anima-browser") || t.closest(".gel-browser-root") || t.closest(".animadex-browser") || t.closest("#grid") || t.closest("#gallery"))) return;
        if (t.closest(".db-fav-img") || t.closest(".gel-fav-card") || t.closest("[draggable='true']")) return;
        e.preventDefault();
    }, true);
    window.addEventListener("keydown", function (e) {
        var stuck = isCanvasStuck() || !!window.__animaGalleryPtrDown;
        var wantHardReload = e.ctrlKey && e.shiftKey && (e.key === "R" || e.key === "r" || e.code === "KeyR");
        if (wantHardReload && stuck) {
            try { e.preventDefault(); e.stopPropagation(); } catch (eR) {}
            punchThroughMasks();
            clearPtrUi();
            try { location.reload(); } catch (eL) {}
            return;
        }
        var isEsc = e.key === "Escape";
        var isHot = (e.key === "u" || e.key === "U") && e.ctrlKey && e.altKey && !e.shiftKey;
        if (!isEsc && !isHot) return;
        if (isHot) {
            try { e.preventDefault(); } catch (e0) {}
        }
        emergencyUnlock(!!isHot);
    }, true);
    window.animaUnlockPointer = function (force) {
        if (force) emergencyUnlock(true);
        else {
            resetCanvasPointer();
            hideStuckMasks();
            clearPtrUi();
        }
    };
    setInterval(function () {
        if (!window.__animaGalleryPtrDown) return;
        if (document.hidden) {
            emergencyUnlock(false);
            return;
        }
        if (_ptr.el && _ptr.el.nodeType === 1 && !_ptr.el.isConnected) {
            emergencyUnlock(false);
            return;
        }
        var now = Date.now();
        if (_ptr.downAt && _ptr.movedAt && (now - _ptr.movedAt) > 8000 && (now - _ptr.downAt) > 8000) {
            emergencyUnlock(false);
        }
    }, 1000);

    function registerCmd() {
        try {
            if (!window.app || typeof window.app.registerExtension !== "function") return;
            if (window.__animaUnlockCmdReg) return;
            window.__animaUnlockCmdReg = true;
            window.app.registerExtension({
                name: "Comfy.AnimaPointerUnlock",
                commands: [{
                    id: "Anima.UnlockPointer",
                    label: "解锁鼠标（退出抓手/平移）",
                    function: function () { emergencyUnlock(true); }
                }],
                keybindings: [{
                    combo: { key: "u", ctrl: true, alt: true },
                    commandId: "Anima.UnlockPointer"
                }]
            });
        } catch (e) {}
    }
    registerCmd();
    setTimeout(registerCmd, 0);
    setTimeout(registerCmd, 800);
})();

window.animaShieldDomWidget = function (el) {
    if (!el || el._animaPtrShield) return el;
    el._animaPtrShield = 1;
    var stop = function (e) {
        try { e.stopPropagation(); } catch (err) {}
        window.__animaGalleryPtrDown = 1;
    };
    el.addEventListener("pointerdown", stop, true);
    el.addEventListener("mousedown", stop, true);
    el.addEventListener("touchstart", stop, true);
    return el;
};

// ComfyUI 右侧信息栏会把带界面的节点当成普通控件来画：
// 写成 width = 信息栏宽度、y = 0。画布上的界面优先用这个 width，
// 所以先打开信息栏再点选节点时，界面会被压扁或拉长。
// 宽度交回节点本身；y 被写成 0 时还原成节点排好的位置。
(function () {
    if (window.__animaDomSizeShield) return;
    window.__animaDomSizeShield = 1;

    function shieldWidget(w) {
        if (!w || !w.element || w.__animaSizeShield) return;
        var y = w.y;
        var goodY = (typeof y === "number" && y !== 0) ? y : 0;
        try { delete w.width; } catch (e) {}
        try { delete w.y; } catch (e) {}
        Object.defineProperty(w, "width", {
            configurable: true,
            enumerable: true,
            get: function () { return undefined; },
            set: function () {}
        });
        Object.defineProperty(w, "y", {
            configurable: true,
            enumerable: true,
            get: function () { return y; },
            set: function (v) {
                if (v === 0 && goodY) {
                    y = goodY;
                    return;
                }
                y = v;
                if (typeof v === "number" && v !== 0) goodY = v;
            }
        });
        w.__animaSizeShield = 1;
    }

    function shieldGraph(graph) {
        var nodes = graph && graph._nodes;
        if (!nodes) return;
        for (var i = 0; i < nodes.length; i++) {
            var ws = nodes[i] && nodes[i].widgets;
            if (!ws) continue;
            for (var j = 0; j < ws.length; j++) shieldWidget(ws[j]);
        }
    }

    function hookAdd() {
        var proto = window.LGraphNode && window.LGraphNode.prototype;
        if (!proto || typeof proto.addDOMWidget !== "function" || proto.addDOMWidget.__animaSizeShield) return;
        var orig = proto.addDOMWidget;
        function wrapped() {
            var w = orig.apply(this, arguments);
            try { shieldWidget(w); } catch (e) {}
            return w;
        }
        wrapped.__animaSizeShield = 1;
        proto.addDOMWidget = wrapped;
    }

    function hookCanvas() {
        var canvas = window.app && window.app.canvas;
        if (!canvas || (canvas.onDrawForeground && canvas.onDrawForeground.__animaSizeShield)) return;
        var prev = canvas.onDrawForeground;
        function wrapped() {
            try { shieldGraph(this.graph || (window.app && window.app.graph)); } catch (e) {}
            if (typeof prev === "function") return prev.apply(this, arguments);
        }
        wrapped.__animaSizeShield = 1;
        canvas.onDrawForeground = wrapped;
    }

    function boot() {
        try { hookAdd(); } catch (e) {}
        try { hookCanvas(); } catch (e) {}
        try { shieldGraph(window.app && window.app.graph); } catch (e) {}
    }
    boot();
    setTimeout(boot, 0);
    setTimeout(boot, 400);
    setTimeout(boot, 1500);
})();

// anima themes
(function () {
    if (window.__animaThemeLoaded7) return;
    window.__animaThemeLoaded7 = true;
    var _oldModeSw = document.getElementById("anima-mode-sw-v1");
    if (_oldModeSw) _oldModeSw.remove();
    var _oldModeSw2 = document.getElementById("anima-mode-sw-v2");
    if (_oldModeSw2) _oldModeSw2.remove();
    var _oldModeSw3 = document.getElementById("anima-mode-sw-v3");
    if (_oldModeSw3) _oldModeSw3.remove();

    function _vars(c) {
        return {
            "--anima-bg": c.bg,
            "--anima-bg-rgb": c.bgRgb,
            "--anima-bg-deep": c.deep,
            "--anima-bg-deep-rgb": c.deepRgb,
            "--anima-well": c.well,
            "--anima-well-rgb": c.wellRgb,
            "--anima-well-lo": c.wellLo,
            "--anima-well-lo-rgb": c.wellLoRgb,
            "--anima-title": c.title,
            "--anima-title-rgb": c.titleRgb,
            "--anima-line": c.line,
            "--anima-line-rgb": c.lineRgb,
            "--anima-accent": c.accent,
            "--anima-accent-rgb": c.accentRgb,
            "--anima-accent-hi": c.accentHi,
            "--anima-accent-hi-rgb": c.accentHiRgb,
            "--anima-accent-mid": c.accentMid,
            "--anima-accent-mid-rgb": c.accentMidRgb,
            "--anima-accent-range": c.accentRange,
            "--anima-accent-range-rgb": c.accentRangeRgb,
            "--anima-accent-soft": c.accentSoft,
            "--anima-accent-soft-rgb": c.accentSoftRgb,
            "--anima-accent-ring": c.accentRing,
            "--anima-accent-ring-rgb": c.accentRingRgb,
            "--anima-accent-sky": c.accentSky,
            "--anima-sky-rgb": c.skyRgb,
            "--anima-input": c.input,
            "--anima-input-rgb": c.inputRgb,
            "--anima-well-deep": c.wellDeep,
            "--anima-well-deep-rgb": c.wellDeepRgb,
            "--anima-well-deepest-rgb": c.wellDeepestRgb,
            "--anima-ink": c.ink,
            "--anima-ink-rgb": c.inkRgb,
            "--anima-ink-strong": c.inkStrong,
            "--anima-ink-chip": c.inkChip,
            "--anima-ink-chip-rgb": c.inkChipRgb,
            "--anima-ink-io": c.inkIo,
            "--anima-ink-soft": c.inkSoft,
            "--anima-ink-mid": c.inkMid,
            "--anima-mute": c.mute,
            "--anima-mute-rgb": c.muteRgb,
            "--anima-mute-dim": c.muteDim,
            "--anima-placeholder": c.placeholder,
            "--anima-dot-off": c.dotOff,
            "--anima-io-off": c.ioOff,
            "--anima-glow-rgb": c.glowRgb,
            "--anima-glow-core-rgb": c.glowCoreRgb,
            "--anima-line-soft-rgb": c.lineSoftRgb,
            "--anima-line-bright-rgb": c.lineBrightRgb,
            "--anima-glow-bg": "radial-gradient(ellipse 80% 55% at 100% -8%,rgba(var(--anima-glow-core-rgb),.5) 0%,transparent 58%),linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)",
            "--anima-on-accent": c.onAccent || "#ffffff"
        };
    }

    window.ANIMA_THEMES = {
        cobalt: {
            id: "cobalt",
            name: "钴蓝",
            nodeBg: "#0b1428",
            nodeTitle: "#1a3d7a",
            accent: "#2e6ee5",
            accentSoft: "#8cb8ff",
            vars: _vars({
                bg: "#0b1428", bgRgb: "11,20,40",
                deep: "#08122c", deepRgb: "8,18,44",
                well: "#102044", wellRgb: "16,32,68",
                wellLo: "#0d1a38", wellLoRgb: "13,26,56",
                title: "#1a3d7a", titleRgb: "26,61,122",
                line: "#1e3a6e", lineRgb: "30,58,110",
                accent: "#2e6ee5", accentRgb: "46,110,229",
                accentHi: "#1565FF", accentHiRgb: "21,101,255",
                accentMid: "#3d7ae8", accentMidRgb: "61,122,232",
                accentRange: "#4d8cff", accentRangeRgb: "77,140,255",
                accentSoft: "#8cb8ff", accentSoftRgb: "140,184,255",
                accentRing: "#6a9cff", accentRingRgb: "106,156,255",
                accentSky: "#4da3ff", skyRgb: "77,163,255",
                input: "#0c1c44", inputRgb: "12,28,68",
                wellDeep: "#060e24", wellDeepRgb: "6,14,36",
                wellDeepestRgb: "4,12,36",
                ink: "#eef3fb", inkRgb: "238,243,251",
                inkStrong: "#f4f8ff",
                inkChip: "#e8eef8", inkChipRgb: "232,238,248",
                inkIo: "#c5d8ff",
                inkSoft: "#dce6f8",
                inkMid: "#b8d4ff",
                mute: "#c5d4f5", muteRgb: "197,212,245",
                muteDim: "#8a9bb8",
                placeholder: "#9db4e0",
                dotOff: "#3d5a8c",
                ioOff: "#8aa4d4",
                glowRgb: "80,140,255",
                glowCoreRgb: "30,95,232",
                lineSoftRgb: "210,225,255",
                lineBrightRgb: "180,210,255"
            })
        },
        sage: {
            id: "sage",
            name: "薄荷",
            nodeBg: "#121c18",
            nodeTitle: "#2d5a48",
            accent: "#6aa890",
            accentSoft: "#b7d4c6",
            vars: _vars({
                bg: "#121c18", bgRgb: "18,28,24",
                deep: "#0e1714", deepRgb: "14,23,20",
                well: "#1a2a24", wellRgb: "26,42,36",
                wellLo: "#16241f", wellLoRgb: "22,36,31",
                title: "#2d5a48", titleRgb: "45,90,72",
                line: "#3a5c4e", lineRgb: "58,92,78",
                accent: "#6aa890", accentRgb: "106,168,144",
                accentHi: "#73b098", accentHiRgb: "115,176,152",
                accentMid: "#7ab59f", accentMidRgb: "122,181,159",
                accentRange: "#8fc4b0", accentRangeRgb: "143,196,176",
                accentSoft: "#b7d4c6", accentSoftRgb: "183,212,198",
                accentRing: "#9ccbb8", accentRingRgb: "156,203,184",
                accentSky: "#8fc4b0", skyRgb: "143,196,176",
                input: "#182821", inputRgb: "24,40,33",
                wellDeep: "#0c1613", wellDeepRgb: "12,22,19",
                wellDeepestRgb: "8,16,14",
                ink: "#e8f0ec", inkRgb: "232,240,236",
                inkStrong: "#f2f7f5",
                inkChip: "#e2ebe7", inkChipRgb: "226,235,231",
                inkIo: "#c5ddd2",
                inkSoft: "#d5e4de",
                inkMid: "#c0d8cd",
                mute: "#b7c9c1", muteRgb: "183,201,193",
                muteDim: "#7a948a",
                placeholder: "#8eada0",
                dotOff: "#4a6b5e",
                ioOff: "#8eada0",
                glowRgb: "106,168,144",
                glowCoreRgb: "90,148,126",
                lineSoftRgb: "210,226,218",
                lineBrightRgb: "190,214,204"
            })
        },
        ink: {
            id: "ink",
            name: "黑色",
            nodeBg: "#111214",
            nodeTitle: "#2a2d33",
            accent: "#6b7280",
            accentSoft: "#c5cad3",
            vars: _vars({
                bg: "#111214", bgRgb: "17,18,20",
                deep: "#0c0d0f", deepRgb: "12,13,15",
                well: "#1a1c20", wellRgb: "26,28,32",
                wellLo: "#15171a", wellLoRgb: "21,23,26",
                title: "#2a2d33", titleRgb: "42,45,51",
                line: "#3d4148", lineRgb: "61,65,72",
                accent: "#6b7280", accentRgb: "107,114,128",
                accentHi: "#7a8290", accentHiRgb: "122,130,144",
                accentMid: "#818996", accentMidRgb: "129,137,150",
                accentRange: "#9aa1ad", accentRangeRgb: "154,161,173",
                accentSoft: "#c5cad3", accentSoftRgb: "197,202,211",
                accentRing: "#a8aeb8", accentRingRgb: "168,174,184",
                accentSky: "#9aa1ad", skyRgb: "154,161,173",
                input: "#16181c", inputRgb: "22,24,28",
                wellDeep: "#0a0b0d", wellDeepRgb: "10,11,13",
                wellDeepestRgb: "6,7,8",
                ink: "#f0f1f3", inkRgb: "240,241,243",
                inkStrong: "#f7f8f9",
                inkChip: "#e8eaed", inkChipRgb: "232,234,237",
                inkIo: "#d4d8de",
                inkSoft: "#dcdfe4",
                inkMid: "#c8ccd3",
                mute: "#c5cad3", muteRgb: "197,202,211",
                muteDim: "#8b9099",
                placeholder: "#9aa1ad",
                dotOff: "#4a4f58",
                ioOff: "#9aa1ad",
                glowRgb: "140,148,160",
                glowCoreRgb: "107,114,128",
                lineSoftRgb: "220,224,230",
                lineBrightRgb: "200,205,212"
            })
        }
    };

    var _CUSTOM_KEYS = ["bg", "well", "title", "line", "accent", "ink"];
    var _CUSTOM_FB = { bg: "#0b1428", well: "#102044", title: "#1a3d7a", line: "#1e3a6e", accent: "#2e6ee5", ink: "#eef3fb" };

    function _hexToRgb(hex) {
        hex = String(hex || "").replace("#", "").trim();
        if (hex.length === 3) hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
        if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
        var n = parseInt(hex, 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    function _rgbToHex(c) {
        function h(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? "0" : "") + n.toString(16); }
        return "#" + h(c.r) + h(c.g) + h(c.b);
    }
    function _mix(a, b, u) {
        return { r: a.r + (b.r - a.r) * u, g: a.g + (b.g - a.g) * u, b: a.b + (b.b - a.b) * u };
    }
    function _rgbCsv(c) {
        return Math.round(c.r) + "," + Math.round(c.g) + "," + Math.round(c.b);
    }
    function _normHex(hex) {
        var c = _hexToRgb(hex);
        return c ? _rgbToHex(c) : "";
    }

    window.getAnimaThemeId = function () {
        try { return localStorage.getItem("anima_theme") || "cobalt"; } catch (e) { return "cobalt"; }
    };

    window.getAnimaCustomColors = function () {
        var out = { bg: _CUSTOM_FB.bg, well: _CUSTOM_FB.well, title: _CUSTOM_FB.title, line: _CUSTOM_FB.line, accent: _CUSTOM_FB.accent, ink: _CUSTOM_FB.ink };
        try {
            var raw = localStorage.getItem("anima_theme_custom");
            if (!raw) return out;
            var j = JSON.parse(raw);
            for (var i = 0; i < _CUSTOM_KEYS.length; i++) {
                var k = _CUSTOM_KEYS[i];
                var hx = _normHex(j[k]);
                if (hx) out[k] = hx;
            }
        } catch (e) {}
        return out;
    };

    window.seedAnimaCustomFromCurrent = function () {
        var cs = getComputedStyle(document.documentElement);
        function v(name, fb) {
            var x = (cs.getPropertyValue(name) || "").trim();
            return _hexToRgb(x) ? _normHex(x) : fb;
        }
        var seed = {
            bg: v("--anima-bg", _CUSTOM_FB.bg),
            well: v("--anima-well", _CUSTOM_FB.well),
            title: v("--anima-title", _CUSTOM_FB.title),
            line: v("--anima-line", _CUSTOM_FB.line),
            accent: v("--anima-accent", _CUSTOM_FB.accent),
            ink: v("--anima-ink", _CUSTOM_FB.ink)
        };
        try { localStorage.setItem("anima_theme_custom", JSON.stringify(seed)); } catch (e) {}
        return seed;
    };

    window.setAnimaCustomColors = function (partial, apply) {
        var cur = window.getAnimaCustomColors();
        if (partial) {
            for (var i = 0; i < _CUSTOM_KEYS.length; i++) {
                var k = _CUSTOM_KEYS[i];
                if (partial[k] != null) {
                    var hx = _normHex(partial[k]);
                    if (hx) cur[k] = hx;
                }
            }
        }
        try { localStorage.setItem("anima_theme_custom", JSON.stringify(cur)); } catch (e) {}
        if (apply !== false) window.applyAnimaTheme("custom");
        return cur;
    };

    function _buildCustomPalette(cols) {
        var black = { r: 0, g: 0, b: 0 };
        var white = { r: 255, g: 255, b: 255 };
        var bg = _hexToRgb(cols.bg);
        var well = _hexToRgb(cols.well);
        var title = _hexToRgb(cols.title);
        var line = _hexToRgb(cols.line);
        var accent = _hexToRgb(cols.accent);
        var ink = _hexToRgb(cols.ink);
        var deep = _mix(bg, black, 0.18);
        var wellLo = _mix(well, bg, 0.35);
        var wellDeep = _mix(bg, black, 0.28);
        var wellDeepest = _mix(bg, black, 0.4);
        var accentHi = _mix(accent, white, 0.08);
        var accentMid = _mix(accent, white, 0.12);
        var accentRange = _mix(accent, white, 0.22);
        var accentSoft = _mix(accent, ink, 0.45);
        var accentRing = _mix(accent, white, 0.28);
        var accentSky = _mix(accent, white, 0.2);
        var input = _mix(well, bg, 0.25);
        var inkStrong = _mix(ink, white, 0.15);
        var inkChip = _mix(ink, well, 0.08);
        var inkIo = _mix(ink, accent, 0.25);
        var inkSoft = _mix(ink, well, 0.18);
        var inkMid = _mix(ink, accent, 0.35);
        var mute = _mix(ink, well, 0.35);
        var muteDim = _mix(ink, well, 0.55);
        var placeholder = _mix(ink, accent, 0.4);
        var dotOff = _mix(line, accent, 0.35);
        var ioOff = _mix(ink, well, 0.45);
        var glow = _mix(accent, white, 0.15);
        var luma = (0.2126 * accent.r + 0.7152 * accent.g + 0.0722 * accent.b) / 255;
        var onAccent = luma > 0.62 ? _rgbToHex(_mix(bg, black, 0.12)) : "#ffffff";
        return {
            id: "custom",
            name: "自定义",
            nodeBg: cols.bg,
            nodeTitle: cols.title,
            accent: cols.accent,
            accentSoft: _rgbToHex(accentSoft),
            vars: _vars({
                bg: cols.bg, bgRgb: _rgbCsv(bg),
                deep: _rgbToHex(deep), deepRgb: _rgbCsv(deep),
                well: cols.well, wellRgb: _rgbCsv(well),
                wellLo: _rgbToHex(wellLo), wellLoRgb: _rgbCsv(wellLo),
                title: cols.title, titleRgb: _rgbCsv(title),
                line: cols.line, lineRgb: _rgbCsv(line),
                accent: cols.accent, accentRgb: _rgbCsv(accent),
                accentHi: _rgbToHex(accentHi), accentHiRgb: _rgbCsv(accentHi),
                accentMid: _rgbToHex(accentMid), accentMidRgb: _rgbCsv(accentMid),
                accentRange: _rgbToHex(accentRange), accentRangeRgb: _rgbCsv(accentRange),
                accentSoft: _rgbToHex(accentSoft), accentSoftRgb: _rgbCsv(accentSoft),
                accentRing: _rgbToHex(accentRing), accentRingRgb: _rgbCsv(accentRing),
                accentSky: _rgbToHex(accentSky), skyRgb: _rgbCsv(accentSky),
                input: _rgbToHex(input), inputRgb: _rgbCsv(input),
                wellDeep: _rgbToHex(wellDeep), wellDeepRgb: _rgbCsv(wellDeep),
                wellDeepestRgb: _rgbCsv(wellDeepest),
                ink: cols.ink, inkRgb: _rgbCsv(ink),
                inkStrong: _rgbToHex(inkStrong),
                inkChip: _rgbToHex(inkChip), inkChipRgb: _rgbCsv(inkChip),
                inkIo: _rgbToHex(inkIo),
                inkSoft: _rgbToHex(inkSoft),
                inkMid: _rgbToHex(inkMid),
                mute: _rgbToHex(mute), muteRgb: _rgbCsv(mute),
                muteDim: _rgbToHex(muteDim),
                placeholder: _rgbToHex(placeholder),
                dotOff: _rgbToHex(dotOff),
                ioOff: _rgbToHex(ioOff),
                glowRgb: _rgbCsv(glow),
                glowCoreRgb: _rgbCsv(accent),
                lineSoftRgb: _rgbCsv(_mix(ink, line, 0.15)),
                lineBrightRgb: _rgbCsv(_mix(ink, line, 0.28)),
                onAccent: onAccent
            })
        };
    }

    window.applyAnimaTheme = function (id, persist) {
        var pal;
        if (id === "custom") {
            try {
                if (!localStorage.getItem("anima_theme_custom")) window.seedAnimaCustomFromCurrent();
            } catch (e0) {}
            pal = _buildCustomPalette(window.getAnimaCustomColors());
        } else {
            pal = (window.ANIMA_THEMES && window.ANIMA_THEMES[id]) || window.ANIMA_THEMES.cobalt;
        }
        var root = document.documentElement;
        var vars = pal.vars || {};
        for (var k in vars) {
            if (Object.prototype.hasOwnProperty.call(vars, k)) root.style.setProperty(k, vars[k]);
        }
        window.ANIMA_THEME = {
            id: pal.id,
            name: pal.name,
            nodeBg: pal.nodeBg,
            nodeTitle: pal.nodeTitle,
            accent: pal.accent,
            accentSoft: pal.accentSoft,
            glowBg: "var(--anima-glow-bg)"
        };
        if (persist !== false) {
            try { localStorage.setItem("anima_theme", pal.id); } catch (e) {}
        }
        try {
            var nodes = (window.app && window.app.graph && window.app.graph._nodes) || [];
            for (var i = 0; i < nodes.length; i++) {
                if (nodes[i] && nodes[i]._animaThemed) window.applyAnimaNodeChrome(nodes[i]);
            }
            if (window.app && window.app.graph && typeof window.app.graph.setDirtyCanvas === "function")
                window.app.graph.setDirtyCanvas(true, true);
        } catch (e) {}
        try {
            document.dispatchEvent(new CustomEvent("anima-theme-change", { detail: { id: pal.id } }));
        } catch (e2) {}
        return pal.id;
    };

    window.applyAnimaTheme(window.getAnimaThemeId(), false);

    window.ANIMA_BUILTIN_BG = "/extensions/ComfyUI-Danbooru-Anima-Prompt/heroine.png";

    window.animaDetectSoftGpu = function () {
        if (window.__animaSoftGpu != null) return window.__animaSoftGpu;
        var soft = false;
        try {
            var c = document.createElement("canvas");
            var gl = c.getContext("webgl") || c.getContext("experimental-webgl");
            if (!gl) soft = true;
            else {
                var info = gl.getExtension("WEBGL_debug_renderer_info");
                var r = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || "") : "";
                if (/swiftshader|basic render|llvmpipe|softpipe|gdi generic|microsoft basic|software rasterizer|mesa offscreen|warp/i.test(r)) soft = true;
            }
        } catch (e) {}
        window.__animaSoftGpu = !!soft;
        return window.__animaSoftGpu;
    };

    window.animaSoftBlurEnabled = function () {
        try {
            var v = localStorage.getItem("anima_soft_blur");
            if (v === "1") return true;
            if (v === "0") return false;
            var force = localStorage.getItem("anima_cheap_fx");
            if (force === "0") return true;
            if (force === "1") return false;
        } catch (e) {}
        return false;
    };

    window.animaCheapFx = function (refresh) {
        if (refresh) window.__animaCheapFx = null;
        if (window.__animaCheapFx != null) return window.__animaCheapFx;
        var cheap = false;
        try {
            if (window.animaDetectSoftGpu() && !window.animaSoftBlurEnabled()) cheap = true;
        } catch (e) {}
        window.__animaCheapFx = !!cheap;
        try {
            document.documentElement.classList.toggle("anima-cheap-fx", window.__animaCheapFx);
        } catch (e2) {}
        return window.__animaCheapFx;
    };

    window.animaSetSoftBlur = function (on) {
        try { localStorage.setItem("anima_soft_blur", on ? "1" : "0"); } catch (e) {}
        window.animaCheapFx(true);
        return !window.__animaCheapFx;
    };

    window.animaCheapFx();

    function _animaReadNum(key, fallback, min, max) {
        var n = parseFloat(localStorage.getItem(key));
        if (!isFinite(n)) n = fallback;
        return Math.max(min, Math.min(max, n));
    }

    window.getAnimaPopupBg = function () {
        try { return localStorage.getItem("anima_popup_bg") || "none"; } catch (e) { return "none"; }
    };

    window.animaPopupBgUrl = function (bg) {
        if (!bg) bg = window.getAnimaPopupBg();
        if (!bg || bg === "none") return "";
        if (bg === "builtin") return window.ANIMA_BUILTIN_BG;
        if (bg.indexOf("custom:") === 0) {
            var id = bg.slice(7);
            if (!/^[A-Za-z0-9._-]+$/.test(id)) return "";
            return "/danbooru_anima/popup_bg/" + encodeURIComponent(id);
        }
        return "";
    };

    // opacity 0-100，blur 0-20px；有图时模糊打在立绘上，无图时模糊改成弹窗毛玻璃，透明度两种都生效
    window.applyAnimaPopupAppearance = function (opacity, blur, bg) {
        if (opacity == null) opacity = _animaReadNum("anima_popup_opacity", 50, 0, 100);
        if (blur == null) blur = _animaReadNum("anima_popup_blur", 3, 0, 20);
        if (bg == null) bg = window.getAnimaPopupBg();
        opacity = Math.max(0, Math.min(100, Number(opacity)));
        blur = Math.max(0, Math.min(20, Number(blur)));
        if (typeof bg !== "string" || !bg) bg = "none";
        try {
            localStorage.setItem("anima_popup_opacity", String(opacity));
            localStorage.setItem("anima_popup_blur", String(blur));
            localStorage.setItem("anima_popup_bg", bg);
        } catch (e) {}
        var root = document.documentElement;
        var url = window.animaPopupBgUrl(bg);
        var hasBg = !!url;
        if (hasBg) {
            var t = opacity / 100;
            var shell, veil;
            if (t <= 0.5) {
                var k = t / 0.5;
                shell = 0.04 + k * 0.14;
                veil = 0.18 + k * 0.82;
            } else {
                var k2 = (t - 0.5) / 0.5;
                shell = 0.18 + k2 * 0.60;
                veil = 1;
            }
            root.style.setProperty("--anima-hero-image", 'url("' + url + '")');
            root.style.setProperty("--anima-hero-show", "0.70");
            root.style.setProperty("--anima-popup-alpha", shell.toFixed(3));
            root.style.setProperty("--anima-veil-opacity", veil.toFixed(3));
            root.style.setProperty("--anima-hero-blur", blur.toFixed(1) + "px");
            root.style.setProperty("--anima-backdrop-blur", "0px");
        } else {
            var t0 = opacity / 100;
            var shell0 = 0.12 + t0 * 0.82;
            root.style.setProperty("--anima-hero-image", "none");
            root.style.setProperty("--anima-hero-show", "0");
            root.style.setProperty("--anima-popup-alpha", shell0.toFixed(3));
            root.style.setProperty("--anima-veil-opacity", "1");
            root.style.setProperty("--anima-hero-blur", "0px");
            root.style.setProperty("--anima-backdrop-blur", blur.toFixed(1) + "px");
        }
    };

    window.applyAnimaNodeChrome = function (node) {
        if (!node) return;
        var t = window.ANIMA_THEME;
        node._animaThemed = true;
        node.bgcolor = t.nodeBg;
        node.color = t.nodeTitle;
        try {
            if (!node.properties) node.properties = {};
            node.properties.bgcolor = t.nodeBg;
            node.properties.color = t.nodeTitle;
        } catch (e) {}
        try {
            if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
        } catch (e) {}
    };

    window.hookAnimaNodeChrome = function (nodeType) {
        if (!nodeType || !nodeType.prototype) return;
        if (nodeType.prototype._animaChromeHooked) return;
        nodeType.prototype._animaChromeHooked = true;
        var prev = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            if (this._animaChromeConfiguring) return;
            this._animaChromeConfiguring = true;
            try {
                var r;
                if (typeof prev === "function" && prev !== nodeType.prototype.onConfigure) r = prev.apply(this, arguments);
                window.applyAnimaNodeChrome(this);
                var self = this;
                setTimeout(function () { window.applyAnimaNodeChrome(self); }, 50);
                setTimeout(function () { window.applyAnimaNodeChrome(self); }, 250);
                return r;
            } finally {
                this._animaChromeConfiguring = false;
            }
        };
    };

    window.applyAnimaPanelGlow = function (el) {
        if (!el || !el.style) return;
        el.style.background = "var(--anima-glow-bg)";
        if (!el.style.position) el.style.position = "relative";
        el.classList.add("anima-theme-glow");
    };

    window.animaClearScrim = function (el) {
        if (!el || el === document.body || el === document.documentElement) return;
        el.classList.add("anima-popup-scrim");
        if (el.style) {
            el.style.background = "transparent";
            el.style.backdropFilter = "none";
            el.style.webkitBackdropFilter = "none";
        }
    };

    window.applyAnimaPopupSkin = function (el) {
        if (!el) return;
        var old = el.querySelector(":scope > .anima-theme-wp");
        if (old) old.remove();
        el.classList.add("anima-theme-popup");
        if (!el.style.position) el.style.position = "relative";
        el.style.background = "rgba(var(--anima-bg-deep-rgb),var(--anima-popup-alpha, .94))";
        el.setAttribute("data-anima-skin", "1");
        var _nudgeScrim = function () {
            var p = el.parentElement;
            if (!p || p === document.body || p === document.documentElement) return;
            if (p.classList && p.classList.contains("anima-theme-popup")) return;
            if (typeof window.animaClearScrim === "function") window.animaClearScrim(p);
        };
        _nudgeScrim();
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(_nudgeScrim);
        else setTimeout(_nudgeScrim, 0);
    };

    var oldSt = document.getElementById("anima-theme-extra");
    if (oldSt) oldSt.remove();
    var oldSt2 = document.getElementById("anima-theme-extra-v2");
    if (oldSt2) oldSt2.remove();
    if (!document.getElementById("anima-theme-extra-v3")) {
        var st = document.createElement("style");
        st.id = "anima-theme-extra-v3";
        st.textContent =
            ":root{--anima-popup-alpha:.94;--anima-veil-opacity:1;--anima-hero-blur:0px;--anima-backdrop-blur:0px;--anima-hero-image:none;--anima-hero-show:0;}" +
            ".anima-theme-glow{isolation:isolate;}" +
            ".anima-theme-glow::before{content:'';position:absolute;inset:0;z-index:6;pointer-events:none;border-radius:inherit;" +
            "background:radial-gradient(ellipse 80% 55% at 100% -8%,rgba(var(--anima-glow-rgb),.48) 0%,transparent 58%);mix-blend-mode:screen;}" +
            ".anima-theme-popup{isolation:isolate;-webkit-backdrop-filter:blur(var(--anima-backdrop-blur,0px));backdrop-filter:blur(var(--anima-backdrop-blur,0px));color:var(--anima-ink);text-shadow:0 1px 2px rgba(0,0,0,.72);background:rgba(var(--anima-bg-deep-rgb),var(--anima-popup-alpha,.94));}.anima-theme-popup input,.anima-theme-popup textarea,.anima-theme-popup select{text-shadow:none;}.anima-theme-popup button{color:var(--anima-ink);text-shadow:none;}.anima-theme-popup .tp-tab{color:var(--anima-mute);}.anima-fav-popup{color:var(--anima-ink-strong);text-shadow:0 1px 3px rgba(0,0,0,.88),0 0 10px rgba(0,0,0,.45);}.anima-fav-popup button{border:1px solid rgba(var(--anima-line-soft-rgb),.42)!important;font-weight:700;text-shadow:0 1px 2px rgba(0,0,0,.75);box-shadow:inset 0 1px 0 rgba(255,255,255,.14);}.anima-fav-popup select,.anima-fav-popup input[type=number],.anima-fav-popup input[type=text],.anima-fav-popup input[type=search]{color:var(--anima-ink-strong);border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:rgba(var(--anima-input-rgb),.88);}" +
            ".anima-theme-popup::before{content:'';position:absolute;inset:0;z-index:-2;pointer-events:none;border-radius:inherit;" +
            "background-image:var(--anima-hero-image,none);" +
            "background-size:100% auto;background-position:50% 16%;background-repeat:no-repeat;" +
            "filter:blur(var(--anima-hero-blur,0px)) saturate(1.06);opacity:var(--anima-hero-show,0);transform:scale(1.02);}" +
            ".anima-theme-popup::after{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:inherit;" +
            "opacity:var(--anima-veil-opacity,1);" +
            "background:radial-gradient(ellipse 80% 55% at 100% -8%,rgba(var(--anima-glow-core-rgb),.10) 0%,transparent 58%),linear-gradient(165deg,rgba(var(--anima-well-rgb),.12) 0%,rgba(var(--anima-bg-deep-rgb),.20) 72%);}";
        (document.head || document.documentElement).appendChild(st);
    }

    var oldScrim = document.getElementById("anima-popup-scrim-v1");
    if (oldScrim) oldScrim.remove();
    if (!document.getElementById("anima-popup-scrim-v1")) {
        var scr = document.createElement("style");
        scr.id = "anima-popup-scrim-v1";
        scr.textContent =
            ".anima-popup-scrim,.db-fav-overlay,body > div:has(> .anima-theme-popup):not(.anima-theme-popup){" +
            "background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}";
        (document.head || document.documentElement).appendChild(scr);
    }

    var oldChip = document.getElementById("anima-tag-chip-v1");
    if (oldChip) oldChip.remove();
    var oldChip2 = document.getElementById("anima-tag-chip-v2");
    if (oldChip2) oldChip2.remove();
    var oldChip3 = document.getElementById("anima-tag-chip-v3");
    if (oldChip3) oldChip3.remove();
    if (!document.getElementById("anima-tag-chip-v4")) {
        var cs = document.createElement("style");
        cs.id = "anima-tag-chip-v4";
        cs.textContent =
            ".anima-tag-chip{display:inline-flex;flex-direction:column;align-items:flex-start;gap:1px;" +
            "padding:4px 9px 4px 10px;border-radius:8px;font-size:11px;font-weight:600;letter-spacing:.015em;" +
            "line-height:1.28;color:var(--anima-ink-chip);cursor:grab;user-select:none;max-width:300px;box-sizing:border-box;flex-shrink:0;" +
            "background:linear-gradient(180deg,rgba(255,255,255,.07),transparent 44%),linear-gradient(180deg,var(--chip-wash,color-mix(in srgb,var(--anima-accent) 18%,transparent)),var(--chip-wash-lo,color-mix(in srgb,var(--anima-accent) 8%,transparent)));" +
            "border:1px solid var(--chip-bd,color-mix(in srgb,var(--anima-accent) 45%,transparent));" +
            "box-shadow:inset 3px 0 0 var(--chip-col,var(--anima-accent)),inset 0 1px 0 rgba(255,255,255,.10);" +
            "transition:transform .12s ease,box-shadow .12s ease,border-color .12s ease;}" +
            ".anima-tag-chip:hover:not(.is-hidden):not(.is-drag):not(.is-drop):not(.is-static){transform:translateY(-1px);" +
            "border-color:var(--chip-col,var(--anima-accent));" +
            "box-shadow:inset 3px 0 0 var(--chip-col,var(--anima-accent)),inset 0 1px 0 rgba(255,255,255,.16),0 6px 14px rgba(0,0,0,.32);}" +
            ".anima-tag-chip.is-static{cursor:default;}" +
            ".anima-tag-chip.is-pick{cursor:pointer;}" +
            ".anima-tag-chip.is-static.is-pick{cursor:pointer;}" +
            ".anima-tag-chip.is-wide{width:100%;max-width:none;flex-basis:100%;white-space:normal;" +
            "background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(var(--anima-bg-deep-rgb),.42));" +
            "border:1px dashed rgba(255,255,255,.22);}" +
            ".anima-tag-chip.is-sentence{border-style:dotted;border-color:#6bcb77aa;}" +
            ".anima-tag-chip.is-merged{border-style:dashed;border-color:rgba(255,255,255,.28);}" +
            ".anima-tag-chip.is-sel{border:1px solid #e94560;background:linear-gradient(180deg,rgba(233,69,96,.20),rgba(var(--anima-bg-deep-rgb),.42));" +
            "box-shadow:inset 3px 0 0 #e94560,inset 0 1px 0 rgba(255,255,255,.10),0 0 0 1px rgba(233,69,96,.28);}" +
            ".anima-tag-chip.is-hidden{opacity:.45;filter:grayscale(.72);border:1px dashed #e94560;box-shadow:none;}" +
            ".anima-tag-chip.is-drag{opacity:.4;border:2px dashed var(--anima-accent-soft)!important;transform:none;cursor:grabbing;box-shadow:none;}" +
            ".anima-tag-chip.is-drop{outline:2px solid var(--anima-accent-soft);background:linear-gradient(180deg,rgba(var(--anima-accent-hi-rgb),.42),rgba(var(--anima-accent-hi-rgb),.16))!important;" +
            "box-shadow:inset 3px 0 0 var(--anima-accent-soft),0 0 0 1px rgba(var(--anima-accent-soft-rgb),.35);}" +
            ".anima-tag-chip .anima-chip-en{color:var(--anima-ink-strong);font-weight:600;}" +
            ".anima-tag-chip .anima-chip-cn{color:color-mix(in srgb,var(--chip-col,var(--anima-accent-soft)) 28%,var(--anima-ink-chip) 72%);font-size:11px;font-weight:600;opacity:1;line-height:1.22;text-shadow:0 1px 0 rgba(0,0,0,.42);}";
        (document.head || document.documentElement).appendChild(cs);
    }

    var _chipThemeHex = { "#8cb8ff": 1, "#2e6ee5": 1, "#1565ff": 1, "#4d8cff": 1, "#6a9cff": 1 };
    window.animaApplyTagChip = function (el, col, flags) {
        if (!el) return;
        flags = flags || {};
        col = col || "var(--anima-accent-soft)";
        if (_chipThemeHex[String(col).toLowerCase()]) col = "var(--anima-accent-soft)";
        el.classList.add("anima-tag-chip");
        el.classList.toggle("is-wide", !!flags.wide);
        el.classList.toggle("is-merged", !!flags.merged);
        el.classList.toggle("is-sentence", !!flags.sentence);
        el.classList.toggle("is-sel", !!flags.selected);
        el.classList.toggle("is-hidden", !!flags.hidden);
        el.classList.toggle("is-pick", !!flags.pick);
        el.classList.toggle("is-static", !!flags.static);
        el.style.setProperty("--chip-col", col);
        if (/^#[0-9a-fA-F]{6}$/.test(col)) {
            el.style.setProperty("--chip-wash", col + "2E");
            el.style.setProperty("--chip-wash-lo", col + "14");
            el.style.setProperty("--chip-bd", col + "73");
        } else {
            el.style.setProperty("--chip-wash", "color-mix(in srgb," + col + " 18%, transparent)");
            el.style.setProperty("--chip-wash-lo", "color-mix(in srgb," + col + " 8%, transparent)");
            el.style.setProperty("--chip-bd", "color-mix(in srgb," + col + " 45%, transparent)");
        }
    };


    if (!document.getElementById("anima-mode-sw-v4")) {
        var ms = document.createElement("style");
        ms.id = "anima-mode-sw-v4";
        ms.textContent =
            ".anima-mode-dock{background:rgba(var(--anima-accent-soft-rgb),.07)!important;border:1px solid rgba(var(--anima-accent-soft-rgb),.26)!important;" +
            "border-radius:16px!important;box-shadow:none;padding:5px 8px!important;gap:7px!important;align-items:center!important;}" +
            ".anima-mode-sw{position:relative;display:inline-flex;align-items:center;height:32px;" +
            "padding:0 16px 0 28px!important;border-radius:999px!important;font-size:13px!important;font-weight:600!important;" +
            "letter-spacing:.01em;white-space:nowrap;cursor:pointer;user-select:none;box-sizing:border-box;flex-shrink:0;" +
            "border-width:1px!important;border-style:solid!important;" +
            "transition:background .15s ease,border-color .15s ease,color .15s ease,box-shadow .15s ease;}" +
            ".anima-mode-sw::before{content:'';position:absolute;left:10px;top:50%;width:7px;height:7px;margin-top:-3.5px;" +
            "border-radius:50%;box-shadow:0 0 0 2px rgba(var(--anima-bg-deep-rgb),.35);}" +
            ".anima-mode-io.is-on{color:var(--anima-ink-io)!important;background:rgba(var(--anima-accent-soft-rgb),.18)!important;" +
            "border-color:var(--anima-accent-ring)!important;box-shadow:inset 0 0 0 1px rgba(var(--anima-accent-soft-rgb),.10)!important;}" +
            ".anima-mode-io.is-on::before{background:#7ee0a3;}" +
            ".anima-mode-io:not(.is-on){color:var(--anima-io-off)!important;background:rgba(var(--anima-bg-deep-rgb),.36)!important;" +
            "border-color:rgba(var(--anima-accent-ring-rgb),.32)!important;box-shadow:none!important;}" +
            ".anima-mode-io:not(.is-on)::before{background:var(--anima-dot-off);}" +
            ".anima-mode-pause.is-on{color:#ead9b4!important;background:rgba(212,160,86,.16)!important;" +
            "border-color:#c9a05a!important;box-shadow:inset 0 0 0 1px rgba(232,192,120,.10)!important;}" +
            ".anima-mode-pause.is-on::before{background:#ffe08a;}" +
            ".anima-mode-pause:not(.is-on){color:#b8a078!important;background:rgba(var(--anima-bg-deep-rgb),.36)!important;" +
            "border-color:rgba(201,160,90,.36)!important;}" +
            ".anima-mode-pause:not(.is-on)::before{background:#6e5a38;}" +
            ".anima-mode-chip.is-on{color:#b8eef4!important;background:rgba(62,196,212,.16)!important;" +
            "border-color:#4eb8c4!important;box-shadow:inset 0 0 0 1px rgba(126,232,240,.10)!important;}" +
            ".anima-mode-chip.is-on::before{background:#9ff0c8;}" +
            ".anima-mode-chip:not(.is-on){color:#7aa8b0!important;background:rgba(var(--anima-bg-deep-rgb),.36)!important;" +
            "border-color:rgba(78,184,196,.34)!important;}" +
            ".anima-mode-chip:not(.is-on)::before{background:#3a7a84;}";
        (document.head || document.documentElement).appendChild(ms);
    }

    window.animaPaintModeSwitch = function (el, kind, on) {
        if (!el) return;
        el.style.background = "";
        el.style.backgroundImage = "";
        el.style.border = "";
        el.style.borderColor = "";
        el.style.borderRadius = "";
        el.style.padding = "";
        el.style.fontSize = "";
        el.style.fontWeight = "";
        el.style.color = "";
        el.style.boxShadow = "";
        el.classList.add("anima-mode-sw");
        el.classList.remove("anima-mode-io", "anima-mode-pause", "anima-mode-chip");
        var k = kind === "pause" ? "pause" : (kind === "chip" ? "chip" : "io");
        el.classList.add("anima-mode-" + k);
        el.classList.toggle("is-on", !!on);
    };

    window.animaPaintModeDock = function (el) {
        if (!el) return;
        el.style.background = "";
        el.style.border = "";
        el.style.borderRadius = "";
        el.style.padding = "";
        el.style.gap = "";
        el.classList.add("anima-mode-dock");
    };

    window.animaEnsureModeFrame = function (el) {
        if (!el) return el;
        el.classList.add("anima-pt-shell");
        if (!el.querySelector(":scope > .anima-pt-ring-input")) {
            var rin = document.createElement("div");
            rin.className = "anima-pt-ring anima-pt-ring-input";
            el.appendChild(rin);
        }
        if (!el.querySelector(":scope > .anima-pt-ring-pause")) {
            var rpa = document.createElement("div");
            rpa.className = "anima-pt-ring anima-pt-ring-pause";
            el.appendChild(rpa);
        }
        return el;
    };

    window.animaPaintNodeModeFrame = function (el, flags) {
        if (!el) return;
        flags = flags || {};
        window.animaEnsureModeFrame(el);
        el.classList.toggle("is-input", !!flags.input);
        el.classList.toggle("is-pause", !!flags.pause);
    };

    (function () {
        var oldFrame = document.getElementById("anima-pt-frame-v1");
        if (oldFrame) oldFrame.remove();
        var oldFrame2 = document.getElementById("anima-pt-frame-v2");
        if (oldFrame2) oldFrame2.remove();
        var fr = document.createElement("style");
        fr.id = "anima-pt-frame-v2";
        fr.textContent =
            ".anima-pt-shell{position:relative;contain:layout style;}" +
            ".anima-pt-ring{position:absolute;inset:0;pointer-events:none;z-index:40;border-radius:inherit;opacity:0;" +
            "transition:opacity .55s ease;}" +
            ".anima-pt-ring-input{box-shadow:inset 0 0 0 1.5px rgba(var(--anima-accent-ring-rgb),.46),inset 0 0 16px rgba(var(--anima-glow-rgb),.12);}" +
            ".anima-pt-shell.is-input > .anima-pt-ring-input{opacity:1;}" +
            ".anima-pt-ring-pause{z-index:41;box-shadow:inset 0 0 0 1px rgba(255,224,138,.30),inset 0 0 22px rgba(255,208,100,.16);}" +
            ".anima-pt-shell.is-pause > .anima-pt-ring-pause{opacity:1;}";
        (document.head || document.documentElement).appendChild(fr);

        var cheapSt = document.getElementById("anima-cheap-fx-v1");
        if (cheapSt) cheapSt.remove();
        cheapSt = document.getElementById("anima-cheap-fx-v2");
        if (!cheapSt) {
            cheapSt = document.createElement("style");
            cheapSt.id = "anima-cheap-fx-v2";
            (document.head || document.documentElement).appendChild(cheapSt);
        }
        cheapSt.textContent =
            "html.anima-cheap-fx .anima-theme-glow::before{mix-blend-mode:normal;opacity:.52;}" +
            "html.anima-cheap-fx .anima-theme-popup{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;}" +
            "html.anima-cheap-fx .anima-theme-popup::before{filter:none!important;transform:none!important;}" +
            "html.anima-cheap-fx .anima-tag-chip:hover:not(.is-hidden):not(.is-drag):not(.is-drop):not(.is-static){transform:none;}" +
            "html.anima-cheap-fx .anima-pt-ring{transition:opacity .28s ease;}" +
            "html.anima-cheap-fx .anima-pt-ring-input{box-shadow:inset 0 0 0 1.5px rgba(var(--anima-accent-ring-rgb),.52)!important;}" +
            "html.anima-cheap-fx .anima-pt-ring-pause{box-shadow:inset 0 0 0 1.5px rgba(255,224,138,.48)!important;}" +
            "html.anima-cheap-fx #_multiToggle:hover,html.anima-cheap-fx #_comboListBtn:hover,html.anima-cheap-fx #_atToggle:hover," +
            "html.anima-cheap-fx #tp-hide-pin:hover,html.anima-cheap-fx #tp-pin-fold:hover,html.anima-cheap-fx .tp-src-tab:hover," +
            "html.anima-cheap-fx .tp-card:hover,html.anima-cheap-fx .tp-pin-chip:hover{transform:none!important;filter:none!important;}";
    })();

    window.applyAnimaPopupAppearance();
})();

window.animaFavAutoCacheKey = function (site) {
    return site === "gel" ? "gel_fav_auto_cache" : "db_fav_auto_cache";
};
window.animaFavAutoCacheOn = function (site) {
    try { return localStorage.getItem(window.animaFavAutoCacheKey(site)) === "1"; }
    catch (e) { return false; }
};
window.animaFacetNoteNorm = function (tag) {
    return String(tag || "").replace(/\s+/g, "_").replace(/^,+|,+$/g, "").toLowerCase();
};
window.animaFacetNoteKey = function (kind, tag) {
    var k = window.animaFacetNoteNorm(tag);
    if (!k) return "";
    return ((kind === "series") ? "series" : "character") + ":" + k;
};
window.animaFacetNoteMap = function () {
    try {
        var raw = localStorage.getItem("anima_facet_notes");
        var o = raw ? JSON.parse(raw) : {};
        return (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
    } catch (e) { return {}; }
};
window.animaFacetNoteGet = function (kind, tag) {
    var key = window.animaFacetNoteKey(kind, tag);
    if (!key) return "";
    var v = window.animaFacetNoteMap()[key];
    return (typeof v === "string") ? v.trim() : "";
};
window.animaFacetNoteSet = function (kind, tag, note) {
    var key = window.animaFacetNoteKey(kind, tag);
    if (!key) return;
    var map = window.animaFacetNoteMap();
    note = String(note == null ? "" : note).trim();
    if (!note) delete map[key];
    else map[key] = note;
    try { localStorage.setItem("anima_facet_notes", JSON.stringify(map)); } catch (e1) {}
};
window.animaFacetNoteEdit = function (opts) {
    opts = opts || {};
    var kind = opts.kind === "series" ? "series" : "character";
    var tag = opts.tag || "";
    if (!tag) return;
    var txt = (typeof animaTxt === "function") ? animaTxt : function (s) { return s; };
    var fallback = opts.fallback || String(tag).replace(/_/g, " ");
    var cur = window.animaFacetNoteGet(kind, tag);
    var old = document.getElementById("anima-facet-note-mask");
    if (old) old.remove();
    var mask = document.createElement("div");
    mask.id = "anima-facet-note-mask";
    mask.style.cssText = "position:fixed;inset:0;z-index:100090;background:transparent;display:flex;align-items:center;justify-content:center;";
    var box = document.createElement("div");
    box.style.cssText = "min-width:280px;max-width:92vw;padding:16px 18px;border-radius:8px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);";
    if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(box);
    var title = document.createElement("div");
    title.textContent = txt("设置备注");
    title.style.cssText = "font-size:14px;font-weight:700;color:var(--anima-ink);margin-bottom:6px;";
    var orig = document.createElement("div");
    orig.textContent = txt("原名") + "：" + fallback;
    orig.style.cssText = "font-size:12px;color:var(--anima-ink-soft);margin-bottom:10px;word-break:break-all;";
    var inp = document.createElement("input");
    inp.type = "text";
    inp.value = cur;
    inp.placeholder = txt("留空则显示原名");
    inp.style.cssText = "width:100%;box-sizing:border-box;padding:8px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%);color:var(--anima-ink-mid);font-size:13px;outline:none;margin-bottom:12px;";
    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;";
    function closeMask() { mask.remove(); }
    function saveNote(val) {
        window.animaFacetNoteSet(kind, tag, val);
        closeMask();
        if (typeof opts.onSaved === "function") opts.onSaved(window.animaFacetNoteGet(kind, tag));
    }
    function mkBtn(label, bg, onClick, color) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.cssText = "padding:6px 14px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:" + bg + ";color:" + (color || "#fff") + ";cursor:pointer;font-size:12px;";
        b.onclick = onClick;
        return b;
    }
    row.appendChild(mkBtn(txt("取消"), "#f87171", closeMask));
    if (cur) row.appendChild(mkBtn(txt("清除备注"), "rgba(var(--anima-input-rgb),.86)", function () { saveNote(""); }, "var(--anima-ink-strong)"));
    row.appendChild(mkBtn(txt("保存"), "linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi))", function () { saveNote(inp.value); }));
    inp.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") { ev.preventDefault(); saveNote(inp.value); }
        if (ev.key === "Escape") { ev.preventDefault(); closeMask(); }
    });
    box.appendChild(title);
    box.appendChild(orig);
    box.appendChild(inp);
    box.appendChild(row);
    mask.appendChild(box);
    mask.addEventListener("click", function (ev) { if (ev.target === mask) closeMask(); });
    document.body.appendChild(mask);
    setTimeout(function () { try { inp.focus(); inp.select(); } catch (e2) {} }, 40);
};
if (!window.animaMountFavBackfillBtn) {
window.animaMountFavBackfillBtn = function (host, site) {
    if (!host) return;
    host.innerHTML = "";
    host.dataset.favBackfillSite = site || "";
    var autoKey = window.animaFavAutoCacheKey(site);
    var statusUrl = site === "gel"
        ? "/gelbooru_anima/favorites/backfill_classified/status"
        : "/danbooru_anima/favorites/backfill_classified/status";
    var wrap = document.createElement("div");
    wrap.style.cssText = "padding:10px 12px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);border-radius:6px;background:rgba(var(--anima-well-rgb),.12);";
    var autoRow = document.createElement("label");
    autoRow.style.cssText = "display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;cursor:pointer;";
    var autoCb = document.createElement("input");
    autoCb.type = "checkbox";
    autoCb.checked = window.animaFavAutoCacheOn(site);
    autoCb.style.cssText = "margin-top:2px;flex-shrink:0;";
    autoCb.onchange = function () {
        try { localStorage.setItem(autoKey, autoCb.checked ? "1" : "0"); } catch (e0) {}
    };
    var autoTxt = document.createElement("span");
    autoTxt.style.cssText = "font-size:12px;color:var(--anima-ink-soft);line-height:1.45;";
    var autoTitle = document.createElement("div");
    autoTitle.textContent = animaTxt("开启默认缓存");
    autoTitle.style.cssText = "font-weight:700;color:var(--anima-ink);margin-bottom:2px;";
    var autoHint = document.createElement("div");
    autoHint.textContent = animaTxt("收藏时自动把画师、角色、系列存到本地（默认关闭）");
    autoTxt.appendChild(autoTitle);
    autoTxt.appendChild(autoHint);
    autoRow.appendChild(autoCb);
    autoRow.appendChild(autoTxt);
    wrap.appendChild(autoRow);
    var hint = document.createElement("div");
    hint.textContent = animaTxt("正在读取旧收藏…");
    hint.style.cssText = "font-size:12px;color:var(--anima-ink-soft);margin-bottom:8px;";
    wrap.appendChild(hint);
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = animaTxt("一键为旧收藏补全角色/系列标签");
    btn.style.cssText = "padding:7px 12px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi));color:#fff;cursor:pointer;font-size:12px;font-weight:700;";
    btn.onclick = function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof window.animaStartFavBackfill === "function") window.animaStartFavBackfill(site);
    };
    wrap.appendChild(btn);
    var note = document.createElement("div");
    note.textContent = animaTxt("仅处理还没有系列/角色字段的旧收藏");
    note.style.cssText = "font-size:11px;color:var(--anima-mute-dim);margin-top:6px;";
    wrap.appendChild(note);
    host.appendChild(wrap);
    fetch(statusUrl).then(function (r) { return r.json(); }).then(function (d) {
        if (!host.isConnected) return;
        var n = (d && d.success) ? (d.need || 0) : 0;
        if (n > 0) hint.textContent = animaTxt("还有 ") + n + animaTxt(" 条旧收藏缺少系列/角色标签");
        else hint.textContent = animaTxt("收藏夹图片的角色/系列/画师已全部缓存");
    }).catch(function () {});
};

window.animaStartFavBackfill = function (site) {
    if (window.__animaFavBackfillRunning) return;
    var postUrl = site === "gel"
        ? "/gelbooru_anima/favorites/backfill_classified"
        : "/danbooru_anima/favorites/backfill_classified";
    var statusUrl = site === "gel"
        ? "/gelbooru_anima/favorites/backfill_classified/status"
        : "/danbooru_anima/favorites/backfill_classified/status";
    var old = document.getElementById("anima-fav-backfill-mask");
    if (old) old.remove();
    window.__animaFavBackfillRunning = true;
    var mask = document.createElement("div");
    mask.id = "anima-fav-backfill-mask";
    mask.style.cssText = "position:fixed;inset:0;z-index:100080;background:transparent;display:flex;align-items:center;justify-content:center;";
    var box = document.createElement("div");
    box.style.cssText = "min-width:320px;max-width:92vw;padding:18px 20px;border-radius:8px;border:1px solid rgba(var(--anima-accent-rgb),.45);background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);";
    if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(box);
    var title = document.createElement("div");
    title.textContent = animaTxt("正在为旧收藏补全标签");
    title.style.cssText = "font-size:15px;font-weight:700;color:var(--anima-ink);margin-bottom:10px;";
    var msg = document.createElement("div");
    msg.textContent = animaTxt("正在读取旧收藏…");
    msg.style.cssText = "font-size:13px;color:var(--anima-ink-soft);line-height:1.5;";
    var barWrap = document.createElement("div");
    barWrap.style.cssText = "height:8px;border-radius:4px;background:rgba(var(--anima-input-rgb),.5);margin:14px 0 8px;overflow:hidden;";
    var bar = document.createElement("div");
    bar.style.cssText = "height:100%;width:0%;background:linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi));transition:width .2s ease;";
    barWrap.appendChild(bar);
    var doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.textContent = animaTxt("确定");
    doneBtn.style.cssText = "display:none;margin-top:12px;padding:7px 18px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:rgba(var(--anima-input-rgb),.86);color:var(--anima-ink-strong);cursor:pointer;font-size:13px;";
    doneBtn.onclick = function () { mask.remove(); };
    box.appendChild(title);
    box.appendChild(msg);
    box.appendChild(barWrap);
    box.appendChild(doneBtn);
    mask.appendChild(box);
    document.body.appendChild(mask);
    function finish(ok, text) {
        window.__animaFavBackfillRunning = false;
        msg.textContent = text;
        bar.style.width = "100%";
        title.textContent = ok ? "完成" : "已停止";
        doneBtn.style.display = "inline-block";
        document.querySelectorAll("[data-fav-backfill-site='" + site + "']").forEach(function (h) {
            if (typeof window.animaMountFavBackfillBtn === "function") window.animaMountFavBackfillBtn(h, site);
        });
        try {
            document.dispatchEvent(new CustomEvent("anima-fav-backfill-done", { detail: { site: site, updated: ok } }));
        } catch (e) {}
        if (window.__animaFavRefresh && typeof window.__animaFavRefresh[site] === "function") {
            try { window.__animaFavRefresh[site](); } catch (e2) {}
        }
    }
    function setProgress(done, total) {
        var t = total > 0 ? total : 0;
        var pct = t > 0 ? Math.min(100, Math.round((done / t) * 100)) : 0;
        bar.style.width = pct + "%";
        msg.textContent = t ? (animaTxt("已处理 ") + done + " / " + t) : (animaTxt("已处理 ") + done + animaTxt(" 条"));
    }
    fetch(statusUrl).then(function (r) { return r.json(); }).then(function (st) {
        var totalNeed = (st && st.need) || 0;
        var processed = 0;
        function step() {
            return fetch(postUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ limit: 80 })
            }).then(function (r) { return r.json(); }).then(function (d) {
                if (!d || !d.success) {
                    finish(false, (d && d.error) ? d.error : "补全失败");
                    return;
                }
                if (d.reason === "tag_db_unavailable") {
                    finish(false, "本地词库不可用，无法补全旧收藏");
                    return;
                }
                var updated = d.updated || 0;
                processed += updated;
                var remain = typeof d.remaining === "number" ? d.remaining : 0;
                var all = processed + remain;
                if (all > totalNeed) totalNeed = all;
                setProgress(processed, totalNeed || all);
                if (remain <= 0) {
                    finish(true, processed ? ("已为 " + processed + " 条旧收藏补上角色/系列标签") : "没有需要补全的旧收藏");
                    return;
                }
                if (updated === 0) {
                    finish(false, "没有写入新数据，已停止（还剩 " + remain + " 条）");
                    return;
                }
                return step();
            });
        }
        if (!(st && st.success)) {
            finish(false, "无法读取旧收藏状态");
            return;
        }
        if (!(totalNeed > 0)) {
            finish(true, "没有需要补全的旧收藏");
            return;
        }
        setProgress(0, totalNeed);
        return step();
    }).catch(function () {
        finish(false, "无法读取旧收藏状态");
    });
};
}

if (!window.animaMountFavThumbCache) {
window.animaMountFavThumbCache = function (host) {
    if (!host) return;
    host.innerHTML = "";
    var t = function (s) { return window.t ? window.t(s) : s; };
    var statusUrl = "/danbooru_anima/fav_thumbs/status";
    var wrap = document.createElement("div");
    wrap.style.cssText = "padding:10px 12px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);border-radius:6px;background:rgba(var(--anima-well-rgb),.12);";
    var autoRow = document.createElement("label");
    autoRow.style.cssText = "display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;cursor:pointer;";
    var autoCb = document.createElement("input");
    autoCb.type = "checkbox";
    autoCb.style.cssText = "margin-top:2px;flex-shrink:0;";
    var autoTxt = document.createElement("span");
    autoTxt.style.cssText = "font-size:12px;line-height:1.45;color:var(--anima-ink);";
    autoTxt.textContent = t("开启默认缓存缩略图");
    var autoHint = document.createElement("div");
    autoHint.style.cssText = "font-size:11px;line-height:1.4;color:var(--anima-muted);margin:0 0 10px 24px;";
    autoHint.textContent = t("新收藏的画师/标签缩略图自动存到本地（默认关闭）");
    autoRow.appendChild(autoCb);
    autoRow.appendChild(autoTxt);
    wrap.appendChild(autoRow);
    wrap.appendChild(autoHint);
    var qWrap = document.createElement("div");
    qWrap.style.cssText = "margin-bottom:10px;";
    var qLab = document.createElement("div");
    qLab.style.cssText = "font-size:12px;color:var(--anima-ink);margin-bottom:6px;";
    qLab.textContent = t("缓存画质");
    var qBtns = document.createElement("div");
    qBtns.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";
    var qHint = document.createElement("div");
    qHint.style.cssText = "font-size:11px;line-height:1.4;color:var(--anima-muted);margin-top:6px;";
    var qOpts = [
        { id: "low", lab: t("低"), hint: t("低：更糊、更省空间（默认）") },
        { id: "mid", lab: t("中"), hint: t("中：较清晰") },
        { id: "high", lab: t("高"), hint: t("高：缓存大图，接近点开「大图」时的清晰度") }
    ];
    var currentQ = "low";
    var paintQ = function () {
        var nodes = qBtns.querySelectorAll("button");
        for (var i = 0; i < nodes.length; i++) {
            var on = nodes[i].dataset.q === currentQ;
            nodes[i].style.borderColor = on ? "rgba(var(--anima-accent-rgb),.55)" : "rgba(255,255,255,.12)";
            nodes[i].style.background = on ? "rgba(var(--anima-accent-rgb),.18)" : "rgba(255,255,255,.04)";
            nodes[i].style.color = on ? "var(--anima-accent-soft)" : "var(--anima-mute)";
        }
        var hit = null;
        for (var j = 0; j < qOpts.length; j++) { if (qOpts[j].id === currentQ) hit = qOpts[j]; }
        qHint.textContent = ((hit && hit.hint) ? hit.hint + " · " : "") + t("改画质后请再点一键缓存");
    };
    for (var qi = 0; qi < qOpts.length; qi++) {
        (function (item) {
            var b = document.createElement("button");
            b.type = "button";
            b.dataset.q = item.id;
            b.textContent = item.lab;
            b.style.cssText = "padding:4px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:var(--anima-mute);cursor:pointer;font-size:12px;font-weight:700;";
            b.onclick = function () {
                fetch("/danbooru_anima/fav_thumbs/quality", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ quality: item.id })
                }).then(function (r) { return r.json(); }).then(function (d) {
                    if (!(d && d.success)) return;
                    currentQ = d.quality || item.id;
                    paintQ();
                    paintStatus(d);
                }).catch(function () {});
            };
            qBtns.appendChild(b);
        })(qOpts[qi]);
    }
    qWrap.appendChild(qLab);
    qWrap.appendChild(qBtns);
    qWrap.appendChild(qHint);
    wrap.appendChild(qWrap);
    paintQ();
    var hint = document.createElement("div");
    hint.style.cssText = "font-size:11px;line-height:1.4;color:var(--anima-muted);margin-bottom:8px;";
    hint.textContent = t("缓存收藏缩略图不会改你手裁的图");
    wrap.appendChild(hint);
    var stLine = document.createElement("div");
    stLine.style.cssText = "font-size:12px;color:var(--anima-muted);margin-bottom:8px;min-height:18px;";
    wrap.appendChild(stLine);
    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";
    var goBtn = document.createElement("button");
    goBtn.type = "button";
    goBtn.style.cssText = "padding:7px 12px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi));color:#fff;cursor:pointer;font-size:12px;font-weight:700;";
    goBtn.textContent = t("一键缓存收藏缩略图");
    var clrBtn = document.createElement("button");
    clrBtn.type = "button";
    clrBtn.style.cssText = "padding:7px 12px;border-radius:4px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:var(--anima-ink);cursor:pointer;font-size:12px;font-weight:700;";
    clrBtn.textContent = t("清理图片缓存");
    row.appendChild(goBtn);
    row.appendChild(clrBtn);
    wrap.appendChild(row);
    host.appendChild(wrap);

    var overlay = null;
    var hideOverlay = function () {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
    };
    var showOverlay = function (title) {
        hideOverlay();
        overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;";
        var box = document.createElement("div");
        box.style.cssText = "width:min(420px,92vw);background:var(--anima-panel,#1a1a22);border:1px solid rgba(var(--anima-accent-rgb),.4);border-radius:10px;padding:18px 16px;box-shadow:0 12px 40px rgba(0,0,0,.45);";
        var h = document.createElement("div");
        h.style.cssText = "font-size:14px;font-weight:600;color:var(--anima-ink);margin-bottom:10px;";
        h.textContent = title || t("正在缓存收藏缩略图");
        var barBg = document.createElement("div");
        barBg.style.cssText = "height:8px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden;";
        var barFg = document.createElement("div");
        barFg.style.cssText = "height:100%;width:0%;background:var(--anima-accent,#7c6cff);transition:width .2s;";
        barBg.appendChild(barFg);
        var msg = document.createElement("div");
        msg.style.cssText = "font-size:12px;color:var(--anima-muted);margin-top:10px;";
        box.appendChild(h);
        box.appendChild(barBg);
        box.appendChild(msg);
        overlay.appendChild(box);
        overlay._bar = barFg;
        overlay._msg = msg;
        overlay._title = h;
        document.body.appendChild(overlay);
    };
    var setProgress = function (done, total, extra) {
        var pct = total > 0 ? Math.min(100, Math.round(done * 100 / total)) : 0;
        if (overlay && overlay._bar) overlay._bar.style.width = pct + "%";
        if (overlay && overlay._msg) overlay._msg.textContent = done + " / " + total + (extra ? "  " + extra : "");
    };

    var lastTotal = 0;
    var paintStatus = function (st) {
        if (!st) { stLine.textContent = ""; return; }
        if (Object.prototype.hasOwnProperty.call(st, "auto")) autoCb.checked = !!st.auto;
        if (st.quality) { currentQ = st.quality; paintQ(); }
        var total = st.total || 0;
        var cached = st.cached || 0;
        var missing = st.need != null ? st.need : (st.missing != null ? st.missing : Math.max(0, total - cached));
        if (total > 0) lastTotal = total;
        if (total <= 0) stLine.textContent = t("没有需要缓存的收藏缩略图");
        else if (missing <= 0) stLine.textContent = t("收藏缩略图已全部缓存") + " · " + cached + "/" + total;
        else stLine.textContent = t("还有未缓存的收藏缩略图") + " · " + cached + "/" + total;
    };

    var refresh = function () {
        return fetch(statusUrl).then(function (r) { return r.json(); }).then(paintStatus).catch(function () {
            stLine.textContent = t("无法读取缓存状态");
        });
    };
    autoCb.onchange = function () {
        fetch("/danbooru_anima/fav_thumbs/auto", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ auto: !!autoCb.checked })
        }).then(function (r) { return r.json(); }).then(function (d) {
            if (d && d.success) paintStatus(d);
            else autoCb.checked = !autoCb.checked;
        }).catch(function () { autoCb.checked = !autoCb.checked; });
    };
    var afterMap = function () {
        if (window.animaFavGrid && typeof window.animaFavGrid.loadThumbMap === "function") {
            window.animaFavGrid.loadThumbMap(true).then(function () {
                if (typeof window.animaFavGrid.refreshImgs === "function") window.animaFavGrid.refreshImgs(document);
            });
        }
    };
    goBtn.onclick = function () {
        if (goBtn.disabled) return;
        goBtn.disabled = true;
        showOverlay(t("正在缓存收藏缩略图"));
        setProgress(0, lastTotal || 1);
        var first = true;
        var tick = function () {
            var body = { limit: 16 };
            if (first) { body.reset = true; first = false; }
            return fetch("/danbooru_anima/fav_thumbs/cache", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            }).then(function (r) { return r.json(); }).then(function (d) {
                if (!(d && d.success)) {
                    hideOverlay();
                    goBtn.disabled = false;
                    stLine.textContent = (d && d.error) || t("缓存失败");
                    return;
                }
                var cached = d.cached || 0;
                var remaining = (d.remaining != null) ? d.remaining : 0;
                var missing = (d.need != null) ? d.need : (d.missing != null ? d.missing : remaining);
                var total = d.total || (cached + missing) || lastTotal || 1;
                var attempted = d.attempted || 0;
                var updated = d.updated || 0;
                var exists = d.exists || 0;
                setProgress(cached, total);
                paintStatus(d);
                if (remaining > 0 && attempted > 0 && (updated > 0 || exists > 0)) return tick();
                hideOverlay();
                goBtn.disabled = false;
                paintStatus(d);
                afterMap();
                if (missing > 0 && updated <= 0 && exists <= 0) {
                    stLine.textContent = t("这批缩略图都没拉下来，已停止") + " · " + cached + "/" + total;
                } else if (missing > 0) {
                    stLine.textContent = t("部分缩略图未能缓存") + " · " + cached + "/" + total;
                }
            }).catch(function () {
                hideOverlay();
                goBtn.disabled = false;
                stLine.textContent = t("缓存失败");
            });
        };
        tick();
    };
    clrBtn.onclick = function () {
        if (!confirm(t("确定清理已缓存的收藏缩略图？下次打开会重新从网上加载。"))) return;
        fetch("/danbooru_anima/fav_thumbs/clear", { method: "POST" }).then(function (r) { return r.json(); }).then(function (d) {
            if (d && d.success) {
                stLine.textContent = t("已清理缩略图缓存");
                afterMap();
                refresh();
            } else stLine.textContent = (d && d.error) || t("清理失败");
        }).catch(function () { stLine.textContent = t("清理失败"); });
    };
    refresh();
};
}

(function () {
    function ownNode(nodeData) {
        var cat = String((nodeData && nodeData.category) || "");
        var name = String((nodeData && nodeData.name) || "");
        if (cat.indexOf("Anima") >= 0 || cat.indexOf("Danbooru") >= 0) return true;
        if (name.indexOf("Anima") === 0 || name.indexOf("Danbooru") === 0 || name.indexOf("Newbie") === 0) return true;
        return name === "TagMapper" || name === "ArtistPicker";
    }
    function ownLive(node) {
        if (!node) return false;
        var name = String(node.comfyClass || node.type || "");
        var cat = "";
        try { cat = String((node.constructor && (node.constructor.category || node.constructor.nodeData && node.constructor.nodeData.category)) || node.category || ""); } catch (e) {}
        return ownNode({ name: name, category: cat });
    }
    function retheme() {
        if (typeof window.applyAnimaNodeChrome !== "function") return;
        var nodes = [];
        try { nodes = (window.app && window.app.graph && window.app.graph._nodes) || []; } catch (e) {}
        for (var i = 0; i < nodes.length; i++) {
            if (ownLive(nodes[i])) window.applyAnimaNodeChrome(nodes[i]);
        }
        try {
            if (window.app && window.app.graph && typeof window.app.graph.setDirtyCanvas === "function")
                window.app.graph.setDirtyCanvas(true, true);
        } catch (e2) {}
    }
    function boot() {
        var app = animaApp || window.app;
        if (!app || typeof app.registerExtension !== "function" || window.__animaNodeChromeExt) return;
        window.__animaNodeChromeExt = true;
        app.registerExtension({
            name: "anima.nodeChrome",
            async beforeRegisterNodeDef(nodeType, nodeData) {
                if (!ownNode(nodeData) || !nodeType || !nodeType.prototype || nodeType.prototype._animaOwnChrome) return;
                nodeType.prototype._animaOwnChrome = true;
                if (typeof window.hookAnimaNodeChrome === "function") window.hookAnimaNodeChrome(nodeType);
                var prev = nodeType.prototype.onNodeCreated;
                nodeType.prototype.onNodeCreated = function () {
                    var r = prev ? prev.apply(this, arguments) : undefined;
                    window.applyAnimaNodeChrome(this);
                    var self = this;
                    setTimeout(function () { window.applyAnimaNodeChrome(self); }, 0);
                    return r;
                };
            },
            setup: function () { retheme(); }
        });
        document.addEventListener("anima-theme-change", retheme);
    }
    boot();
})();

