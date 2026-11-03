import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import "./00_anima_i18n.js";

function T(s) {
    return typeof window.animaTxt === "function" ? window.animaTxt(s) : (s || "");
}
function cssEsc(s) {
    if (window.CSS && typeof CSS.escape === "function") return CSS.escape(s);
    return String(s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
}
function gearIcon() {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "14");
    svg.setAttribute("height", "14");
    svg.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("fill", "currentColor");
    p.setAttribute("d", "M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.22-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.4.32.64.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.58-.22 1.12-.54 1.63-.94l2.39.96c.24.1.51 0 .64-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z");
    svg.appendChild(p);
    return svg;
}
function isBoolWidget(w) {
    if (!w || !w.name || w.hidden) return false;
    var t = String(w.type || "").toLowerCase();
    if (t === "hidden") return false;
    return t === "toggle" || t === "boolean" || t === "bool" || typeof w.value === "boolean";
}
function isBoolOutput(o) {
    if (!o) return false;
    var ty = String(o.type || "").toUpperCase();
    return ty === "BOOLEAN" || ty === "BOOL";
}
function isPureBooleanNode(n) {
    var t = String((n && (n.comfyClass || n.type)) || "");
    if (t === "PrimitiveBoolean" || t === "Boolean") return true;
    var widgets = (n && n.widgets) || [];
    var outputs = (n && n.outputs) || [];
    var has = false;
    for (var i = 0; i < widgets.length; i++) {
        var w = widgets[i];
        if (!w || w.hidden || String(w.type || "").toLowerCase() === "hidden") continue;
        if (!isBoolWidget(w)) return false;
        has = true;
    }
    for (var j = 0; j < outputs.length; j++) {
        var o = outputs[j];
        if (!o || o.type == null || o.type === "") continue;
        if (!isBoolOutput(o)) return false;
        has = true;
    }
    return has;
}
function nodeHead(n) {
    var title = String((n && n.title) || (n && (n.comfyClass || n.type)) || "").trim();
    return "#" + n.id + (title ? " " + title : "");
}

var ALWAYS = 0;
var NEVER = 2;
var BYPASS = 4;
var MANAGERS = {
    AnimaGroupIgnoreManager: { offMode: BYPASS, eventName: "anima-group-ignore-changed", switchTitle: "切换忽略" },
    AnimaGroupMuteManager: { offMode: NEVER, eventName: "anima-group-mute-changed", switchTitle: "切换禁用" }
};
var NODE_TITLES = {
    AnimaGroupIgnoreManager: "组忽略管理",
    AnimaGroupMuteManager: "组禁用管理"
};
function fixManagerTitle(node, className) {
    var want = NODE_TITLES[className];
    if (!node || !want) return;
    var cur = String(node.title || "").trim();
    var ignore = className === "AnimaGroupIgnoreManager";
    var word = ignore ? "忽略" : "禁用";
    var en = ignore ? /ignore/i : /mute/i;
    var stale = !cur || cur === className || cur === want || cur.indexOf("组" + word + "管理") >= 0;
    if (!stale && /anima/i.test(cur) && (cur.indexOf(word) >= 0 || en.test(cur))) stale = true;
    if (!stale && en.test(cur) && /group|manager|管理/i.test(cur)) stale = true;
    if (!stale) return;
    node.title = T(want);
}

function inputIndex(node, name) {
    var ins = (node && node.inputs) || [];
    for (var i = 0; i < ins.length; i++) if (ins[i] && ins[i].name === name) return i;
    return -1;
}

function releaseBoolInput(node, name) {
    if (!node || !name) return;
    var idx = inputIndex(node, name);
    if (idx < 0) return;
    try { if (node.inputs[idx] && node.inputs[idx].link != null) node.disconnectInput(idx); } catch (e) {}
    try { node.removeInput(idx); } catch (e2) {}
}

function connectBoolOutput(node, slotName, srcId, outIndex, label) {
    var src = null;
    (app.graph && app.graph._nodes || []).some(function (n) {
        if (String(n.id) === String(srcId)) { src = n; return true; }
    });
    if (!src || !src.outputs || !src.outputs[outIndex]) return false;
    var idx = inputIndex(node, slotName);
    if (idx < 0) {
        node.addInput(slotName, src.outputs[outIndex].type || "BOOLEAN");
        idx = inputIndex(node, slotName);
    }
    if (idx < 0) return false;
    try { if (node.inputs[idx] && node.inputs[idx].link != null) node.disconnectInput(idx); } catch (e) {}
    try { src.connect(outIndex, node, idx); } catch (e2) { return false; }
    if (node.inputs[idx]) node.inputs[idx].label = label || slotName;
    try { if (app.graph) app.graph.setDirtyCanvas(true, true); } catch (e3) {}
    return true;
}

function allocBoolSlot(node, groupName) {
    var used = {};
    (node.properties.groups || []).forEach(function (g) {
        if (!g || g.group_name === groupName) return;
        var b = g.parameterBinding;
        if (b && b.inputName) used[b.inputName] = true;
    });
    for (var i = 1; i <= 24; i++) {
        var name = "bool_" + i;
        if (!used[name]) return name;
    }
    return "bool_1";
}

if (!window.__animaGroupBoolHook) {
    window.__animaGroupBoolHook = true;
    api.addEventListener("anima-group-bool", function (e) {
        var d = (e && e.detail) || {};
        if (!app.graph) return;
        var node = null;
        try { node = app.graph.getNodeById(d.node_id); } catch (err) {}
        if (!node) {
            try { node = app.graph.getNodeById(Number(d.node_id)); } catch (err2) {}
        }
        if (!node) {
            node = (app.graph._nodes || []).find(function (n) { return String(n.id) === String(d.node_id); });
        }
        if (node && typeof node._agimApplyBools === "function") node._agimApplyBools(d.values || {});
    });
}
var COLOR_NAMES = ["red", "brown", "green", "blue", "pale blue", "cyan", "purple", "yellow", "black"];
var COLOR_ZH = {
    red: "红", brown: "棕", green: "绿", blue: "蓝", "pale blue": "淡蓝",
    cyan: "青", purple: "紫", yellow: "黄", black: "黑"
};

function walkNodes(nodes, fn) {
    var stack = Array.isArray(nodes) ? nodes.slice() : [nodes];
    while (stack.length) {
        var n = stack.pop();
        if (!n) continue;
        fn(n);
        if (typeof n.isSubgraphNode === "function" && n.isSubgraphNode() && n.subgraph && n.subgraph.nodes) {
            var ch = n.subgraph.nodes;
            for (var i = ch.length - 1; i >= 0; i--) stack.push(ch[i]);
        }
    }
}

function setModes(nodes, mode) {
    walkNodes(nodes, function (n) { n.mode = mode; });
}

function nodesInGroup(group) {
    try { if (group && typeof group.recomputeInsideNodes === "function") group.recomputeInsideNodes(); } catch (e) {}
    var kids = (group && (group._children || group._nodes)) || [];
    var out = [];
    Array.from(kids).forEach(function (c) {
        if (c && (c.type || c.comfyClass || (typeof LGraphNode !== "undefined" && c instanceof LGraphNode))) out.push(c);
    });
    return out;
}

function hexOf(name) {
    var key = String(name || "").trim().toLowerCase();
    if (!key) return "";
    try {
        if (typeof LGraphCanvas !== "undefined" && LGraphCanvas.node_colors) {
            var rec = LGraphCanvas.node_colors[key] || LGraphCanvas.node_colors[key.replace(/\s+/g, "_")] || LGraphCanvas.node_colors[key.replace(/\s+/g, "")];
            if (rec && rec.groupcolor) return normHex(rec.groupcolor);
        }
    } catch (e) {}
    return key.charAt(0) === "#" ? normHex(key) : "";
}

function normHex(c) {
    var s = String(c || "").replace("#", "").trim().toLowerCase();
    if (s.length === 3) s = s.replace(/(.)(.)(.)/, "$1$1$2$2$3$3");
    return s ? "#" + s : "";
}

function injectStyles() {
    var old = document.getElementById("agim-styles");
    if (old) old.remove();
    var old2 = document.getElementById("agim-styles-v2");
    if (old2) old2.remove();
    var old3 = document.getElementById("agim-styles-v3");
    if (old3) old3.remove();
    if (document.getElementById("agim-styles-v4")) return;
    var s = document.createElement("style");
    s.id = "agim-styles-v4";
    s.textContent = [
        ".agim-host,.agim-host>*{overflow:hidden!important;max-width:100%!important;max-height:100%!important;box-sizing:border-box!important;}",
        ".agim-wrap{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;max-width:100%;max-height:100%;overflow:hidden;box-sizing:border-box;contain:layout paint;font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#fff;font-size:12px;font-weight:600;",
        "background:radial-gradient(ellipse 80% 50% at 100% -8%,rgba(var(--anima-glow-core-rgb),.38) 0%,transparent 56%),linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 74%);",
        "border:1px solid rgba(var(--anima-accent-rgb),.42);border-radius:12px;box-shadow:inset 0 1px 0 rgba(255,255,255,.16);}",
        ".agim-toolbar{display:flex;align-items:center;gap:6px;padding:8px 8px 6px;flex-shrink:0;min-width:0;}",
        ".agim-seg{display:flex;padding:2px;border-radius:8px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.12);flex-shrink:0;}",
        ".agim-seg button{border:0;background:transparent;color:var(--anima-mute,#9aa3ad);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;}",
        ".agim-seg button.on{background:rgba(var(--anima-accent-rgb),.24);color:var(--anima-accent-soft,#d7c6ff);}",
        ".agim-spacer{flex:1;min-width:4px;}",
        ".agim-iconbtn{width:28px;height:28px;flex-shrink:0;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:var(--anima-accent-soft,#d7c6ff);cursor:pointer;font-size:14px;line-height:1;}",
        ".agim-iconbtn:hover{background:rgba(var(--anima-accent-rgb),.18);}",
        ".agim-dots{display:flex;flex-wrap:wrap;gap:7px;align-items:center;padding:0 10px 8px;flex-shrink:0;min-width:0;max-width:100%;overflow:hidden;box-sizing:border-box;}",
        ".agim-dot{width:13px;height:13px;border-radius:50%;border:2px solid rgba(0,0,0,.35);cursor:pointer;box-sizing:border-box;flex-shrink:0;padding:0;}",
        ".agim-dot.on{outline:2px solid rgba(255,255,255,.92);outline-offset:1px;}",
        ".agim-all{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:transparent;color:var(--anima-mute,#9aa3ad);cursor:pointer;flex-shrink:0;}",
        ".agim-all.on{color:var(--anima-accent-soft,#d7c6ff);border-color:rgba(var(--anima-accent-rgb),.5);background:rgba(var(--anima-accent-rgb),.14);}",
        ".agim-list{flex:1 1 auto;min-height:0;overflow:auto;padding:0 8px 8px;display:flex;flex-direction:column;gap:5px;scrollbar-width:thin;scrollbar-color:var(--anima-accent,#8b6cc9) transparent;}",
        ".agim-list::-webkit-scrollbar{width:6px;}",
        ".agim-list::-webkit-scrollbar-thumb{background:var(--anima-accent,#8b6cc9);border-radius:8px;}",
        ".agim-empty{opacity:.55;padding:22px 8px;text-align:center;font-weight:500;}",
        ".agim-row{display:grid;grid-template-columns:4px 12px minmax(0,1fr) 26px 40px;align-items:center;gap:6px;padding:6px 8px 6px 6px;border-radius:9px;background:rgba(8,10,14,.48);border:1px solid rgba(255,255,255,.08);min-width:0;box-sizing:border-box;}",
        ".agim-row.over{border-color:rgba(var(--anima-accent-rgb),.7);background:rgba(var(--anima-accent-rgb),.12);}",
        ".agim-stripe{width:4px;height:18px;border-radius:4px;background:var(--agim-gc,rgba(255,255,255,.22));}",
        ".agim-handle{cursor:grab;opacity:.4;user-select:none;font-size:10px;letter-spacing:-1px;color:#fff;}",
        ".agim-handle:active{cursor:grabbing;}",
        ".agim-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;font-weight:700;}",
        ".agim-name:hover{color:var(--anima-accent-soft,#d7c6ff);}",
        ".agim-sw{width:36px;height:20px;border-radius:999px;border:0;background:rgba(255,255,255,.16);position:relative;cursor:pointer;padding:0;}",
        ".agim-sw.on{background:linear-gradient(180deg,var(--anima-accent-mid,#8b6cc9),var(--anima-accent-hi,#a888e0));}",
        ".agim-sw i{position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#fff;transition:left .14s ease;pointer-events:none;}",
        ".agim-sw.on i{left:19px;}",
        ".agim-ico{width:24px;height:24px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;border-radius:7px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:rgba(255,255,255,.88);cursor:pointer;padding:0;}",
        ".agim-ico svg{display:block;pointer-events:none;}",
        ".agim-ico:hover{color:var(--anima-accent-soft,#d7c6ff);border-color:rgba(var(--anima-accent-rgb),.55);background:rgba(var(--anima-accent-rgb),.22);}",
        ".agim-ico.on{color:var(--anima-accent-soft,#d7c6ff);border-color:rgba(var(--anima-accent-rgb),.7);background:rgba(var(--anima-accent-rgb),.28);}",
        ".agim-dlg-mask{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;}",
        ".agim-dlg{width:min(420px,92vw);max-height:80vh;overflow:auto;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 74%);color:#fff;border:1px solid rgba(var(--anima-accent-rgb),.42);border-radius:14px;padding:14px;box-shadow:0 22px 50px rgba(0,0,0,.55);box-sizing:border-box;}",
        ".agim-dlg h3{margin:0 0 10px;font-size:14px;}",
        ".agim-sec{margin:10px 0;padding:8px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:rgba(8,10,14,.28);}",
        ".agim-sec-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-weight:700;}",
        ".agim-rule{display:flex;gap:6px;margin:4px 0;min-width:0;}",
        ".agim-rule select{flex:1;min-width:0;background:rgba(8,10,14,.88);color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:8px;padding:5px;}",
        ".agim-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:12px;}",
        ".agim-foot button{padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;}",
        ".agim-foot .pri{background:linear-gradient(180deg,var(--anima-accent-mid,#8b6cc9),var(--anima-accent-hi,#a888e0));border:0;font-weight:800;}",
        ".agim-bindsel{width:100%;box-sizing:border-box;margin-top:6px;background:rgba(8,10,14,.88);color:var(--anima-ink,#fff);border:1px solid rgba(var(--anima-line-soft-rgb),.42);border-radius:8px;padding:5px;}",
        ".agim-hint{margin-top:6px;font-size:11px;font-weight:500;color:var(--anima-mute,#9aa3ad);line-height:1.4;}"
    ].join("");
    document.head.appendChild(s);
}

function defaultCfg(name, enabled) {
    return {
        group_name: name,
        enabled: !!enabled,
        linkage: { on_enable: [], on_disable: [] },
        parameterBinding: { enabled: false, kind: "widget", nodeId: "", paramName: "", outputIndex: 0, outputName: "", inputName: "", mapping: "normal", syncMode: "bidirectional" }
    };
}

app.registerExtension({
    name: "anima.groupIgnoreManager",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        var spec = MANAGERS[nodeData.name];
        if (!spec) return;
        nodeData.display_name = NODE_TITLES[nodeData.name];

        var onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            var r = onCreated ? onCreated.apply(this, arguments) : undefined;
            fixManagerTitle(this, nodeData.name);
            this.properties = this.properties || {};
            this.properties.groups = this.properties.groups || [];
            this.properties.selectedColorFilter = this.properties.selectedColorFilter || "";
            this.properties.groupOrder = this.properties.groupOrder || [];
            this.properties.managerMode = this.properties.managerMode || "color";
            this.properties.customManagedGroups = this.properties.customManagedGroups || [];
            this.properties.customGroupOrder = this.properties.customGroupOrder || [];
            this.properties.groupStatesCache = this.properties.groupStatesCache || {};
            this._agimId = "agim_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
            this._agimStack = new Set();
            this._agimRef = typeof WeakMap === "function" ? new WeakMap() : null;
            this._agimBusy = false;
            this.size = [320, 360];
            this._agimBuild();
            var _onR = this.onResize;
            this.onResize = function (sz) {
                if (sz) {
                    if (sz[0] < 260) sz[0] = 260;
                    if (sz[1] < 180) sz[1] = 180;
                }
                if (_onR) _onR.apply(this, arguments);
                this._agimFit();
            };
            var self = this;
            this._agimOnEvt = function (e) {
                if (!e.detail || e.detail.sourceId === self._agimId) return;
                if (e.detail.groupName != null) self._agimPaintSwitch(e.detail.groupName, e.detail.enabled);
                else self._agimRender();
            };
            window.addEventListener(spec.eventName, this._agimOnEvt);
            this._agimTimer = setInterval(function () { self._agimTick(); }, 500);
            setTimeout(function () { self._agimRender(); self._agimFit(); fixManagerTitle(self, nodeData.name); }, 200);
            return r;
        };
        if (!nodeType.prototype._agimTitleHooked) {
            nodeType.prototype._agimTitleHooked = true;
            var prevConfigure = nodeType.prototype.configure;
            var titleClass = nodeData.name;
            nodeType.prototype.configure = function () {
                if (this._agimInConfigure) return;
                this._agimInConfigure = true;
                try {
                    var r = (typeof prevConfigure === "function") ? prevConfigure.apply(this, arguments) : undefined;
                    fixManagerTitle(this, titleClass);
                    return r;
                } finally {
                    this._agimInConfigure = false;
                }
            };
        }

        nodeType.prototype._agimBuild = function () {
            injectStyles();
            var self = this;
            var wrap = el("div", "agim-wrap");
            wrap.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
            wrap.addEventListener("wheel", function (e) { e.stopPropagation(); }, { passive: true });

            var bar = el("div", "agim-toolbar");
            var seg = el("div", "agim-seg");
            var btnColor = el("button", "on", T("按颜色"));
            var btnCustom = el("button", "", T("自定义"));
            btnColor.addEventListener("click", function () {
                self.properties.managerMode = "color";
                self._agimSyncHead();
                self._agimRender();
            });
            btnCustom.addEventListener("click", function () {
                self.properties.managerMode = "custom";
                self._agimSyncHead();
                self._agimRender();
            });
            seg.appendChild(btnColor);
            seg.appendChild(btnCustom);
            this._agimBtnColor = btnColor;
            this._agimBtnCustom = btnCustom;
            bar.appendChild(seg);
            bar.appendChild(el("div", "agim-spacer"));

            var addBtn = el("button", "agim-iconbtn", "+");
            addBtn.title = T("添加组");
            addBtn.addEventListener("click", function (e) { self._agimAddMenu(e); });
            this._agimAddBtn = addBtn;
            bar.appendChild(addBtn);

            var refBtn = el("button", "agim-iconbtn", "↻");
            refBtn.title = T("刷新");
            refBtn.addEventListener("click", function () { self._agimFillColors(); self._agimRender(); });
            bar.appendChild(refBtn);

            var dots = el("div", "agim-dots");
            this._agimDots = dots;

            var list = el("div", "agim-list");
            this._agimList = list;
            wrap.appendChild(bar);
            wrap.appendChild(dots);
            wrap.appendChild(list);

            var wdg = this.addDOMWidget("agim_ui", "div", wrap, {
                onDraw: function () { self._agimFit(); }
            });
            this._agimWdg = wdg;
            this._agimRoot = wrap;
            if (wdg && wdg.element) wdg.element.classList.add("agim-host");
            this._agimSyncHead();
            this._agimFillColors();
            this._agimFit();
        };

        nodeType.prototype._agimFit = function () {
            var wrap = this._agimRoot;
            if (!wrap) return;
            var title = 30;
            try {
                if (typeof LiteGraph !== "undefined" && LiteGraph.NODE_TITLE_HEIGHT) title = LiteGraph.NODE_TITLE_HEIGHT;
            } catch (e) {}
            var nw = Math.max(80, (this.size && this.size[0] ? this.size[0] : 320) - 20);
            var nh = Math.max(72, (this.size && this.size[1] ? this.size[1] : 280) - title - 16);
            wrap.style.width = nw + "px";
            wrap.style.height = nh + "px";
            wrap.style.maxWidth = nw + "px";
            wrap.style.maxHeight = nh + "px";
            var host = wrap.parentElement;
            if (host) {
                host.classList.add("agim-host");
                host.style.overflow = "hidden";
                host.style.maxWidth = "100%";
                host.style.maxHeight = "100%";
                host.style.boxSizing = "border-box";
            }
        };

        nodeType.prototype._agimSyncHead = function () {
            var custom = (this.properties.managerMode || "color") === "custom";
            if (this._agimBtnColor) this._agimBtnColor.classList.toggle("on", !custom);
            if (this._agimBtnCustom) this._agimBtnCustom.classList.toggle("on", custom);
            if (this._agimDots) this._agimDots.style.display = custom ? "none" : "flex";
            if (this._agimAddBtn) this._agimAddBtn.style.display = custom ? "inline-flex" : "none";
            this._agimFit();
        };

        nodeType.prototype._agimFillColors = function () {
            var row = this._agimDots;
            if (!row) return;
            var cur = this.properties.selectedColorFilter || "";
            var self = this;
            row.innerHTML = "";
            var all = el("button", "agim-all" + (cur ? "" : " on"), T("全部"));
            all.addEventListener("click", function () {
                self.properties.selectedColorFilter = "";
                self._agimFillColors();
                self._agimRender();
            });
            row.appendChild(all);
            COLOR_NAMES.forEach(function (name) {
                var b = el("button", "agim-dot" + (cur === name ? " on" : ""));
                b.title = T(COLOR_ZH[name] || name);
                var hx = hexOf(name) || "#888";
                b.style.background = hx;
                b.addEventListener("click", function () {
                    self.properties.selectedColorFilter = name;
                    self._agimFillColors();
                    self._agimRender();
                });
                row.appendChild(b);
            });
        };

        nodeType.prototype._agimGroups = function () {
            if (!app.graph || !app.graph._groups) return [];
            return app.graph._groups.filter(function (g) { return g && g.title; });
        };

        nodeType.prototype._agimEnabled = function (group) {
            var nodes = nodesInGroup(group);
            var on = false;
            walkNodes(nodes, function (n) { if (n && n.mode === ALWAYS) on = true; });
            return on;
        };

        nodeType.prototype._agimSort = function (groups, order) {
            if (!groups || !groups.length) return [];
            if (!order || !order.length) {
                return groups.slice().sort(function (a, b) { return String(a.title).localeCompare(String(b.title), "zh-CN"); });
            }
            var map = {};
            order.forEach(function (n, i) { map[n] = i; });
            var known = [], rest = [];
            groups.forEach(function (g) {
                if (Object.prototype.hasOwnProperty.call(map, g.title)) known.push(g);
                else rest.push(g);
            });
            known.sort(function (a, b) { return map[a.title] - map[b.title]; });
            rest.sort(function (a, b) { return String(a.title).localeCompare(String(b.title), "zh-CN"); });
            return known.concat(rest);
        };

        nodeType.prototype._agimCfg = function (title, enabled) {
            var list = this.properties.groups || (this.properties.groups = []);
            var found = list.find(function (g) { return g.group_name === title; });
            if (!found) {
                found = defaultCfg(title, enabled);
                list.push(found);
            } else if (!this._agimBusy && found.enabled !== enabled) {
                found.enabled = enabled;
            }
            if (!found.linkage) found.linkage = { on_enable: [], on_disable: [] };
            if (!found.parameterBinding) found.parameterBinding = defaultCfg(title, enabled).parameterBinding;
            return found;
        };

        nodeType.prototype._agimDisplayGroups = function () {
            var all = this._agimGroups();
            if ((this.properties.managerMode || "color") === "custom") {
                var names = (this.properties.customManagedGroups || []).filter(function (n) {
                    return all.some(function (g) { return g.title === n; });
                });
                if (names.length !== (this.properties.customManagedGroups || []).length) {
                    this.properties.customManagedGroups = names;
                    this.properties.customGroupOrder = (this.properties.customGroupOrder || []).filter(function (n) { return names.indexOf(n) >= 0; });
                }
                return this._agimSort(all.filter(function (g) { return names.indexOf(g.title) >= 0; }), this.properties.customGroupOrder);
            }
            var sorted = this._agimSort(all, this.properties.groupOrder);
            var filter = this.properties.selectedColorFilter;
            if (!filter) return sorted;
            var want = hexOf(filter);
            if (!want) return sorted;
            return sorted.filter(function (g) { return g.color && normHex(g.color) === want; });
        };

        nodeType.prototype._agimRender = function () {
            var list = this._agimList;
            if (!list) return;
            list.innerHTML = "";
            var groups = this._agimDisplayGroups();
            if (!groups.length) {
                list.appendChild(el("div", "agim-empty", T("画布上没有可管理的组")));
                return;
            }
            var self = this;
            groups.forEach(function (g) {
                var on = self._agimEnabled(g);
                var cfg = self._agimCfg(g.title, on);
                if (self._agimRef) self._agimRef.set(g, g.title);
                list.appendChild(self._agimRow(cfg, g));
            });
            this.properties.groups = (this.properties.groups || []).filter(function (c) {
                return self._agimGroups().some(function (g) { return g.title === c.group_name; });
            });
            this._agimFit();
        };

        nodeType.prototype._agimRow = function (cfg, group) {
            var row = el("div", "agim-row");
            row.dataset.groupName = cfg.group_name;
            var stripe = el("div", "agim-stripe");
            if (group && group.color) stripe.style.setProperty("--agim-gc", group.color);
            var handle = el("span", "agim-handle", "⋮⋮");
            handle.draggable = true;
            var name = el("span", "agim-name", cfg.group_name);
            name.title = T("跳转到组") + " · " + cfg.group_name;
            var sw = el("button", "agim-sw" + (cfg.enabled ? " on" : ""));
            sw.appendChild(el("i"));
            sw.title = T(spec.switchTitle);
            var self = this;
            sw.addEventListener("click", function (e) {
                e.stopPropagation();
                self._agimToggle(cfg.group_name, !cfg.enabled);
            });
            var linked = !!(cfg.linkage && ((cfg.linkage.on_enable || []).length || (cfg.linkage.on_disable || []).length)) || !!(cfg.parameterBinding && cfg.parameterBinding.enabled);
            var link = el("button", "agim-ico" + (linked ? " on" : ""));
            link.appendChild(gearIcon());
            link.title = T("联动");
            link.setAttribute("aria-label", T("联动"));
            link.addEventListener("click", function (e) {
                e.stopPropagation();
                self._agimDialog(cfg);
            });
            name.addEventListener("dblclick", function (e) {
                e.stopPropagation();
                self._agimJump(cfg.group_name);
            });
            row.appendChild(stripe);
            row.appendChild(handle);
            row.appendChild(name);
            row.appendChild(link);
            row.appendChild(sw);
            handle.addEventListener("dragstart", function (e) {
                e.stopPropagation();
                self._agimDrag = cfg.group_name;
                row.style.opacity = "0.55";
                try { e.dataTransfer.setData("text/plain", cfg.group_name); } catch (err) {}
            });
            row.addEventListener("dragover", function (e) { e.preventDefault(); e.stopPropagation(); });
            row.addEventListener("dragenter", function (e) { e.preventDefault(); row.classList.add("over"); });
            row.addEventListener("dragleave", function () { row.classList.remove("over"); });
            row.addEventListener("drop", function (e) {
                e.preventDefault();
                e.stopPropagation();
                row.classList.remove("over");
                self._agimReorder(self._agimDrag, cfg.group_name);
                self._agimRender();
            });
            handle.addEventListener("dragend", function () {
                row.style.opacity = "";
                self._agimDrag = null;
            });
            if ((this.properties.managerMode || "color") === "custom") {
                row.addEventListener("contextmenu", function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    new LiteGraph.ContextMenu([{
                        content: T("从列表移除"),
                        callback: function () {
                            self.properties.customManagedGroups = (self.properties.customManagedGroups || []).filter(function (n) { return n !== cfg.group_name; });
                            self.properties.customGroupOrder = (self.properties.customGroupOrder || []).filter(function (n) { return n !== cfg.group_name; });
                            self._agimRender();
                        }
                    }], { event: e, node: self });
                });
            }
            return row;
        };

        nodeType.prototype._agimPaintSwitch = function (name, enabled) {
            var row = this._agimList && this._agimList.querySelector('.agim-row[data-group-name="' + cssEsc(name) + '"]');
            if (!row) return;
            var sw = row.querySelector(".agim-sw");
            if (!sw) return;
            if (enabled) sw.classList.add("on");
            else sw.classList.remove("on");
        };

        nodeType.prototype._agimReorder = function (drag, target) {
            if (!drag || !target || drag === target) return;
            var custom = (this.properties.managerMode || "color") === "custom";
            var key = custom ? "customGroupOrder" : "groupOrder";
            var names = this._agimDisplayGroups().map(function (g) { return g.title; });
            var di = names.indexOf(drag), ti = names.indexOf(target);
            if (di < 0 || ti < 0) return;
            names.splice(di, 1);
            names.splice(di < ti ? ti - 1 : ti, 0, drag);
            this.properties[key] = names;
        };

        nodeType.prototype._agimToggle = function (name, enable) {
            if (this._agimStack.has(name)) return;
            var group = this._agimGroups().find(function (g) { return g.title === name; });
            if (!group) return;
            var nodes = nodesInGroup(group);
            if (!nodes.length) return;
            this._agimStack.add(name);
            this._agimBusy = true;
            try {
                setModes(nodes, enable ? ALWAYS : spec.offMode);
                var cfg = (this.properties.groups || []).find(function (g) { return g.group_name === name; });
                if (cfg) cfg.enabled = enable;
                this.properties.groupStatesCache[name] = enable;
                this._agimApplyLink(name, enable);
                this._agimPaintSwitch(name, enable);
                this._agimFixOthers(name);
                if (app.graph) app.graph.setDirtyCanvas(true, true);
                window.dispatchEvent(new CustomEvent(spec.eventName, {
                    detail: { sourceId: this._agimId, groupName: name, enabled: enable }
                }));
                if (!this._agimFromParam && cfg && cfg.parameterBinding && cfg.parameterBinding.enabled && cfg.parameterBinding.kind !== "output" && (cfg.parameterBinding.syncMode || "bidirectional") === "bidirectional") {
                    this._agimWriteParam(cfg, enable);
                }
            } finally {
                this._agimStack.delete(name);
                this._agimBusy = false;
            }
        };

        nodeType.prototype._agimFixOthers = function (except) {
            var self = this;
            (this.properties.groups || []).forEach(function (cfg) {
                if (cfg.group_name === except) return;
                var g = self._agimGroups().find(function (x) { return x.title === cfg.group_name; });
                if (!g) return;
                var on = self._agimEnabled(g);
                if (cfg.enabled !== on) {
                    cfg.enabled = on;
                    self.properties.groupStatesCache[cfg.group_name] = on;
                    self._agimPaintSwitch(cfg.group_name, on);
                }
            });
        };

        nodeType.prototype._agimApplyLink = function (name, enabled) {
            var cfg = (this.properties.groups || []).find(function (g) { return g.group_name === name; });
            if (!cfg || !cfg.linkage) return;
            var rules = enabled ? cfg.linkage.on_enable : cfg.linkage.on_disable;
            if (!rules || !rules.length) return;
            var self = this;
            rules.forEach(function (rule) {
                if (!rule || !rule.target_group) return;
                self._agimToggle(rule.target_group, rule.action === "enable");
            });
        };

        nodeType.prototype._agimJump = function (name) {
            var group = this._agimGroups().find(function (g) { return g.title === name; });
            if (!group || !app.canvas) return;
            try { app.canvas.centerOnNode(group); } catch (e) {}
            try { app.canvas.setDirty(true, true); } catch (e2) {}
        };

        nodeType.prototype._agimAddMenu = function (e) {
            var managed = new Set(this.properties.customManagedGroups || []);
            var avail = this._agimGroups().filter(function (g) { return !managed.has(g.title); })
                .sort(function (a, b) { return String(a.title).localeCompare(String(b.title), "zh-CN"); });
            if (!avail.length) return;
            var self = this;
            new LiteGraph.ContextMenu(avail.map(function (g) {
                return {
                    content: g.title,
                    callback: function () {
                        self.properties.customManagedGroups = self.properties.customManagedGroups || [];
                        self.properties.customGroupOrder = self.properties.customGroupOrder || [];
                        if (self.properties.customManagedGroups.indexOf(g.title) < 0) self.properties.customManagedGroups.push(g.title);
                        if (self.properties.customGroupOrder.indexOf(g.title) < 0) self.properties.customGroupOrder.push(g.title);
                        self._agimRender();
                    }
                };
            }), { event: e, title: T("添加组"), node: this });
        };

        nodeType.prototype._agimDialog = function (cfg) {
            var mask = el("div", "agim-dlg-mask");
            var box = el("div", "agim-dlg");
            box.appendChild(el("h3", "", T("联动配置") + "：" + cfg.group_name));
            var temp = JSON.parse(JSON.stringify(cfg));
            if (!temp.linkage) temp.linkage = { on_enable: [], on_disable: [] };
            var self = this;

            function paintRules(host, type) {
                host.innerHTML = "";
                (temp.linkage[type] || []).forEach(function (rule, idx) {
                    var row = el("div", "agim-rule");
                    var gs = el("select");
                    self._agimGroups().filter(function (g) { return g.title !== temp.group_name; }).forEach(function (g) {
                        var o = new Option(g.title, g.title);
                        if (g.title === rule.target_group) o.selected = true;
                        gs.appendChild(o);
                    });
                    if (!rule.target_group && gs.options.length) rule.target_group = gs.value;
                    gs.addEventListener("change", function () { rule.target_group = gs.value; });
                    var as = el("select");
                    as.appendChild(new Option(T("开启"), "enable"));
                    as.appendChild(new Option(T("关闭"), "disable"));
                    as.value = rule.action === "disable" ? "disable" : "enable";
                    as.addEventListener("change", function () { rule.action = as.value; });
                    var del = el("button", "", "×");
                    del.addEventListener("click", function () {
                        temp.linkage[type].splice(idx, 1);
                        paintRules(host, type);
                    });
                    row.appendChild(gs);
                    row.appendChild(as);
                    row.appendChild(del);
                    host.appendChild(row);
                });
            }

            function section(title, type) {
                var sec = el("div", "agim-sec");
                var h = el("div", "agim-sec-h");
                h.appendChild(el("span", "", title));
                var plus = el("button", "", "+");
                var body = el("div");
                plus.addEventListener("click", function () {
                    var first = self._agimGroups().find(function (g) { return g.title !== temp.group_name; });
                    temp.linkage[type] = temp.linkage[type] || [];
                    temp.linkage[type].push({ target_group: first ? first.title : "", action: "enable" });
                    paintRules(body, type);
                });
                h.appendChild(plus);
                sec.appendChild(h);
                sec.appendChild(body);
                paintRules(body, type);
                return sec;
            }

            box.appendChild(section(T("组开启时"), "on_enable"));
            box.appendChild(section(T("组关闭时"), "on_disable"));

            var bindSec = el("div", "agim-sec");
            bindSec.appendChild(el("div", "agim-sec-h", T("参数绑定")));
            var enLab = el("label");
            var enCk = document.createElement("input");
            enCk.type = "checkbox";
            enCk.checked = !!(temp.parameterBinding && temp.parameterBinding.enabled);
            enLab.appendChild(enCk);
            enLab.appendChild(document.createTextNode(" " + T("用布尔值控制这个组")));
            bindSec.appendChild(enLab);
            var bindBody = el("div");
            bindBody.style.display = enCk.checked ? "block" : "none";
            var paramSel = el("select", "agim-bindsel");
            var otherSel = el("select", "agim-bindsel");
            otherSel.style.marginLeft = "12px";
            otherSel.style.width = "calc(100% - 12px)";
            this._agimFillParams(paramSel, otherSel, temp.parameterBinding);
            var mapSel = el("select", "agim-bindsel");
            mapSel.appendChild(new Option(T("参数为真 → 组开启"), "normal"));
            mapSel.appendChild(new Option(T("参数为真 → 组关闭"), "inverse"));
            mapSel.value = (temp.parameterBinding && temp.parameterBinding.mapping) || "normal";
            var syncSel = el("select", "agim-bindsel");
            syncSel.appendChild(new Option(T("双向同步"), "bidirectional"));
            syncSel.appendChild(new Option(T("单向同步（参数→组）"), "unidirectional"));
            syncSel.value = (temp.parameterBinding && temp.parameterBinding.syncMode) || "bidirectional";
            var hint = el("div", "agim-hint", "");
            function parsedPick() {
                var raw = paramSel.value === "__other__" ? otherSel.value : paramSel.value;
                if (!raw || raw === "__other__") return null;
                try { return JSON.parse(raw); } catch (err) { return null; }
            }
            function refreshHint() {
                var picked = parsedPick();
                if (picked && picked.kind === "output") {
                    hint.textContent = T("这个布尔是算出来的，要等这一次排队跑完，开关才会跟着变。");
                    syncSel.value = "unidirectional";
                    syncSel.disabled = true;
                } else {
                    hint.textContent = picked ? T("这个开关会跟着布尔值马上变。") : "";
                    syncSel.disabled = false;
                }
            }
            paramSel.addEventListener("change", function () {
                otherSel.style.display = paramSel.value === "__other__" ? "block" : "none";
                refreshHint();
            });
            otherSel.addEventListener("change", refreshHint);
            refreshHint();
            bindBody.appendChild(paramSel);
            bindBody.appendChild(otherSel);
            bindBody.appendChild(mapSel);
            bindBody.appendChild(syncSel);
            bindBody.appendChild(hint);
            enCk.addEventListener("change", function () { bindBody.style.display = enCk.checked ? "block" : "none"; });
            bindSec.appendChild(bindBody);
            box.appendChild(bindSec);

            var foot = el("div", "agim-foot");
            var cancel = el("button", "", T("取消"));
            var save = el("button", "pri", T("保存"));
            cancel.addEventListener("click", function () { mask.remove(); });
            save.addEventListener("click", function () {
                var orig = (self.properties.groups || []).find(function (g) { return g.group_name === cfg.group_name; });
                if (orig) {
                    orig.linkage = temp.linkage;
                    var prev = orig.parameterBinding || {};
                    var picked = parsedPick();
                    var bind = {
                        enabled: !!enCk.checked,
                        kind: picked && picked.kind === "output" ? "output" : "widget",
                        nodeId: picked ? String(picked.nodeId || "") : "",
                        paramName: picked && picked.paramName ? picked.paramName : "",
                        outputIndex: picked && picked.outputIndex != null ? picked.outputIndex : 0,
                        outputName: picked && picked.outputName ? picked.outputName : "",
                        inputName: "",
                        mapping: mapSel.value,
                        syncMode: syncSel.value
                    };
                    if (!enCk.checked) bind.kind = "widget";
                    if (bind.kind === "output") bind.syncMode = "unidirectional";
                    if (prev.inputName && (bind.kind !== "output" || !bind.enabled)) releaseBoolInput(self, prev.inputName);
                    if (bind.enabled && bind.kind === "output") {
                        bind.inputName = prev.kind === "output" && prev.inputName ? prev.inputName : allocBoolSlot(self, cfg.group_name);
                        connectBoolOutput(self, bind.inputName, bind.nodeId, bind.outputIndex, cfg.group_name);
                    }
                    orig.parameterBinding = bind;
                }
                mask.remove();
                self._agimRender();
            });
            foot.appendChild(cancel);
            foot.appendChild(save);
            box.appendChild(foot);
            mask.appendChild(box);
            mask.addEventListener("click", function (e) { if (e.target === mask) mask.remove(); });
            document.body.appendChild(mask);
        };

        nodeType.prototype._agimFillParams = function (sel, otherSel, binding) {
            sel.innerHTML = "";
            otherSel.innerHTML = "";
            otherSel.style.display = "none";
            sel.appendChild(new Option(T("（不绑定）"), ""));
            otherSel.appendChild(new Option(T("（选择节点）"), ""));
            var self = this;
            var primary = [];
            var misc = [];
            function idNum(n) {
                var v = Number(n && n.id);
                return isFinite(v) ? v : 0;
            }
            function consider(n) {
                if (!n || n === self) return;
                var head = nodeHead(n);
                var boolWidgets = [];
                (n.widgets || []).forEach(function (w) { if (isBoolWidget(w)) boolWidgets.push(w); });
                var bucket = isPureBooleanNode(n) ? primary : misc;
                if (boolWidgets.length) {
                    boolWidgets.forEach(function (w) {
                        bucket.push({
                            idNum: idNum(n),
                            label: head + " · " + (w.label || w.name),
                            payload: { kind: "widget", nodeId: String(n.id), paramName: w.name },
                            selected: !!(binding && binding.kind !== "output" && String(binding.nodeId) === String(n.id) && binding.paramName === w.name)
                        });
                    });
                    return;
                }
                (n.outputs || []).forEach(function (o, idx) {
                    if (!isBoolOutput(o)) return;
                    bucket.push({
                        idNum: idNum(n),
                        label: head + " · " + (o.label || o.name || "BOOLEAN"),
                        payload: { kind: "output", nodeId: String(n.id), outputIndex: idx, outputName: o.name || "BOOLEAN" },
                        selected: !!(binding && binding.kind === "output" && String(binding.nodeId) === String(n.id) && Number(binding.outputIndex) === idx)
                    });
                });
            }
            (app.graph._nodes || []).forEach(consider);
            function byId(a, b) {
                if (a.idNum !== b.idNum) return a.idNum - b.idNum;
                return String(a.label).localeCompare(String(b.label));
            }
            primary.sort(byId);
            misc.sort(byId);
            var pickedOther = false;
            function addOpt(target, item) {
                var opt = new Option(item.label, JSON.stringify(item.payload));
                opt.title = item.label;
                if (item.selected) {
                    opt.selected = true;
                    if (target === otherSel) pickedOther = true;
                }
                target.appendChild(opt);
            }
            primary.forEach(function (item) { addOpt(sel, item); });
            misc.forEach(function (item) { addOpt(otherSel, item); });
            if (misc.length) {
                var otherOpt = new Option(T("其他"), "__other__");
                if (pickedOther) otherOpt.selected = true;
                sel.appendChild(otherOpt);
            }
            otherSel.style.display = pickedOther ? "block" : "none";
        };

        nodeType.prototype._agimFindWidget = function (nodeId, name) {
            var n = (app.graph._nodes || []).find(function (x) { return String(x.id) === String(nodeId); });
            if (!n || !n.widgets) return null;
            return n.widgets.find(function (w) { return w.name === name; }) || null;
        };

        nodeType.prototype._agimApplyBools = function (values) {
            var self = this;
            (this.properties.groups || []).forEach(function (cfg) {
                var b = cfg.parameterBinding;
                if (!b || !b.enabled || b.kind !== "output" || !b.inputName) return;
                if (!values || !Object.prototype.hasOwnProperty.call(values, b.inputName)) return;
                var on = !!values[b.inputName];
                if (b.mapping === "inverse") on = !on;
                if (!!cfg.enabled !== on) self._agimToggle(cfg.group_name, on);
            });
        };

        nodeType.prototype._agimWriteParam = function (cfg, enable) {
            var b = cfg.parameterBinding;
            if (!b || !b.enabled || b.kind === "output") return;
            var w = this._agimFindWidget(b.nodeId, b.paramName);
            if (!w) return;
            var val = b.mapping === "inverse" ? !enable : enable;
            if (w.value !== val) {
                w.value = val;
                if (typeof w.callback === "function") try { w.callback(val); } catch (e) {}
            }
        };

        nodeType.prototype._agimTick = function () {
            if (!this._agimList || this._agimBusy) return;
            var self = this;
            if (this._agimRef) {
                this._agimGroups().forEach(function (g) {
                    var old = self._agimRef.get(g);
                    if (old && old !== g.title) {
                        (self.properties.groups || []).forEach(function (c) {
                            if (c.group_name === old) c.group_name = g.title;
                            ["on_enable", "on_disable"].forEach(function (k) {
                                (c.linkage && c.linkage[k] || []).forEach(function (rule) {
                                    if (rule.target_group === old) rule.target_group = g.title;
                                });
                            });
                        });
                        ["groupOrder", "customGroupOrder", "customManagedGroups"].forEach(function (k) {
                            self.properties[k] = (self.properties[k] || []).map(function (n) { return n === old ? g.title : n; });
                        });
                    }
                    self._agimRef.set(g, g.title);
                });
            }
            var shown = this._agimDisplayGroups().map(function (g) { return g.title; }).join("\n");
            if (shown !== this._agimLastShown) {
                this._agimLastShown = shown;
                this._agimRender();
                return;
            }
            (this.properties.groups || []).forEach(function (cfg) {
                var g = self._agimGroups().find(function (x) { return x.title === cfg.group_name; });
                if (!g) return;
                var on = self._agimEnabled(g);
                if (cfg.enabled !== on) {
                    cfg.enabled = on;
                    self._agimPaintSwitch(cfg.group_name, on);
                }
                var b = cfg.parameterBinding;
                if (!b || !b.enabled || b.kind === "output") return;
                var w = self._agimFindWidget(b.nodeId, b.paramName);
                if (!w) return;
                var want = b.mapping === "inverse" ? !w.value : !!w.value;
                if (want !== cfg.enabled) {
                    self._agimFromParam = true;
                    try { self._agimToggle(cfg.group_name, want); } finally { self._agimFromParam = false; }
                }
            });
        };

        var onSer = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function (info) {
            if (onSer) onSer.apply(this, arguments);
            info.groups = this.properties.groups || [];
            info.selectedColorFilter = this.properties.selectedColorFilter || "";
            info.groupOrder = this.properties.groupOrder || [];
            info.managerMode = this.properties.managerMode || "color";
            info.customManagedGroups = this.properties.customManagedGroups || [];
            info.customGroupOrder = this.properties.customGroupOrder || [];
        };

        var onCfg = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            if (onCfg) onCfg.apply(this, arguments);
            this.properties = this.properties || {};
            this.properties.groups = info.groups || [];
            this.properties.selectedColorFilter = info.selectedColorFilter || "";
            this.properties.groupOrder = info.groupOrder || [];
            this.properties.managerMode = info.managerMode || "color";
            this.properties.customManagedGroups = info.customManagedGroups || [];
            this.properties.customGroupOrder = info.customGroupOrder || [];
            var self = this;
            setTimeout(function () {
                self._agimSyncHead();
                self._agimFillColors();
                self._agimRender();
                self._agimFit();
            }, 200);
        };

        var onRem = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            if (this._agimTimer) clearInterval(this._agimTimer);
            if (this._agimOnEvt) window.removeEventListener(spec.eventName, this._agimOnEvt);
            if (onRem) onRem.apply(this, arguments);
        };
    }
});
