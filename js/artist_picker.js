// 画师选择：组合看缩略图，名单可删，输出条拖动排序。
// 叉号和多余操作只在光标移上去时出现。输出是 @画师名。

import { app } from "/scripts/app.js";
import "./00_anima_i18n.js";
import "./00_anima_theme.js";
import "./00_anima_fav_grid.js";

function T(s) {
    return typeof window.animaTxt === "function" ? window.animaTxt(s) : (s || "");
}

function normTag(raw) {
    var t = String(raw || "").trim();
    if (!t) return "";
    t = t.replace(/^@+/, "").replace(/\s+/g, "_");
    if (!t) return "";
    return "@" + t;
}

function keyOf(raw) {
    var t = String(raw || "").trim().replace(/^@+/, "");
    if (!t) return "";
    for (var n = 0; n < 3 && /\\[()[\]]/.test(t); n++) t = t.replace(/\\([()[\]])/g, "$1");
    t = t.replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
    t = t.replace(/_+(?=[(\[])/g, "");
    return t;
}

function artistBody(raw) {
    var t = String(raw || "").trim();
    if (!t) return "";
    t = t.replace(/^@+/, "").replace(/^artist:/i, "").trim();
    for (var n = 0; n < 3 && /\\[()[\]]/.test(t); n++) t = t.replace(/\\([()[\]])/g, "$1");
    t = t.replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
    t = t.replace(/([^_])([(\[])/g, "$1_$2");
    return t;
}

function escapedParen(t) {
    return /\\[()[\]]/.test(String(t || ""));
}

function preferTag(current, incoming) {
    if (!current) return incoming;
    if (!incoming) return current;
    if (escapedParen(current) !== escapedParen(incoming) && /[()[\]]/.test(keyOf(current))) {
        return escapedParen(incoming) ? incoming : current;
    }
    return current;
}

function queryText(raw) {
    return String(raw || "").trim().toLowerCase().replace(/^@+/, "").replace(/\\([()[\]])/g, "$1");
}

function animaArtistTag(raw) {
    var t = artistBody(raw);
    if (!t) return "";
    t = t.replace(/(?<!\\)\(/g, "\\(").replace(/(?<!\\)\)/g, "\\)");
    t = t.replace(/(?<!\\)\[/g, "\\[").replace(/(?<!\\)\]/g, "\\]");
    return "@" + t;
}

var APICK_CHIBI = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="26" r="14" fill="#f6c7b2"/><path d="M20 24c1-9 7-14 12-14s11 5 12 14c-3-2-7-3-12-3s-9 1-12 3z" fill="#6b4a36"/><circle cx="27" cy="26" r="1.7" fill="#3a2a22"/><circle cx="37" cy="26" r="1.7" fill="#3a2a22"/><path d="M30 30.5c.8 1 3.2 1 4 0" stroke="#e08b90" stroke-width="1.3" fill="none" stroke-linecap="round"/><ellipse cx="23.5" cy="29" rx="2" ry="1.2" fill="#f3a3ab"/><ellipse cx="40.5" cy="29" rx="2" ry="1.2" fill="#f3a3ab"/><path d="M24 42c0-4 3.2-6 8-6s8 2 8 6v6H24z" fill="#8eb4ff"/><path d="M22 48h20v3.5a3.5 3.5 0 0 1-3.5 3.5h-13A3.5 3.5 0 0 1 22 51.5z" fill="#6d94e6"/></svg>';

function makeChibi(extraClass) {
    var ph = document.createElement("div");
    ph.className = "apick-ph apick-chibi" + (extraClass ? (" " + extraClass) : "");
    ph.innerHTML = APICK_CHIBI;
    return ph;
}

function animadexThumb(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    if (s.indexOf("/danbooru_anima/animadex_image") >= 0) return s;
    if (/^https?:\/\//i.test(s)) return "/danbooru_anima/animadex_image?url=" + encodeURIComponent(s);
    return "";
}

function showName(tag) {
    return keyOf(tag).replace(/_/g, " ");
}

function openComboInViewer(combo) {
    var arts = [];
    var seen = {};
    ((combo && combo.artists) || []).forEach(function (t) {
        var tag = normTag(t);
        if (!tag) return;
        var k = keyOf(tag);
        if (!k || seen[k]) return;
        seen[k] = 1;
        arts.push(tag);
    });
    if (!arts.length) return;
    var url = "/extensions/ComfyUI-Danbooru-Anima-Prompt/output_prompt_viewer.html?v=222&artists=" + encodeURIComponent(JSON.stringify(arts)) + "&exact=1";
    if (combo && combo.name) url += "&combo=" + encodeURIComponent(combo.name);
    var w = window.open(url, "anima-opv");
    if (w) { try { w.focus(); } catch (e) {} }
}

function openArtistInViewer(tag) {
    var t = normTag(tag);
    if (!t) return;
    var url = "/extensions/ComfyUI-Danbooru-Anima-Prompt/output_prompt_viewer.html?v=222&artists=" + encodeURIComponent(JSON.stringify([t])) + "&solo=1";
    var w = window.open(url, "anima-opv");
    if (w) { try { w.focus(); } catch (e) {} }
}

function siteArtistTag(tag) {
    var s = "";
    if (typeof window.animaToDanbooruArtistTag === "function") s = window.animaToDanbooruArtistTag(tag);
    else s = String(tag || "");
    s = String(s || "");
    for (var n = 0; n < 3 && /\\[()[\]]/.test(s); n++) s = s.replace(/\\([()[\]])/g, "$1");
    s = s.replace(/^@+/, "").replace(/^artist:/i, "").trim().replace(/\s+/g, "_").toLowerCase();
    s = s.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
    s = s.replace(/([^_])([(\[])/g, "$1_$2");
    return s;
}

function workflowNodes(type) {
    var out = [];
    var nodes = (app.graph && app.graph._nodes) || [];
    for (var i = 0; i < nodes.length; i++) {
        if (nodes[i] && nodes[i].type === type) out.push(nodes[i]);
    }
    return out;
}

function pushNodeSearch(node, q, fnName) {
    if (!node || !q) return false;
    if (typeof node[fnName] === "function") {
        node[fnName](q);
        return true;
    }
    var root = node.nodeEl || (node.widgets && node.widgets[0] && node.widgets[0].element);
    var el = root && root.querySelector ? root.querySelector("input[type='text']") : null;
    if (!el) return false;
    el.value = q;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    return true;
}

function searchWorkflowSite(type, fnName, q) {
    var nodes = workflowNodes(type);
    var hit = 0;
    nodes.forEach(function (n) { if (pushNodeSearch(n, q, fnName)) hit++; });
    return hit;
}

function openSite(url) {
    var w = window.open(url, "_blank", "noopener,noreferrer");
    if (w) { try { w.focus(); } catch (e) {} }
}

var _apMenu = null;
function closeArtistMenu() {
    if (!_apMenu) return;
    _apMenu.remove();
    _apMenu = null;
}
function apickMenuBtn(label, onClick, disabled) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "apick-menu-item" + (disabled ? " is-off" : "");
    b.textContent = label;
    if (disabled) {
        b.disabled = true;
        return b;
    }
    b.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        closeArtistMenu();
        onClick();
    });
    return b;
}
function apickMenuSub(label, rows) {
    var row = document.createElement("div");
    row.className = "apick-menu-sub";
    var b = document.createElement("button");
    b.type = "button";
    b.className = "apick-menu-item";
    var text = document.createElement("span");
    text.textContent = label;
    var chev = document.createElement("span");
    chev.className = "apick-menu-chev";
    chev.textContent = "▸";
    b.appendChild(text);
    b.appendChild(chev);
    var fly = document.createElement("div");
    fly.className = "apick-menu-fly";
    rows.forEach(function (el) { fly.appendChild(el); });
    b.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var menu = row.parentNode;
        if (menu) {
            var subs = menu.querySelectorAll(".apick-menu-sub");
            for (var i = 0; i < subs.length; i++) if (subs[i] !== row) subs[i].classList.remove("is-open");
        }
        row.classList.toggle("is-open");
    });
    row.appendChild(b);
    row.appendChild(fly);
    return row;
}
function placeArtistMenu(menu, x, y) {
    document.body.appendChild(menu);
    var w = menu.offsetWidth || 210;
    var h = menu.offsetHeight || 96;
    var left = x;
    var top = y;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    menu.style.left = Math.round(left) + "px";
    menu.style.top = Math.round(top) + "px";
    if (left + w + 210 > window.innerWidth - 8) menu.classList.add("fly-left");
    _apMenu = menu;
}
function openArtistMenu(tag, x, y, extra) {
    closeArtistMenu();
    if (!normTag(tag)) return;
    extra = extra || {};
    var q = siteArtistTag(tag);
    var menu = document.createElement("div");
    menu.className = "apick-menu";
    menu.appendChild(apickMenuBtn(T("只看这位画师的单画师图"), function () { openArtistInViewer(tag); }));
    if (extra.roster && extra.node && typeof extra.node._apCanRosterFront === "function" && extra.node._apCanRosterFront(tag)) {
        var node = extra.node;
        menu.appendChild(apickMenuBtn(T("把这个画师放到最前面"), function () { node._apRosterToFront(tag); }));
    }
    if (q) {
        var hasD = workflowNodes("DanbooruBrowser").length > 0;
        var hasG = workflowNodes("GelbooruBrowser").length > 0;
        menu.appendChild(apickMenuSub(T("去D站搜"), [
            apickMenuBtn(hasD ? T("当前工作流的D站") : T("当前工作流没有D站节点"), function () {
                searchWorkflowSite("DanbooruBrowser", "__dbSearch", q);
            }, !hasD),
            apickMenuBtn(T("D站网站"), function () {
                openSite("https://danbooru.donmai.us/posts?tags=" + encodeURIComponent(q));
            })
        ]));
        menu.appendChild(apickMenuSub(T("去G站搜"), [
            apickMenuBtn(hasG ? T("当前工作流的G站") : T("当前工作流没有G站节点"), function () {
                searchWorkflowSite("GelbooruBrowser", "__gelSearch", q);
            }, !hasG),
            apickMenuBtn(T("G站网站"), function () {
                openSite("https://gelbooru.com/index.php?page=post&s=list&tags=" + encodeURIComponent(q));
            })
        ]));
    }
    placeArtistMenu(menu, x, y);
}
function openComboMenu(node, combo, x, y) {
    closeArtistMenu();
    if (!node || !combo) return;
    var menu = document.createElement("div");
    menu.className = "apick-menu";
    menu.appendChild(apickMenuBtn(T("给组合改名"), function () { openComboRename(node, combo); }));
    placeArtistMenu(menu, x, y);
}
function openComboRename(node, combo) {
    var old = document.getElementById("apick-rename-mask");
    if (old) old.remove();
    var mask = document.createElement("div");
    mask.id = "apick-rename-mask";
    mask.className = "apick-rename-mask";
    var box = document.createElement("div");
    box.className = "apick-rename";
    var title = document.createElement("h3");
    title.textContent = T("给组合改名");
    var input = document.createElement("input");
    input.type = "text";
    input.value = combo.name || "";
    input.placeholder = T("组合名称");
    var err = document.createElement("div");
    err.className = "apick-rename-err";
    var row = document.createElement("div");
    row.className = "apick-rename-row";
    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "act";
    cancel.textContent = T("取消");
    var ok = document.createElement("button");
    ok.type = "button";
    ok.className = "go";
    ok.textContent = T("确定");
    function close() { if (mask.parentNode) mask.parentNode.removeChild(mask); }
    function commit() {
        var name = String(input.value || "").trim();
        if (!name) { err.textContent = T("请先写一个组合名称"); return; }
        var list = node._apCombos || [];
        var dup = list.some(function (c) { return c && c !== combo && String(c.name || "") === name; });
        if (dup) { err.textContent = T("这个名字已经有了"); return; }
        var prev = String(combo.name || "");
        if (prev !== name) {
            combo.name = name;
            var nodes = (app.graph && app.graph._nodes) || [];
            nodes.forEach(function (n) {
                if (!n || n.type !== "ArtistPicker" || typeof n._apEnsure !== "function") return;
                var p = n._apEnsure();
                if (p.combo === prev) {
                    p.combo = name;
                    n._apWrite(true);
                }
            });
            if (window.animaPublishArtistCombos) window.animaPublishArtistCombos(list);
        }
        close();
    }
    cancel.addEventListener("click", function (ev) { ev.preventDefault(); ev.stopPropagation(); close(); });
    ok.addEventListener("click", function (ev) { ev.preventDefault(); ev.stopPropagation(); commit(); });
    input.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") { ev.preventDefault(); commit(); }
        else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close(); }
    });
    mask.addEventListener("mousedown", function (ev) {
        ev.stopPropagation();
        if (ev.target === mask) close();
    });
    box.addEventListener("mousedown", function (ev) { ev.stopPropagation(); });
    row.appendChild(cancel);
    row.appendChild(ok);
    box.appendChild(title);
    box.appendChild(input);
    box.appendChild(err);
    box.appendChild(row);
    mask.appendChild(box);
    document.body.appendChild(mask);
    setTimeout(function () { input.focus(); input.select(); }, 0);
}
function bindArtistMenu(el, tag, extra) {
    if (!el) return;
    el.addEventListener("contextmenu", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        hideThumbHover();
        openArtistMenu(tag, ev.clientX, ev.clientY, extra);
    });
}
if (!window.__apickMenuWatch) {
    window.__apickMenuWatch = true;
    document.addEventListener("mousedown", function (ev) {
        if (!_apMenu || _apMenu.contains(ev.target)) return;
        closeArtistMenu();
    }, true);
    document.addEventListener("scroll", closeArtistMenu, true);
    window.addEventListener("blur", closeArtistMenu);
    document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") closeArtistMenu();
    });
}

function cleanCn(cn) {
    if (cn && typeof cn === "object") return "";
    var s = String(cn || "").trim();
    if (!s || s.charAt(0) === "{" || s.charAt(0) === "[") return "";
    return s;
}

function dedupeTags(list) {
    var out = [];
    var seen = {};
    (list || []).forEach(function (raw) {
        var t = normTag(raw);
        var k = keyOf(t);
        if (!k) return;
        if (seen[k] == null) {
            seen[k] = out.length;
            out.push(t);
            return;
        }
        out[seen[k]] = preferTag(out[seen[k]], t);
    });
    return out;
}

function readJson(raw, fallback) {
    try {
        var v = JSON.parse(raw || "");
        return v && typeof v === "object" ? v : fallback;
    } catch (e) {
        return fallback;
    }
}

function readPinOrder() {
    var a = readJson(localStorage.getItem("tp_pin_order") || "[]", []);
    return Array.isArray(a) ? a : [];
}

function readFavSort() {
    var v = "";
    try { v = localStorage.getItem("apick_fav_sort") || ""; } catch (e) {}
    if (v === "new" || v === "old" || v === "name" || v === "namez" || v === "rate") return v;
    return "rate";
}

function readLocalCombos() {
    var a = readJson(localStorage.getItem("danbooru_artist_combos") || "[]", []);
    return Array.isArray(a) ? a : [];
}

function viewThumbParts(url) {
    var s = String(url || "");
    var i = s.indexOf("/view?");
    if (i < 0) return null;
    var params = {};
    s.slice(i + 6).split("&").forEach(function (part) {
        var eq = part.indexOf("=");
        if (eq < 1) return;
        try {
            params[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(part.slice(eq + 1).replace(/\+/g, " "));
        } catch (e) {}
    });
    if (!params.filename) return null;
    return { filename: params.filename, subfolder: params.subfolder || "" };
}

function copyComboThumbFile(filename, subfolder) {
    return fetch("/danbooru_anima/combo_thumb/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: filename, subfolder: subfolder || "" })
    }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d || !d.success || !d.url) throw new Error((d && d.error) || "copy failed");
        return d.url;
    });
}

function ensureSortable() {
    if (typeof window.animaEnsureSortableScript === "function") window.animaEnsureSortableScript();
    if (window.Sortable || document.getElementById("apick-sortable")) return;
    var s = document.createElement("script");
    s.id = "apick-sortable";
    s.src = "/extensions/ComfyUI-Danbooru-Anima-Prompt/js/sortable.min.js";
    document.head.appendChild(s);
}

function sectionLabel(text, svg) {
    var row = document.createElement("div");
    row.className = "apick-label";
    var mark = document.createElement("span");
    mark.className = "apick-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.innerHTML = svg;
    var name = document.createElement("span");
    name.className = "apick-label-t";
    name.textContent = text;
    row.appendChild(mark);
    row.appendChild(name);
    return row;
}

var APICK_ICO_COMBO = "<svg viewBox=\"0 0 16 16\" fill=\"none\"><rect x=\"2.2\" y=\"2.2\" width=\"8.2\" height=\"8.2\" rx=\"1.6\" stroke=\"currentColor\" stroke-width=\"1.4\"/><path d=\"M6.2 11.4h6.1a1.5 1.5 0 0 0 1.5-1.5V5.5\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\"/></svg>";
var APICK_ICO_OUT = "<svg viewBox=\"0 0 16 16\" fill=\"none\"><path d=\"M2.8 8h8.2\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\"/><path d=\"M8.2 4.2 12.2 8 8.2 11.8\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>";
var APICK_ICO_LIST = "<svg viewBox=\"0 0 16 16\" fill=\"none\"><rect x=\"2\" y=\"2\" width=\"5\" height=\"5\" rx=\"1.2\" stroke=\"currentColor\" stroke-width=\"1.4\"/><rect x=\"9\" y=\"2\" width=\"5\" height=\"5\" rx=\"1.2\" stroke=\"currentColor\" stroke-width=\"1.4\"/><rect x=\"2\" y=\"9\" width=\"5\" height=\"5\" rx=\"1.2\" stroke=\"currentColor\" stroke-width=\"1.4\"/><rect x=\"9\" y=\"9\" width=\"5\" height=\"5\" rx=\"1.2\" stroke=\"currentColor\" stroke-width=\"1.4\"/></svg>";
var APICK_ICO_SEE = "<svg viewBox=\"0 0 16 16\" fill=\"none\"><rect x=\"1.6\" y=\"2.4\" width=\"12.8\" height=\"11.2\" rx=\"1.6\" stroke=\"currentColor\" stroke-width=\"1.3\"/><circle cx=\"5.3\" cy=\"6\" r=\"1.1\" fill=\"currentColor\"/><path d=\"M1.8 11.4 5.1 8.2l2.1 1.9 2.2-2.4 4.2 3.7\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/></svg>";
var APICK_ICO_EYE = "<svg viewBox=\"0 0 16 16\" fill=\"none\"><path d=\"M1.4 8s2.3-3.6 6.6-3.6S14.6 8 14.6 8 12.3 11.6 8 11.6 1.4 8 1.4 8z\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linejoin=\"round\"/><circle cx=\"8\" cy=\"8\" r=\"1.7\" fill=\"currentColor\"/></svg>";
var APICK_ICO_EYE_OFF = "<svg viewBox=\"0 0 16 16\" fill=\"none\"><path d=\"M2.2 8.2c1.5-2.4 3.4-3.6 5.8-3.6 1.3 0 2.5.4 3.6 1.1\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\"/><path d=\"M13.8 7.6c.3.5.4.8.4 1.1 0 0-2.2 3.6-6.2 3.6-1.2 0-2.3-.3-3.3-.9\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\"/><path d=\"M3.1 13.1 12.9 3.3\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\"/></svg>";

function injectStyles() {
    ["apick-styles-v1", "apick-styles-v2", "apick-styles-v3", "apick-styles-v4", "apick-styles-v5", "apick-styles-v6", "apick-styles-v7", "apick-styles-v8", "apick-styles-v9", "apick-styles-v10", "apick-styles-v11", "apick-styles-v12", "apick-styles-v13", "apick-styles-v14", "apick-styles-v15", "apick-styles-v16", "apick-styles-v17", "apick-styles-v18", "apick-styles-v19", "apick-styles-v20"].forEach(function (id) {
        var old = document.getElementById(id);
        if (old && old.dataset.rev !== "20") old.remove();
    });
    if (document.getElementById("apick-styles-v20")) return;
    var s = document.createElement("style");
    s.id = "apick-styles-v20";
    s.dataset.rev = "20";
    s.textContent = [
        ".apick-host{overflow:hidden!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;}",
        ".apick-wrap{display:flex;flex-direction:column;width:100%;height:100%;min-width:0;min-height:0;max-width:100%;overflow:hidden;box-sizing:border-box;position:relative;",
        "font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#f3f3f3;font-size:12px;",
        "background:radial-gradient(ellipse 90% 46% at 100% -10%,rgba(var(--anima-glow-core-rgb),.28) 0%,transparent 58%),linear-gradient(180deg,var(--anima-well) 0%,var(--anima-bg-deep) 78%);",
        "border:1px solid rgba(var(--anima-accent-rgb),.28);border-radius:14px;}",
        ".apick-head{position:relative;z-index:5;flex-shrink:0;padding:8px 10px 0;}",
        ".apick-search{width:100%;box-sizing:border-box;border:0;border-bottom:1px solid rgba(255,255,255,.08);border-radius:0;background:transparent;color:#f4f4f4;font-size:12px;padding:6px 2px 7px;outline:none;}",
        ".apick-search::placeholder{color:rgba(255,255,255,.5);}",
        ".apick-search:focus{border-bottom-color:rgba(var(--anima-accent-rgb),.72);}",
        ".apick-drop{display:none;position:absolute;left:8px;right:8px;top:calc(100% + 4px);z-index:8;max-height:240px;overflow:auto;background:rgba(16,16,20,.96);border:1px solid rgba(var(--anima-accent-rgb),.35);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.45);}",
        ".apick-drop.on{display:block;}",
        ".apick-sec{padding:6px 10px 2px;color:rgba(255,255,255,.38);font-size:10px;letter-spacing:.04em;}",
        ".apick-hit{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:0;border-bottom:1px solid rgba(255,255,255,.05);background:transparent;color:#eee;padding:6px 10px;cursor:pointer;font-size:12px;}",
        ".apick-hit:hover{background:rgba(var(--anima-accent-rgb),.16);}",
        ".apick-hit img,.apick-hit .apick-mini{width:32px;height:32px;border-radius:6px;object-fit:cover;flex-shrink:0;background:rgba(255,255,255,.06);}",
        ".apick-hit .apick-mini{display:flex;align-items:center;justify-content:center;font-weight:700;}",
        ".apick-hit b{font-weight:650;}",
        ".apick-hit span{color:rgba(255,255,255,.45);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
        ".apick-label{display:flex;align-items:center;gap:7px;flex-shrink:0;min-width:0;max-width:100%;margin:0 10px;padding:8px 2px 4px;border-top:1px solid rgba(255,255,255,.12);color:#fff;font-size:12px;font-weight:650;letter-spacing:.06em;}",
        ".apick-head+.apick-label{border-top:0;padding-top:8px;}",
        ".apick-mark{flex:0 0 18px;width:18px;height:18px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(160deg,rgba(var(--anima-accent-rgb),.9),rgba(var(--anima-accent-rgb),.38));box-shadow:0 0 0 1px rgba(var(--anima-accent-rgb),.5),0 3px 8px rgba(var(--anima-accent-rgb),.28);}",
        ".apick-mark svg{width:12px;height:12px;display:block;}",
        ".apick-label-t{background:linear-gradient(90deg,#fff 0%,rgba(255,255,255,.72) 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}",
        ".apick-label::after{content:\"\";order:1;flex:1 1 auto;height:1px;min-width:18px;background:linear-gradient(90deg,rgba(var(--anima-accent-rgb),.6),rgba(255,255,255,.08) 72%,transparent);}",
        ".apick-label.is-fold{cursor:pointer;}",
        ".apick-fold{order:2;flex:0 0 16px;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;color:rgba(255,255,255,.72);transition:transform .16s ease,color .16s ease;}",
        ".apick-fold svg{width:14px;height:14px;display:block;}",
        ".apick-label.is-shut .apick-fold{transform:rotate(-90deg);}",
        ".apick-label.is-fold:hover .apick-fold{color:#fff;}",
        ".apick-clear{order:2;flex:0 0 auto;border:0;border-radius:6px;background:transparent;color:rgba(255,255,255,.62);font:inherit;font-size:11px;font-weight:650;letter-spacing:.04em;padding:2px 6px;cursor:pointer;}",
        ".apick-clear:hover{color:#fff;background:rgba(var(--anima-accent-rgb),.4);}",
        ".apick-clear[hidden]{display:none;}",
        ".apick-eye{order:2;flex:0 0 22px;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:6px;padding:0;background:transparent;color:rgba(255,255,255,.82);cursor:pointer;}",
        ".apick-eye svg{width:15px;height:15px;display:block;pointer-events:none;}",
        ".apick-eye:hover{color:#fff;background:rgba(var(--anima-accent-rgb),.4);}",
        ".apick-eye.is-off{color:rgba(255,255,255,.42);}",
        ".apick-label.is-fold .apick-fold{order:3;}",
        ".apick-combos{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:8px;max-height:200px;min-width:0;max-width:calc(100% - 16px);margin:0 8px;overflow-x:hidden;overflow-y:auto;padding:6px;flex-shrink:0;border-radius:10px;background:rgba(0,0,0,.2);scrollbar-width:thin;scrollbar-color:rgba(var(--anima-accent-rgb),.6) transparent;}",
        ".apick-combos.is-faces-off{grid-template-columns:repeat(auto-fill,minmax(104px,1fr));max-height:148px;}",
        ".apick-combo{width:auto;min-width:0;box-sizing:border-box;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);border-radius:10px;padding:6px;cursor:pointer;color:#eee;text-align:left;font:inherit;}",
        ".apick-combo:hover{border-color:rgba(var(--anima-accent-rgb),.45);background:rgba(255,255,255,.05);}",
        ".apick-combo.on{border-color:rgba(var(--anima-accent-rgb),.85);box-shadow:0 0 0 1px rgba(var(--anima-accent-rgb),.35);}",
        ".apick-combo-pics{display:flex;gap:6px;height:78px;min-width:0;align-items:stretch;}",
        ".apick-combos.is-faces-off .apick-combo-pics{height:72px;}",
        ".apick-cover{flex:1 1 auto;min-width:72px;height:100%;border-radius:8px;overflow:hidden;background:rgba(0,0,0,.34);box-shadow:0 0 0 1px rgba(255,255,255,.28),0 6px 14px rgba(0,0,0,.28);}",
        ".apick-cover .apick-thumb{object-fit:contain;background:rgba(0,0,0,.34);}",
        ".apick-combo-pics>.apick-ph{flex:1;height:100%;border-radius:8px;}",
        ".apick-faces{flex:0 0 62px;width:62px;height:100%;min-width:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:3px;}",
        ".apick-faces:only-child{flex:1 1 auto;width:auto;}",
        ".apick-faces>.apick-face,.apick-faces>.apick-more{flex:none;min-width:0;min-height:0;width:auto;height:auto;aspect-ratio:auto;border-radius:4px;overflow:hidden;background:rgba(255,255,255,.06);}",
        ".apick-faces .apick-thumb,.apick-faces .apick-ph{width:100%;height:100%;object-fit:cover;}",
        ".apick-more{display:flex;align-items:center;justify-content:center;font-size:11px;color:rgba(255,255,255,.7);}",
        ".apick-combo-foot{display:flex;align-items:center;gap:4px;margin-top:5px;min-width:0;}",
        ".apick-combo-name{flex:1;min-width:0;font-size:12px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,.9);}",
        ".apick-combo-see{flex:0 0 22px;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;color:rgba(255,255,255,.86);background:rgba(var(--anima-accent-rgb),.32);box-shadow:0 0 0 1px rgba(var(--anima-accent-rgb),.5);cursor:pointer;}",
        ".apick-combo-see svg{width:13px;height:13px;display:block;pointer-events:none;}",
        ".apick-combo-see:hover{color:#fff;background:rgba(var(--anima-accent-rgb),.62);}",
        ".apick-strip{display:flex;gap:8px;min-width:0;max-width:calc(100% - 16px);margin:0 8px 2px;overflow-x:auto;overflow-y:hidden;padding:8px 6px;min-height:64px;align-items:flex-start;flex-shrink:0;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035);scrollbar-width:thin;scrollbar-color:rgba(var(--anima-accent-rgb),.6) transparent;}",
        ".apick-placeholder{align-self:center;color:rgba(255,255,255,.32);font-size:11px;padding:8px 2px;}",
        ".apick-chip{position:relative;flex:0 0 64px;width:64px;cursor:grab;text-align:center;}",
        ".apick-chip:active{cursor:grabbing;}",
        ".apick-ghost{opacity:.35;}",
        ".apick-chosen{opacity:.85;}",
        ".apick-grid{flex:1 1 auto;min-height:0;min-width:0;max-width:100%;overflow-x:hidden;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:10px 8px;padding:6px 10px 10px;align-content:start;scrollbar-width:thin;scrollbar-color:rgba(var(--anima-accent-rgb),.6) transparent;}",
        ".apick-roster{display:flex;flex-wrap:wrap;align-items:flex-start;align-content:flex-start;gap:10px 8px;}",
        ".apick-roster>.apick-tile[data-tag]{flex:0 0 84px;width:84px;}",
        ".apick-roster>.apick-empty{flex:1 0 100%;width:100%;}",
        ".apick-combos::-webkit-scrollbar,.apick-grid::-webkit-scrollbar,.apick-strip::-webkit-scrollbar{width:6px;height:6px;}",
        ".apick-combos::-webkit-scrollbar-thumb,.apick-grid::-webkit-scrollbar-thumb,.apick-strip::-webkit-scrollbar-thumb{background:rgba(var(--anima-accent-rgb),.55);border-radius:6px;}",
        ".apick-empty{grid-column:1/-1;color:rgba(255,255,255,.32);font-size:11px;padding:8px 2px 0;}",
        ".apick-tile{position:relative;border:0;background:transparent;padding:0;cursor:pointer;color:#eee;text-align:center;font:inherit;}",
        ".apick-roster>.apick-tile[data-tag]{cursor:grab;}",
        ".apick-roster>.apick-tile[data-tag]:active{cursor:grabbing;}",
        ".apick-face{position:relative;width:100%;aspect-ratio:1;border-radius:8px;overflow:hidden;background:rgba(255,255,255,.05);}",
        ".apick-tile.on .apick-face{box-shadow:0 0 0 3px var(--anima-accent,#8b6cc9);}",
        ".apick-tile.on .apick-face::after{content:\"\\2713\";position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.46);color:#fff;font-size:28px;font-weight:700;line-height:1;pointer-events:none;text-shadow:0 1px 4px rgba(0,0,0,.65);}",
        ".apick-thumb{width:100%;height:100%;display:block;object-fit:cover;pointer-events:none;-webkit-user-drag:none;}",
        ".apick-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:rgba(255,255,255,.8);background:linear-gradient(160deg,rgba(255,255,255,.08),rgba(255,255,255,.02));pointer-events:none;}",
        ".apick-chibi{background:linear-gradient(165deg,rgba(var(--anima-accent-rgb),.34),rgba(255,255,255,.05));pointer-events:auto;}",
        ".apick-chibi svg{width:72%;height:72%;display:block;}",
        ".apick-manual{display:flex;gap:8px;align-items:center;margin:0 0 6px;flex-shrink:0;}",
        ".apick-manual .apick-search{flex:1;min-width:0;margin:0;}",
        ".apick-addgo{flex:0 0 auto;border:0;border-radius:8px;padding:7px 14px;cursor:pointer;font:inherit;font-weight:700;color:#fff;background:rgba(var(--anima-accent-rgb),.88);}",
        ".apick-addgo:hover{filter:brightness(1.12);}",
        ".apick-manual-hint{color:rgba(255,255,255,.45);font-size:11px;line-height:1.45;margin:0 0 8px;flex-shrink:0;}",
        ".apick-morebtn{grid-column:1/-1;border:1px solid rgba(var(--anima-accent-rgb),.45);background:transparent;color:#fff;border-radius:8px;padding:8px;cursor:pointer;font:inherit;}",
        ".apick-morebtn:hover{background:rgba(var(--anima-accent-rgb),.28);}",
        ".apick-name{font-size:11px;line-height:1.25;margin-top:4px;min-height:14px;max-height:2.5em;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;white-space:normal;overflow-wrap:anywhere;color:rgba(255,255,255,.84);}",
        ".apick-tile.on .apick-name,.apick-chip .apick-name{color:rgba(255,255,255,.96);}",
        ".apick-x{position:absolute;top:4px;right:4px;z-index:3;width:18px;height:18px;border:0;border-radius:50%;padding:0;background:rgba(0,0,0,.62);color:#fff;font-size:13px;line-height:16px;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .12s ease;}",
        ".apick-tile:hover .apick-x,.apick-chip:hover .apick-x{opacity:1;pointer-events:auto;}",
        ".apick-x:hover{background:rgba(180,40,60,.9);}",
        ".apick-add{box-sizing:border-box;flex:0 0 36px;width:36px;height:36px;margin:24px 0 0;padding:0;border-radius:10px;border:1px solid rgba(var(--anima-accent-rgb),.7);background:rgba(var(--anima-accent-rgb),.34);color:#fff;font:inherit;font-size:22px;font-weight:650;line-height:34px;cursor:pointer;box-shadow:0 0 0 1px rgba(var(--anima-accent-rgb),.28);}",
        ".apick-add:hover{background:rgba(var(--anima-accent-rgb),.58);color:#fff;}",
        ".apick-foot{flex-shrink:0;margin:4px 10px 8px;padding:6px 2px 0;border-top:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.62);font-size:11px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
        ".apick-mask{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.48);display:flex;align-items:center;justify-content:center;}",
        ".apick-panel{width:min(760px,92vw);height:min(680px,86vh);display:flex;flex-direction:column;min-height:0;box-sizing:border-box;padding:14px;border-radius:16px;border:1px solid rgba(var(--anima-accent-rgb),.32);",
        "background:linear-gradient(180deg,var(--anima-well) 0%,var(--anima-bg-deep) 80%);box-shadow:0 22px 56px rgba(0,0,0,.5);}",
        ".apick-panel-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;font-weight:700;}",
        ".apick-panel .apick-search{margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,.1);}",
        ".apick-sorts{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 8px;flex-shrink:0;}",
        ".apick-sort{border:1px solid transparent;background:transparent;color:rgba(255,255,255,.48);font:inherit;font-size:11px;line-height:1.2;padding:4px 8px;border-radius:999px;cursor:pointer;}",
        ".apick-sort.on{background:rgba(var(--anima-accent-rgb),.2);color:#fff;border-color:rgba(var(--anima-accent-rgb),.45);}",
        ".apick-sort:hover{color:#fff;}",
        ".apick-panel .apick-grid{padding:0;}",
        ".apick-close{border:0;background:transparent;color:rgba(255,255,255,.55);font-size:18px;cursor:pointer;line-height:1;padding:2px 4px;}",
        ".apick-close:hover{color:#fff;}",
        ".apick-hover{display:none;position:fixed;z-index:100010;pointer-events:none;width:280px;height:280px;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,.16);box-shadow:0 12px 36px rgba(0,0,0,.55);background:rgba(12,12,16,.94);}",
        ".apick-hover img{width:100%;height:100%;object-fit:contain;display:block;background:rgba(0,0,0,.35);}",
        ".apick-menu{position:fixed;z-index:100020;min-width:196px;padding:4px;border-radius:8px;background:rgba(var(--anima-bg-deep-rgb), .96);border:1px solid rgba(var(--anima-accent-rgb),.45);box-shadow:0 10px 28px rgba(0,0,0,.45);}",
        ".apick-menu-item{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:left;border:0;border-radius:6px;background:transparent;color:#f3f3f3;font:inherit;font-size:12px;line-height:1.35;padding:7px 10px;cursor:pointer;}",
        ".apick-menu-item:hover{background:rgba(var(--anima-accent-rgb),.22);color:#fff;}",
        ".apick-menu-item.is-off,.apick-menu-item:disabled{opacity:.42;cursor:default;background:transparent;color:rgba(255,255,255,.72);}",
        ".apick-menu-sub{position:relative;}",
        ".apick-menu-chev{flex:0 0 auto;opacity:.7;font-size:11px;}",
        ".apick-menu-fly{display:none;position:absolute;left:calc(100% - 6px);top:-4px;min-width:188px;padding:4px;border-radius:8px;background:rgba(var(--anima-bg-deep-rgb), .98);border:1px solid rgba(var(--anima-accent-rgb),.45);box-shadow:0 10px 28px rgba(0,0,0,.45);}",
        ".apick-menu-sub.is-open>.apick-menu-fly,.apick-menu-sub:hover>.apick-menu-fly{display:block;}",
        ".apick-menu.fly-left .apick-menu-fly{left:auto;right:calc(100% - 6px);}",
        ".apick-rename-mask{position:fixed;inset:0;z-index:100030;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;}",
        ".apick-rename{width:280px;max-width:calc(100vw - 24px);padding:14px;border-radius:12px;background:rgba(var(--anima-bg-deep-rgb),.98);border:1px solid rgba(var(--anima-accent-rgb),.45);box-shadow:0 16px 40px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:8px;}",
        ".apick-rename h3{margin:0;font-size:13px;font-weight:650;color:#fff;}",
        ".apick-rename input{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:rgba(0,0,0,.28);color:#fff;font:inherit;font-size:13px;padding:7px 8px;outline:none;}",
        ".apick-rename input:focus{border-color:rgba(var(--anima-accent-rgb),.7);}",
        ".apick-rename-err{min-height:16px;color:#ff8d8d;font-size:11px;}",
        ".apick-rename-row{display:flex;justify-content:flex-end;gap:8px;}",
        ".apick-rename-row button{border:0;border-radius:8px;padding:6px 12px;font:inherit;font-size:12px;cursor:pointer;}",
        ".apick-rename-row .act{background:transparent;color:rgba(255,255,255,.75);}",
        ".apick-rename-row .go{background:rgba(var(--anima-accent-rgb),.85);color:#fff;}"
    ].join("");
    document.head.appendChild(s);
}

function thumbSrc(item, mode) {
    var raw = (item && item.thumb) || "";
    var source = (item && item.source) || "danbooru";
    if (source === "animadex") return animadexThumb(raw);
    var tag = keyOf(item && item.tag);
    try {
        if (window.animaFavGrid && typeof window.animaFavGrid.favSrc === "function") {
            var live = window.animaFavGrid.favSrc(raw, source, tag);
            if (live) return live;
        }
        if (raw && window.animaFavGrid && typeof window.animaFavGrid.proxySrc === "function") {
            return window.animaFavGrid.proxySrc(raw, source, mode === "mid" ? "mid" : "tiny") || "";
        }
    } catch (e) {}
    return raw || "";
}

function comboThumb(combo) {
    var raw = combo && combo.thumbs && combo.thumbs.length ? combo.thumbs[0] : "";
    if (!raw) return "";
    if (String(raw).indexOf("/danbooru_anima/combo_thumb/") >= 0) return raw;
    var source = /gelbooru\.com/i.test(String(raw)) ? "gelbooru" : "danbooru";
    try {
        if (window.animaFavGrid && typeof window.animaFavGrid.proxySrc === "function") {
            return window.animaFavGrid.proxySrc(raw, source, "mid") || raw;
        }
    } catch (e) {}
    return raw;
}

var _apHover = null;
var _apHoverTimer = 0;

function hideThumbHover() {
    if (_apHoverTimer) {
        clearTimeout(_apHoverTimer);
        _apHoverTimer = 0;
    }
    if (_apHover) _apHover.pop.style.display = "none";
}

function ensureThumbHover() {
    if (_apHover && _apHover.pop.isConnected) return _apHover;
    var pop = document.createElement("div");
    pop.className = "apick-hover";
    var img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    pop.appendChild(img);
    document.body.appendChild(pop);
    _apHover = { pop: pop, img: img };
    if (!ensureThumbHover._bound) {
        ensureThumbHover._bound = true;
        window.addEventListener("scroll", hideThumbHover, true);
        window.addEventListener("blur", hideThumbHover);
    }
    return _apHover;
}

function previewSrc(item) {
    var raw = (item && item.thumb) || "";
    var source = (item && item.source) || "danbooru";
    if (source === "animadex") return animadexThumb(raw);
    var tag = keyOf(item && item.tag);
    try {
        var g = window.animaFavGrid;
        if (g && typeof g.live === "function" && g.live() && typeof g.liveThumb === "function") {
            var lv = g.liveThumb(tag);
            if (lv) return lv;
        }
        if (raw && g && typeof g.proxySrc === "function") return g.proxySrc(raw, source, "mid") || raw;
    } catch (e) {}
    return raw || thumbSrc(item, "mid") || "";
}

function bindThumbHover(el, src) {
    if (!el || !src) return;
    el.addEventListener("mouseenter", function () {
        if (_apHoverTimer) clearTimeout(_apHoverTimer);
        _apHoverTimer = setTimeout(function () {
            _apHoverTimer = 0;
            if (!el.isConnected || !el.matches(":hover")) return;
            var box = ensureThumbHover();
            if (box.img.getAttribute("src") !== src) box.img.src = src;
            var rect = el.getBoundingClientRect();
            var size = 280;
            var gap = 10;
            var left = rect.right + gap;
            if (left + size > window.innerWidth - 8) left = rect.left - gap - size;
            if (left < 8) left = 8;
            var top = rect.top + (rect.height - size) / 2;
            if (top + size > window.innerHeight - 8) top = window.innerHeight - size - 8;
            if (top < 8) top = 8;
            box.pop.style.left = Math.round(left) + "px";
            box.pop.style.top = Math.round(top) + "px";
            box.pop.style.display = "block";
        }, 280);
    });
    el.addEventListener("mouseleave", hideThumbHover);
    el.addEventListener("mousedown", hideThumbHover, true);
}

function makeFace(item, opts) {
    opts = opts || {};
    var face = document.createElement("div");
    face.className = "apick-face";
    bindArtistMenu(face, item && item.tag, opts.menu);
    var src = thumbSrc(item, opts.tiny ? "tiny" : "mid");
    if (!src) {
        face.appendChild(makeChibi());
        return face;
    }
    var img = document.createElement("img");
    img.className = "apick-thumb";
    img.alt = "";
    img.draggable = false;
    if (opts.lazy) {
        img.loading = "lazy";
        img.decoding = "async";
    }
    var hoverSrc = previewSrc(item) || src;
    img.onload = function () { bindThumbHover(face, hoverSrc); };
    img.onerror = function () {
        if (img.parentNode) img.parentNode.replaceChild(makeChibi(), img);
    };
    img.src = src;
    face.appendChild(img);
    return face;
}

function makeX(title, onClick) {
    var x = document.createElement("button");
    x.type = "button";
    x.className = "apick-x";
    x.textContent = "×";
    x.title = title;
    x.addEventListener("mousedown", function (e) { e.preventDefault(); e.stopPropagation(); });
    x.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        onClick();
    });
    return x;
}

if (!window.__apickComboWatch) {
    window.__apickComboWatch = true;
    window.animaPublishArtistCombos = function (combos) {
        var list = Array.isArray(combos) ? combos : [];
        try { localStorage.setItem("danbooru_artist_combos", JSON.stringify(list)); } catch (e) {}
        try { window.dispatchEvent(new CustomEvent("anima-artist-combos")); } catch (e2) {}
        fetch("/danbooru_anima/save_userdata", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ danbooru_artist_combos: list })
        }).catch(function () {});
    };
    function refreshArtistPickersFromStore() {
        var list = readLocalCombos();
        var nodes = (app.graph && app.graph._nodes) || [];
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            if (!n || n.type !== "ArtistPicker" || typeof n._apRenderCombos !== "function") continue;
            n._apCombos = list;
            n._apComboSig = "";
            try { n._apRenderCombos(); } catch (err) {}
        }
    }
    window.addEventListener("storage", function (e) {
        if (!e || e.key !== "danbooru_artist_combos") return;
        refreshArtistPickersFromStore();
    });
    window.addEventListener("anima-artist-combos", refreshArtistPickersFromStore);
}

app.registerExtension({
    name: "Comfy.ArtistPicker",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "ArtistPicker") return;
        if (typeof window.hookAnimaNodeChrome === "function") window.hookAnimaNodeChrome(nodeType);

        var onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            var r = onCreated ? onCreated.apply(this, arguments) : undefined;
            this.properties = this.properties || {};
            this.serialize_widgets = true;
            this.size = [380, 540];
            if (typeof window.applyAnimaNodeChrome === "function") window.applyAnimaNodeChrome(this);
            ensureSortable();
            this._apBuild();
            var self = this;
            var prevResize = this.onResize;
            this.onResize = function (sz) {
                if (sz) {
                    if (sz[0] < 300) sz[0] = 300;
                    if (sz[1] < 240) sz[1] = 240;
                }
                if (prevResize) prevResize.apply(this, arguments);
                self._apFit();
            };
            var prevCfg = this.onConfigure;
            this.onConfigure = function () {
                var ret = prevCfg ? prevCfg.apply(this, arguments) : undefined;
                self._apLoadState();
                self._apRender();
                self._apCollapse();
                return ret;
            };
            var prevRemoved = this.onRemoved;
            this.onRemoved = function () {
                if (self._apOnFocus) window.removeEventListener("focus", self._apOnFocus);
                if (self._apDocClick) document.removeEventListener("mousedown", self._apDocClick);
                self._apAdexSeq = (self._apAdexSeq || 0) + 1;
                if (self._apAdexTimer) { clearTimeout(self._apAdexTimer); self._apAdexTimer = 0; }
                if (self._apMask) self._apMask.remove();
                hideThumbHover();
                self._apDestroySort();
                self._apDestroyRosterSort();
                if (prevRemoved) prevRemoved.apply(this, arguments);
            };
            this._apOnFocus = function () { self._apReload(); };
            window.addEventListener("focus", this._apOnFocus);
            this._apDocClick = function (e) {
                if (!self._apRoot || !self._apDrop) return;
                if (!self._apRoot.contains(e.target)) self._apHideDrop();
            };
            document.addEventListener("mousedown", this._apDocClick);
            setTimeout(function () { self._apLoadState(); self._apCollapse(); self._apRender(); }, 200);
            setTimeout(function () { self._apCollapse(); }, 500);
            this._apReload();
            return r;
        };

        nodeType.prototype._apWidgets = function () {
            var tags = null;
            var state = null;
            (this.widgets || []).forEach(function (w) {
                if (w.name === "artist_tags") tags = w;
                else if (w.name === "picker_state") state = w;
            });
            return { tags: tags, state: state };
        };

        nodeType.prototype._apCollapse = function () {
            var hide = { artist_tags: true, picker_state: true };
            (this.widgets || []).forEach(function (wg) {
                if (!hide[wg.name]) return;
                wg.computeSize = function () { return [0, -4]; };
                wg.draw = function () {};
                wg.serialize = true;
                try { wg.hidden = true; } catch (e) {}
                if (wg.options) wg.options.hidden = true;
                else wg.options = { hidden: true };
                wg.computedHeight = -4;
                if (wg.element) {
                    wg.element.style.display = "none";
                    wg.element.style.height = "0px";
                    wg.element.style.minHeight = "0";
                    wg.element.style.margin = "0";
                    wg.element.style.padding = "0";
                    wg.element.style.overflow = "hidden";
                }
            });
        };

        nodeType.prototype._apEnsure = function () {
            if (!this.properties.picker || typeof this.properties.picker !== "object") {
                this.properties.picker = { roster: [], selected: [], combo: "", seeded: false };
            }
            var p = this.properties.picker;
            if (!Array.isArray(p.roster)) p.roster = [];
            if (!Array.isArray(p.selected)) p.selected = [];
            if (typeof p.combo !== "string") p.combo = "";
            if (typeof p.seeded !== "boolean") p.seeded = false;
            return p;
        };

        nodeType.prototype._apLoadState = function () {
            var w = this._apWidgets();
            var fromW = w.state ? readJson(w.state.value, null) : null;
            var fromP = this.properties && this.properties.picker;
            var src = (fromW && (Array.isArray(fromW.roster) || Array.isArray(fromW.selected) || Array.isArray(fromW.extra))) ? fromW
                : (fromP && (Array.isArray(fromP.roster) || Array.isArray(fromP.selected))) ? fromP
                : { roster: [], selected: [], combo: "", seeded: false };
            var selected = dedupeTags(src.selected || []);
            if (!selected.length && w.tags && String(w.tags.value || "").trim()) {
                selected = dedupeTags(String(w.tags.value).split(/[,，]+/));
            }
            var roster = [];
            var rosterAt = {};
            (src.roster || []).forEach(function (x) {
                var tag = normTag(x && x.tag);
                var k = keyOf(tag);
                if (!k) return;
                var row = { tag: tag, thumb: (x && x.thumb) || "", cn: cleanCn(x && x.cn), source: (x && x.source) || "danbooru" };
                var at = rosterAt[k];
                if (at == null) {
                    rosterAt[k] = roster.length;
                    roster.push(row);
                    return;
                }
                var prev = roster[at];
                prev.tag = preferTag(prev.tag, row.tag);
                if (!prev.thumb && row.thumb) prev.thumb = row.thumb;
                if (!prev.cn && row.cn) prev.cn = row.cn;
            });
            var seeded = !!src.seeded && Array.isArray(src.roster);
            this.properties.picker = {
                roster: roster,
                selected: selected,
                combo: src.combo || "",
                seeded: seeded,
                extra: Array.isArray(src.extra) ? src.extra : []
            };
            this._apStripSig = "";
            this._apRosterSig = "";
            this._apComboSig = "";
            this._apCollapse();
            var rawSel = (src.selected || []).filter(function (t) { return keyOf(t); }).length;
            if (!rawSel && w.tags && String(w.tags.value || "").trim()) {
                rawSel = String(w.tags.value).split(/[,，]+/).filter(function (t) { return keyOf(t); }).length;
            }
            if (rawSel !== selected.length) this._apWrite(false);
        };

        nodeType.prototype._apWrite = function (fromUser) {
            var p = this._apEnsure();
            p.selected = dedupeTags(p.selected);
            var data = {
                roster: p.roster,
                selected: p.selected,
                combo: p.combo || "",
                seeded: !!p.seeded
            };
            this.properties.picker = data;
            if (p.extra) data.extra = p.extra;
            var text = p.selected.join(", ");
            var json = JSON.stringify({ roster: data.roster, selected: data.selected, combo: data.combo, seeded: data.seeded });
            var w = this._apWidgets();
            if (w.tags && w.tags.value !== text) w.tags.value = text;
            if (w.state && w.state.value !== json) w.state.value = json;
            if (fromUser) {
                try { if (app.graph && typeof app.graph.change === "function") app.graph.change(); } catch (e) {}
            }
        };

        nodeType.prototype._apSyncCombo = function () {
            var p = this._apEnsure();
            var hit = "";
            (this._apCombos || []).forEach(function (combo) {
                if (hit) return;
                var tags = dedupeTags(combo.artists || []);
                if (tags.length !== p.selected.length) return;
                for (var i = 0; i < tags.length; i++) {
                    if (keyOf(tags[i]) !== keyOf(p.selected[i])) return;
                }
                hit = combo.name || "";
            });
            p.combo = hit;
        };

        nodeType.prototype._apFindKnown = function (tag) {
            var k = keyOf(tag);
            if (!k) return null;
            var known = this._apKnown || {};
            if (known[k]) return known[k];
            if (this._apFav && this._apFav[k]) return this._apFav[k];
            var loose = k.replace(/_/g, "");
            var alt = loose && this._apKnownLoose && this._apKnownLoose[loose];
            if (alt && known[alt]) return known[alt];
            return null;
        };

        nodeType.prototype._apResolveTag = function (raw) {
            var tag = animaArtistTag(raw) || normTag(raw);
            if (!tag) return "";
            var known = this._apFindKnown(tag);
            if (known && known.tag && keyOf(known.tag) !== keyOf(tag)) return known.tag;
            if (known && known.tag) return preferTag(tag, known.tag) || tag;
            var loose = keyOf(tag).replace(/_/g, "");
            var hit = "";
            var many = false;
            (this._apEnsure().roster || []).forEach(function (x) {
                if (keyOf(x.tag).replace(/_/g, "") !== loose) return;
                if (!hit) hit = x.tag;
                else if (keyOf(hit) !== keyOf(x.tag)) many = true;
            });
            if (hit && !many && keyOf(hit) !== keyOf(tag)) return hit;
            if (hit && !many) return preferTag(tag, hit) || tag;
            return tag;
        };

        nodeType.prototype._apTake = function (item) {
            var tag = this._apResolveTag(item && (item.tag || item));
            if (!tag) return null;
            var known = this._apFindKnown(tag);
            var ownThumb = item && item.thumb;
            return {
                tag: tag,
                thumb: ownThumb || (known && known.thumb) || "",
                cn: cleanCn((item && item.cn) || (known && known.cn)),
                source: ownThumb ? ((item && item.source) || "danbooru") : ((known && known.thumb) ? (known.source || "danbooru") : ((item && item.source) || "manual"))
            };
        };

        nodeType.prototype._apAbsorb = function (item) {
            var p = this._apEnsure();
            var row = this._apTake(item);
            if (!row || !row.tag) return false;
            var k = keyOf(row.tag);
            var loose = k.replace(/_/g, "");
            var alias = !!(loose && this._apKnownLoose && this._apKnownLoose[loose] === k);
            var existing = null;
            (p.roster || []).forEach(function (x) {
                if (existing) return;
                var xk = keyOf(x.tag);
                if (xk === k || (alias && xk.replace(/_/g, "") === loose)) existing = x;
            });
            var changed = false;
            if (!existing) {
                p.roster.push(row);
                changed = true;
            } else {
                if (keyOf(existing.tag) !== k) {
                    var old = keyOf(existing.tag);
                    existing.tag = row.tag;
                    p.selected = (p.selected || []).map(function (t) { return keyOf(t) === old ? row.tag : t; });
                    changed = true;
                }
                if (!existing.thumb && row.thumb) {
                    existing.thumb = row.thumb;
                    existing.source = row.source || existing.source;
                    if (!existing.cn && row.cn) existing.cn = row.cn;
                    changed = true;
                } else if (!existing.cn && row.cn) {
                    existing.cn = row.cn;
                    changed = true;
                }
            }
            if (!(p.selected || []).some(function (t) { return keyOf(t) === k; })) {
                p.selected.push(row.tag);
                changed = true;
            }
            if (changed) {
                this._apRosterSig = "";
                this._apStripSig = "";
            }
            return changed;
        };

        nodeType.prototype._apIndexKnown = function (adex) {
            var known = {};
            function add(tag, info, source) {
                var t = normTag(tag);
                var key = keyOf(t);
                if (!key) return;
                var row = {
                    tag: t,
                    thumb: (info && info.thumb) || "",
                    cn: cleanCn(info && info.cn),
                    source: source || "danbooru"
                };
                var cur = known[key];
                if (!cur) { known[key] = row; return; }
                if (!cur.thumb && row.thumb) { cur.thumb = row.thumb; cur.source = row.source; }
                if (!cur.cn && row.cn) cur.cn = row.cn;
            }
            var fav = this._apFav || {};
            Object.keys(fav).forEach(function (k) { add(fav[k].tag || k, fav[k], fav[k].source); });
            var arts = (adex && adex.favorites && adex.favorites.animadex_artists) || {};
            function takeAdex(name) {
                if (!name || name === "_order" || String(name).charAt(0) === "_") return;
                var info = arts[name];
                if (!info || typeof info !== "object") return;
                add(name, info, "animadex");
            }
            (Array.isArray(arts._order) ? arts._order : []).forEach(takeAdex);
            Object.keys(arts).forEach(takeAdex);
            var loose = {};
            var buckets = {};
            Object.keys(known).forEach(function (k) {
                var id = k.replace(/_/g, "");
                if (!id) return;
                if (!buckets[id]) buckets[id] = [];
                buckets[id].push(k);
            });
            Object.keys(buckets).forEach(function (id) {
                if (buckets[id].length === 1) loose[id] = buckets[id][0];
            });
            this._apKnown = known;
            this._apKnownLoose = loose;
        };

        nodeType.prototype._apApplyKnownThumbs = function () {
            var p = this._apEnsure();
            var self = this;
            var changed = false;
            var rows = [];
            var seen = {};
            (p.roster || []).forEach(function (row) {
                var known = self._apFindKnown(row.tag);
                var tag = row.tag;
                if (known && known.tag && keyOf(known.tag) !== keyOf(row.tag)) tag = known.tag;
                var k = keyOf(tag);
                if (!k) return;
                var thumb = row.thumb || (known && known.thumb) || "";
                var source = row.thumb ? (row.source || "danbooru") : (thumb && known ? (known.source || row.source || "danbooru") : (row.source || "manual"));
                var cn = row.cn || (known && known.cn) || "";
                if (seen[k]) {
                    if (!seen[k].thumb && thumb) {
                        seen[k].thumb = thumb;
                        seen[k].source = source;
                    }
                    if (!seen[k].cn && cn) seen[k].cn = cn;
                    changed = true;
                    return;
                }
                if (tag !== row.tag || thumb !== (row.thumb || "") || cn !== (row.cn || "") || (thumb && source !== row.source)) changed = true;
                var next = { tag: tag, thumb: thumb, cn: cn, source: source };
                seen[k] = next;
                rows.push(next);
            });
            var sel = [];
            var selSeen = {};
            (p.selected || []).forEach(function (t) {
                var known = self._apFindKnown(t);
                var tag = t;
                if (known && known.tag && keyOf(known.tag) !== keyOf(t)) tag = known.tag;
                var k = keyOf(tag);
                if (!k || selSeen[k]) { if (k && selSeen[k]) changed = true; return; }
                selSeen[k] = 1;
                if (tag !== t) changed = true;
                sel.push(normTag(tag));
            });
            if (!changed) return;
            p.roster = rows;
            p.selected = sel;
            this._apRosterSig = "";
            this._apStripSig = "";
            this._apWrite(false);
        };

        nodeType.prototype._apItem = function (tag, hint) {
            var k = keyOf(tag);
            var fav = this._apFindKnown(tag) || (this._apFav || {})[k] || {};
            var prev = null;
            (this._apEnsure().roster || []).forEach(function (x) { if (keyOf(x.tag) === k) prev = x; });
            var hintThumb = hint && hint.thumb;
            var prevThumb = prev && prev.thumb;
            var favThumb = fav.thumb || "";
            var thumb = hintThumb || prevThumb || favThumb || "";
            var source = hintThumb ? ((hint && hint.source) || "danbooru")
                : prevThumb ? ((prev && prev.source) || "danbooru")
                : favThumb ? (fav.source || "danbooru")
                : ((hint && hint.source) || (prev && prev.source) || "manual");
            return {
                tag: normTag(tag) || (prev && prev.tag) || fav.tag || "",
                thumb: thumb,
                cn: cleanCn((hint && hint.cn) || (prev && prev.cn) || fav.cn),
                source: source
            };
        };

        nodeType.prototype._apSeed = function () {
            var p = this._apEnsure();
            if (p.seeded) return;
            var fav = this._apFav || {};
            var roster = [];
            var seen = {};
            function push(src) {
                var tag = normTag(src && (src.tag || src));
                var k = keyOf(tag);
                if (!k || seen[k]) return;
                seen[k] = true;
                var f = fav[k] || {};
                roster.push({
                    tag: f.tag || tag,
                    thumb: (src && src.thumb) || f.thumb || "",
                    cn: cleanCn((src && src.cn) || f.cn),
                    source: (src && src.source) || f.source || "danbooru"
                });
            }
            (p.selected || []).forEach(function (t) { push({ tag: t }); });
            (p.extra || []).forEach(push);
            var starred = this._apRanked(Object.keys(fav).filter(function (k) { return fav[k].starred; }).map(function (k) { return fav[k]; }));
            starred.slice(0, 18).forEach(push);
            if (roster.length < 24) {
                var high = this._apRanked(Object.keys(fav).filter(function (k) { return (fav[k].rating || 0) >= 4 && !seen[k]; }).map(function (k) { return fav[k]; }));
                high.slice(0, 24 - roster.length).forEach(push);
            }
            if (!roster.length) {
                this._apRanked(Object.keys(fav).map(function (k) { return fav[k]; })).slice(0, 16).forEach(push);
            }
            p.roster = roster;
            p.seeded = true;
            p.extra = [];
            this._apRosterSig = "";
            this._apWrite(false);
        };

        nodeType.prototype._apRanked = function (list) {
            var idx = {};
            (this._apPinOrder || []).forEach(function (t, i) {
                var k = keyOf(t);
                if (k && idx[k] == null) idx[k] = i;
            });
            return list.slice().sort(function (a, b) {
                var ra = a.rating || 0;
                var rb = b.rating || 0;
                if (ra !== rb) return rb - ra;
                var ia = idx[keyOf(a.tag)]; if (ia == null) ia = 9999;
                var ib = idx[keyOf(b.tag)]; if (ib == null) ib = 9999;
                if (ia !== ib) return ia - ib;
                return keyOf(a.tag).localeCompare(keyOf(b.tag));
            });
        };

        nodeType.prototype._apAdd = function (item) {
            if (!this._apAbsorb(item)) return;
            this._apSyncCombo();
            this._apWrite(true);
            this._apRender();
        };

        nodeType.prototype._apAddMany = function (items) {
            var self = this;
            var changed = false;
            (items || []).forEach(function (item) { if (self._apAbsorb(item)) changed = true; });
            if (!changed) return;
            this._apSyncCombo();
            this._apWrite(true);
            this._apRender();
        };

        nodeType.prototype._apToggleOut = function (tag) {
            var p = this._apEnsure();
            var t = normTag(tag);
            var k = keyOf(t);
            if (!k) return;
            var idx = -1;
            p.selected.forEach(function (x, i) { if (keyOf(x) === k) idx = i; });
            if (idx >= 0) p.selected.splice(idx, 1);
            else p.selected.push(t);
            this._apSyncCombo();
            this._apWrite(true);
            this._apRender();
        };

        nodeType.prototype._apDropRoster = function (tag) {
            var k = keyOf(tag);
            var p = this._apEnsure();
            p.roster = p.roster.filter(function (x) { return keyOf(x.tag) !== k; });
            p.selected = p.selected.filter(function (t) { return keyOf(t) !== k; });
            this._apSyncCombo();
            this._apWrite(true);
            this._apRender();
        };

        nodeType.prototype._apDropOut = function (tag) {
            var k = keyOf(tag);
            var p = this._apEnsure();
            p.selected = p.selected.filter(function (t) { return keyOf(t) !== k; });
            this._apSyncCombo();
            this._apWrite(true);
            this._apRender();
        };

        nodeType.prototype._apClearOut = function () {
            var p = this._apEnsure();
            if (!p.selected.length) return;
            p.selected = [];
            this._apSyncCombo();
            this._apStripSig = "";
            this._apWrite(true);
            this._apRender();
        };

        nodeType.prototype._apApplyCombo = function (combo) {
            var p = this._apEnsure();
            var tags = dedupeTags(combo.artists || []);
            if (this._apSearch) this._apSearch.value = "";
            this._apQuery = "";
            this._apHideDrop();
            if (p.combo && combo.name && p.combo === combo.name) {
                p.selected = [];
                p.combo = "";
                this._apWrite(true);
                this._apRender();
                return;
            }
            var self = this;
            tags.forEach(function (t) {
                var k = keyOf(t);
                if (p.roster.some(function (x) { return keyOf(x.tag) === k; })) return;
                p.roster.push(self._apItem(t));
            });
            p.selected = tags.slice();
            p.combo = combo.name || "";
            this._apWrite(true);
            this._apRender();
        };

        nodeType.prototype._apBuild = function () {
            injectStyles();
            var self = this;
            var wrap = document.createElement("div");
            wrap.className = "apick-wrap";
            wrap.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
            wrap.addEventListener("mousedown", function (e) { e.stopPropagation(); });
            wrap.addEventListener("wheel", function (e) { e.stopPropagation(); }, { passive: true });

            var head = document.createElement("div");
            head.className = "apick-head";
            var search = document.createElement("input");
            search.className = "apick-search";
            search.type = "text";
            search.placeholder = T("搜索画师");
            search.addEventListener("input", function () { self._apOnSearch(); });
            search.addEventListener("keydown", function (e) {
                if (e.isComposing || e.keyCode === 229) return;
                if (e.key === "Enter") {
                    e.preventDefault();
                    self._apTakeFirstHit();
                } else if (e.key === "Escape") self._apHideDrop();
            });
            var drop = document.createElement("div");
            drop.className = "apick-drop";
            head.appendChild(search);
            head.appendChild(drop);

            var comboLabel = sectionLabel(T("组合"), APICK_ICO_COMBO);
            comboLabel.classList.add("is-fold");
            comboLabel.tabIndex = 0;
            comboLabel.setAttribute("role", "button");
            var chev = document.createElement("span");
            chev.className = "apick-fold";
            chev.setAttribute("aria-hidden", "true");
            chev.innerHTML = "<svg viewBox=\"0 0 16 16\" fill=\"none\"><path d=\"M4 6.2 8 10.2 12 6.2\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>";
            var eye = document.createElement("button");
            eye.type = "button";
            eye.className = "apick-eye";
            eye.addEventListener("mousedown", function (e) { e.stopPropagation(); });
            eye.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                self._apToggleComboFaces();
            });
            eye.addEventListener("keydown", function (e) { e.stopPropagation(); });
            comboLabel.appendChild(eye);
            comboLabel.appendChild(chev);
            comboLabel.addEventListener("click", function () { self._apToggleCombos(); });
            comboLabel.addEventListener("keydown", function (e) {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                self._apToggleCombos();
            });
            var combos = document.createElement("div");
            combos.className = "apick-combos";

            var outLabel = sectionLabel(T("这次输出"), APICK_ICO_OUT);
            var clearOut = document.createElement("button");
            clearOut.type = "button";
            clearOut.className = "apick-clear";
            clearOut.textContent = T("清空");
            clearOut.title = T("清空这次输出");
            clearOut.hidden = true;
            clearOut.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                self._apClearOut();
            });
            outLabel.appendChild(clearOut);
            var strip = document.createElement("div");
            strip.className = "apick-strip";
            strip.title = T("拖动可调整顺序");

            var listLabel = sectionLabel(T("名单"), APICK_ICO_LIST);
            var grid = document.createElement("div");
            grid.className = "apick-grid apick-roster";
            grid.title = T("拖动可调整顺序");
            var foot = document.createElement("div");
            foot.className = "apick-foot";

            wrap.appendChild(head);
            wrap.appendChild(comboLabel);
            wrap.appendChild(combos);
            wrap.appendChild(outLabel);
            wrap.appendChild(strip);
            wrap.appendChild(listLabel);
            wrap.appendChild(grid);
            wrap.appendChild(foot);

            this._apClearOutBtn = clearOut;
            this._apRoot = wrap;
            this._apSearch = search;
            this._apDrop = drop;
            this._apComboLabel = comboLabel;
            this._apComboEye = eye;
            this._apCombosEl = combos;
            this._apComboShut = false;
            this._apComboFacesOff = false;
            try { this._apComboShut = localStorage.getItem("apick_combo_shut") === "1"; } catch (e) {}
            try { this._apComboFacesOff = localStorage.getItem("apick_combo_faces") === "0"; } catch (e2) {}
            this._apStrip = strip;
            this._apGrid = grid;
            this._apFoot = foot;
            this._apQuery = "";
            this._apHits = [];

            var wdg = this.addDOMWidget("apick_ui", "div", wrap, {
                onDraw: function () { self._apFit(); },
                getMinHeight: function () { return 200; }
            });
            wdg.serialize = false;
            if (!wdg.options) wdg.options = {};
            wdg.options.serialize = false;
            wdg.options.getMinHeight = function () { return 200; };
            delete wdg.computeSize;
            this._apWdg = wdg;
            if (wdg.element) {
                wdg.element.classList.add("apick-host");
                wdg.element.style.overflow = "hidden";
                wdg.element.style.minWidth = "0";
                wdg.element.style.maxWidth = "100%";
            }
            this._apCollapse();
            this._apFit();
        };

        nodeType.prototype._apFit = function () {
            var wrap = this._apRoot;
            if (!wrap) return;
            var slot = this._apWdg && this._apWdg.computedHeight;
            var nh = (slot > 40) ? Math.max(40, Math.floor(slot - 8)) : 0;
            wrap.style.width = "100%";
            wrap.style.maxWidth = "100%";
            wrap.style.minWidth = "0";
            wrap.style.minHeight = "0";
            wrap.style.boxSizing = "border-box";
            if (nh) {
                wrap.style.height = nh + "px";
                wrap.style.maxHeight = nh + "px";
            } else {
                wrap.style.height = "100%";
                wrap.style.maxHeight = "100%";
            }
            wrap.style.overflow = "hidden";
            var host = wrap.parentElement;
            if (host) {
                host.classList.add("apick-host");
                host.style.overflow = "hidden";
                host.style.maxWidth = "100%";
                host.style.maxHeight = "100%";
                host.style.minHeight = "0";
            }
        };

        nodeType.prototype._apHideDrop = function () {
            if (this._apDrop) this._apDrop.classList.remove("on");
        };

        nodeType.prototype._apReload = function () {
            var self = this;
            if (self._apLoading) return;
            self._apLoading = true;
            Promise.all([
                fetch("/danbooru_anima/favorites?cats=artists").then(function (r) { return r.json(); }).catch(function () { return null; }),
                fetch("/gelbooru_anima/favorites?cats=artists").then(function (r) { return r.json(); }).catch(function () { return null; }),
                fetch("/danbooru_anima/load_userdata").then(function (r) { return r.json(); }).catch(function () { return null; }),
                fetch("/danbooru_anima/favorites?cats=animadex_artists").then(function (r) { return r.json(); }).catch(function () { return null; })
            ]).then(function (trio) {
                var map = {};
                var joinAt = 0;
                function ingest(d, source) {
                    var arts = (d && d.favorites && d.favorites.artists) || {};
                    var seen = {};
                    function take(k) {
                        if (!k || k === "_order" || String(k).charAt(0) === "_") return;
                        if (seen[k]) return;
                        var info = arts[k];
                        if (!info || typeof info !== "object") return;
                        seen[k] = true;
                        var tag = normTag(k);
                        var key = keyOf(tag);
                        if (!key) return;
                        var row = {
                            tag: tag,
                            thumb: info.thumb || "",
                            cn: cleanCn(info.cn),
                            rating: parseInt(info.rating, 10) || 0,
                            starred: !!(info.starred || info.star),
                            source: source,
                            joined: joinAt++
                        };
                        var cur = map[key];
                        if (!cur) { map[key] = row; return; }
                        if (!cur.thumb && row.thumb) cur.thumb = row.thumb;
                        if (!cur.cn && row.cn) cur.cn = row.cn;
                        if (row.rating > cur.rating) cur.rating = row.rating;
                        if (row.starred) cur.starred = true;
                    }
                    var order = Array.isArray(arts._order) ? arts._order : [];
                    order.forEach(take);
                    Object.keys(arts).forEach(take);
                }
                ingest(trio[0], "danbooru");
                ingest(trio[1], "gelbooru");
                self._apFav = map;
                self._apIndexKnown(trio[3]);
                self._apFavRanked = null;
                self._apFavRankedMode = "";
                self._apPinOrder = readPinOrder();
                var local = readLocalCombos();
                var server = (trio[2] && trio[2].success && trio[2].data && Array.isArray(trio[2].data.danbooru_artist_combos)) ? trio[2].data.danbooru_artist_combos : [];
                var names = {};
                local.forEach(function (c) { if (c && c.name) names[c.name] = true; });
                server.forEach(function (c) {
                    if (c && c.name && !names[c.name]) { local.push(c); names[c.name] = true; }
                });
                self._apCombos = local;
                self._apBackupComboThumbs(local);
                self._apFavReady = true;
                self._apComboSig = "";
                if (!self._apEnsure().seeded) self._apSeed();
                self._apApplyKnownThumbs();
            }).catch(function () {
                self._apFav = self._apFav || {};
                self._apIndexKnown(null);
                self._apCombos = self._apCombos || readLocalCombos();
                self._apFavReady = true;
                if (!self._apEnsure().seeded) self._apSeed();
                self._apApplyKnownThumbs();
            }).then(function () {
                self._apLoading = false;
                self._apRender();
                if (self._apMask && self._apAddMode !== "adex" && self._apAddMode !== "manual") self._apPaintFav();
            });
        };

        nodeType.prototype._apBackupComboThumbs = function (combos) {
            var self = this;
            var jobs = [];
            this._apComboBackupMiss = this._apComboBackupMiss || {};
            (combos || []).forEach(function (c, i) {
                var raw = c && c.thumbs && c.thumbs[0];
                if (!raw || String(raw).indexOf("/danbooru_anima/combo_thumb/") >= 0) return;
                var parts = viewThumbParts(raw);
                if (!parts) return;
                var id = parts.filename + "\0" + parts.subfolder;
                if (self._apComboBackupMiss[id]) return;
                jobs.push({ i: i, parts: parts, id: id });
            });
            if (!jobs.length) return;
            var seq = (this._apComboBackupSeq || 0) + 1;
            this._apComboBackupSeq = seq;
            var pending = jobs.length;
            var changed = false;
            jobs.forEach(function (job) {
                copyComboThumbFile(job.parts.filename, job.parts.subfolder).then(function (url) {
                    if (self._apComboBackupSeq !== seq) return;
                    var row = combos[job.i];
                    if (row) { row.thumbs = [url]; changed = true; }
                }).catch(function () {
                    self._apComboBackupMiss[job.id] = 1;
                }).then(function () {
                    pending -= 1;
                    if (pending > 0 || self._apComboBackupSeq !== seq || !changed) return;
                    try { localStorage.setItem("danbooru_artist_combos", JSON.stringify(combos)); } catch (e) {}
                    if (window.animaPublishArtistCombos) window.animaPublishArtistCombos(combos);
                    self._apCombos = combos;
                    self._apComboSig = "";
                    self._apRender();
                });
            });
        };

        nodeType.prototype._apRender = function () {
            this._apRenderCombos();
            this._apRenderStrip();
            this._apRenderRoster();
            this._apRenderFoot();
            this._apFit();
        };

        nodeType.prototype._apComboArtists = function (combo) {
            var self = this;
            return dedupeTags(combo.artists || []).map(function (t) { return self._apItem(t); });
        };

        nodeType.prototype._apToggleCombos = function () {
            this._apComboShut = !this._apComboShut;
            try { localStorage.setItem("apick_combo_shut", this._apComboShut ? "1" : "0"); } catch (e) {}
            this._apRenderCombos();
        };

        nodeType.prototype._apToggleComboFaces = function () {
            this._apComboFacesOff = !this._apComboFacesOff;
            try { localStorage.setItem("apick_combo_faces", this._apComboFacesOff ? "0" : "1"); } catch (e) {}
            this._apRenderCombos();
            this._apFit();
        };

        nodeType.prototype._apSyncComboEye = function () {
            var eye = this._apComboEye;
            if (!eye) return;
            var off = !!this._apComboFacesOff;
            eye.classList.toggle("is-off", off);
            eye.innerHTML = off ? APICK_ICO_EYE_OFF : APICK_ICO_EYE;
            eye.title = off ? T("显示具体画师缩略图") : T("隐藏具体画师缩略图");
            eye.setAttribute("aria-label", eye.title);
            eye.setAttribute("aria-pressed", off ? "true" : "false");
        };

        nodeType.prototype._apRenderCombos = function () {
            var row = this._apCombosEl;
            var label = this._apComboLabel;
            if (!row || !label) return;
            var combos = this._apCombos || [];
            var show = combos.length > 0;
            var shut = !!this._apComboShut;
            label.style.display = show ? "" : "none";
            label.classList.toggle("is-shut", shut);
            label.title = shut ? T("展开组合") : T("折叠组合");
            row.style.display = (show && !shut) ? "" : "none";
            row.classList.toggle("is-faces-off", !!this._apComboFacesOff);
            this._apSyncComboEye();
            if (!show) return;
            var facesOff = !!this._apComboFacesOff;
            var sig = (this._apFavReady ? "1" : "0") + ":" + (facesOff ? "0" : "1") + ":" + Object.keys(this._apFav || {}).length + "\n" + combos.map(function (c, i) {
                var thumb = (c.thumbs && c.thumbs[0]) ? String(c.thumbs[0]) : "";
                return i + ":" + (c.name || "") + ":" + (c.artists || []).join(",") + ":" + thumb;
            }).join("\n");
            var self = this;
            if (this._apComboSig !== sig) {
                var top = row.scrollTop;
                this._apComboSig = sig;
                row.innerHTML = "";
                combos.forEach(function (combo) {
                    var b = document.createElement("button");
                    b.type = "button";
                    b.className = "apick-combo";
                    var pics = document.createElement("div");
                    pics.className = "apick-combo-pics";
                    var coverSrc = comboThumb(combo);
                    if (coverSrc) {
                        var cover = document.createElement("div");
                        cover.className = "apick-cover";
                        var img = document.createElement("img");
                        img.className = "apick-thumb";
                        img.alt = "";
                        img.draggable = false;
                        img.decoding = "async";
                        img.src = coverSrc;
                        img.onerror = function () {
                            if (cover.parentNode) cover.parentNode.removeChild(cover);
                        };
                        cover.appendChild(img);
                        bindThumbHover(cover, coverSrc);
                        pics.appendChild(cover);
                    }
                    var people = self._apComboArtists(combo);
                    if (!self._apComboFacesOff) {
                        var faces = document.createElement("div");
                        faces.className = "apick-faces";
                        var cap = 4;
                        var shown = people.slice(0, people.length > cap ? cap - 1 : cap);
                        var more = people.length - shown.length;
                        shown.forEach(function (person) { faces.appendChild(makeFace(person, { tiny: true })); });
                        if (more > 0) {
                            var extra = document.createElement("div");
                            extra.className = "apick-more";
                            extra.textContent = "+" + more;
                            faces.appendChild(extra);
                        }
                        if (faces.childNodes.length) pics.appendChild(faces);
                    }
                    if (!pics.childNodes.length) {
                        var ph = document.createElement("div");
                        ph.className = "apick-ph";
                        ph.textContent = (combo.name || "?").charAt(0);
                        pics.appendChild(ph);
                    }
                    var foot = document.createElement("div");
                    foot.className = "apick-combo-foot";
                    var nm = document.createElement("div");
                    nm.className = "apick-combo-name";
                    nm.textContent = combo.name || T("组合");
                    var see = document.createElement("span");
                    see.className = "apick-combo-see";
                    see.title = T("看这个组合的成图");
                    see.setAttribute("role", "button");
                    see.setAttribute("aria-label", see.title);
                    see.innerHTML = APICK_ICO_SEE;
                    see.addEventListener("mousedown", function (ev) { ev.stopPropagation(); });
                    see.addEventListener("click", function (ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        openComboInViewer(combo);
                    });
                    foot.appendChild(nm);
                    foot.appendChild(see);
                    var who = people.map(function (p) { return showName(p.tag); }).filter(Boolean);
                    b.title = who.length ? ((combo.name || "") + " · " + who.join(" · ")) : (combo.name || "");
                    b.appendChild(pics);
                    b.appendChild(foot);
                    b.addEventListener("click", function () { self._apApplyCombo(combo); });
                    b.addEventListener("contextmenu", function (ev) {
                        if (ev.target && ev.target.closest && ev.target.closest(".apick-face")) return;
                        ev.preventDefault();
                        ev.stopPropagation();
                        hideThumbHover();
                        openComboMenu(self, combo, ev.clientX, ev.clientY);
                    });
                    row.appendChild(b);
                });
                row.scrollTop = top;
            }
            this._apMarkCombos();
        };

        nodeType.prototype._apMarkCombos = function () {
            var row = this._apCombosEl;
            if (!row) return;
            var combos = this._apCombos || [];
            var active = (this._apEnsure().combo) || "";
            var buttons = row.querySelectorAll(".apick-combo");
            buttons.forEach(function (b, i) {
                var name = (combos[i] && combos[i].name) || "";
                b.classList.toggle("on", !!active && active === name);
            });
        };

        nodeType.prototype._apDestroySort = function () {
            var strip = this._apStrip;
            if (strip && strip._apSort) {
                try { strip._apSort.destroy(); } catch (e) {}
                strip._apSort = null;
            }
        };

        nodeType.prototype._apBindSort = function () {
            var strip = this._apStrip;
            if (!strip || strip._apSort) return;
            ensureSortable();
            var self = this;
            function go(tries) {
                if (!self._apStrip || self._apStrip !== strip) return;
                if (!window.Sortable) {
                    if (tries < 20) setTimeout(function () { go(tries + 1); }, 200);
                    return;
                }
                if (strip._apSort) return;
                strip._apSort = window.Sortable.create(strip, {
                    animation: 140,
                    draggable: ".apick-chip",
                    filter: ".apick-x",
                    preventOnFilter: true,
                    forceFallback: true,
                    fallbackOnBody: true,
                    fallbackTolerance: 5,
                    ghostClass: "apick-ghost",
                    chosenClass: "apick-chosen",
                    onEnd: function () { self._apReadStripOrder(); }
                });
            }
            go(0);
        };

        nodeType.prototype._apDestroyRosterSort = function () {
            var grid = this._apGrid;
            if (grid && grid._apSort) {
                try { grid._apSort.destroy(); } catch (e) {}
                grid._apSort = null;
            }
        };

        nodeType.prototype._apBindRosterSort = function () {
            var grid = this._apGrid;
            if (!grid || grid._apSort || this._apQuery) return;
            ensureSortable();
            var self = this;
            function go(tries) {
                if (!self._apGrid || self._apGrid !== grid || self._apQuery) return;
                if (!window.Sortable) {
                    if (tries < 20) setTimeout(function () { go(tries + 1); }, 200);
                    return;
                }
                if (grid._apSort) return;
                grid._apSort = window.Sortable.create(grid, {
                    animation: 140,
                    draggable: ".apick-tile[data-tag]",
                    filter: ".apick-x, .apick-add",
                    preventOnFilter: true,
                    forceFallback: true,
                    fallbackOnBody: true,
                    fallbackTolerance: 5,
                    ghostClass: "apick-ghost",
                    chosenClass: "apick-chosen",
                    onEnd: function (evt) {
                        var add = grid.querySelector(".apick-add");
                        if (add && add.parentNode === grid) grid.insertBefore(add, grid.firstChild);
                        var moved = !!(evt && evt.oldIndex !== evt.newIndex);
                        if (moved && evt.item) evt.item._apJustDragged = true;
                        if (moved) self._apReadRosterOrder();
                    }
                });
            }
            go(0);
        };

        nodeType.prototype._apCanRosterFront = function (tag) {
            var k = keyOf(tag);
            var roster = this._apEnsure().roster || [];
            var idx = -1;
            roster.forEach(function (x, i) { if (keyOf(x.tag) === k) idx = i; });
            return idx > 0;
        };

        nodeType.prototype._apRosterToFront = function (tag) {
            var p = this._apEnsure();
            var k = keyOf(tag);
            var idx = -1;
            (p.roster || []).forEach(function (x, i) { if (keyOf(x.tag) === k) idx = i; });
            if (idx <= 0) return;
            var row = p.roster.splice(idx, 1)[0];
            p.roster.unshift(row);
            this._apRosterSig = "";
            this._apScrollRosterTop = true;
            this._apWrite(true);
            this._apRender();
        };

        nodeType.prototype._apReadRosterOrder = function () {
            var grid = this._apGrid;
            if (!grid) return;
            var order = [];
            grid.querySelectorAll(".apick-tile[data-tag]").forEach(function (el) {
                if (el.dataset.tag) order.push(normTag(el.dataset.tag));
            });
            var p = this._apEnsure();
            var byKey = {};
            (p.roster || []).forEach(function (row) { byKey[keyOf(row.tag)] = row; });
            var next = [];
            var seen = {};
            order.forEach(function (tag) {
                var k = keyOf(tag);
                var row = byKey[k];
                if (!row || seen[k]) return;
                seen[k] = true;
                next.push(row);
            });
            (p.roster || []).forEach(function (row) {
                var k = keyOf(row.tag);
                if (!k || seen[k]) return;
                seen[k] = true;
                next.push(row);
            });
            p.roster = next;
            this._apRosterSig = next.map(function (x) { return keyOf(x.tag); }).join("|") + "\n" + String(this._apQuery || "") + "\n" + (this._apFavReady ? "1" : "0");
            this._apWrite(true);
        };

        nodeType.prototype._apReadStripOrder = function () {
            var strip = this._apStrip;
            if (!strip) return;
            var order = [];
            strip.querySelectorAll(".apick-chip").forEach(function (el) {
                if (el.dataset.tag) order.push(normTag(el.dataset.tag));
            });
            var p = this._apEnsure();
            p.selected = dedupeTags(order);
            this._apStripSig = "s:" + (this._apFavReady ? "1" : "0") + ":" + p.selected.join("|");
            this._apSyncCombo();
            this._apWrite(true);
            this._apMarkCombos();
            this._apMarkRoster();
            this._apRenderFoot();
        };

        nodeType.prototype._apRenderStrip = function () {
            var strip = this._apStrip;
            if (!strip) return;
            var p = this._apEnsure();
            var sig = "s:" + (this._apFavReady ? "1" : "0") + ":" + p.selected.join("|");
            if (this._apClearOutBtn) this._apClearOutBtn.hidden = !p.selected.length;
            if (this._apStripSig === sig) return;
            var left = strip.scrollLeft;
            this._apDestroySort();
            this._apStripSig = sig;
            strip.innerHTML = "";
            if (!p.selected.length) {
                var hint = document.createElement("div");
                hint.className = "apick-placeholder";
                hint.textContent = T("从下面点一位画师");
                strip.appendChild(hint);
                strip.scrollLeft = left;
                return;
            }
            var self = this;
            p.selected.forEach(function (tag) {
                var item = self._apItem(tag);
                var chip = document.createElement("div");
                chip.className = "apick-chip";
                chip.dataset.tag = item.tag;
                chip.title = T("拖动可调整顺序");
                bindArtistMenu(chip, item.tag);
                var face = makeFace(item);
                face.appendChild(makeX(T("移出这次输出"), function () { self._apDropOut(item.tag); }));
                var name = document.createElement("div");
                name.className = "apick-name";
                name.textContent = showName(item.tag);
                chip.appendChild(face);
                chip.appendChild(name);
                strip.appendChild(chip);
            });
            strip.scrollLeft = left;
            this._apBindSort();
        };

        nodeType.prototype._apRosterView = function () {
            var p = this._apEnsure();
            var q = queryText(this._apQuery);
            var qn = q.replace(/\s+/g, "_");
            var qs = q.replace(/_/g, " ");
            var rows = (p.roster || []).filter(function (item) {
                if (!q) return true;
                var name = keyOf(item.tag);
                var cn = String(item.cn || "").toLowerCase();
                return name.indexOf(qn) >= 0 || name.replace(/_/g, " ").indexOf(qs) >= 0 || cn.indexOf(q) >= 0;
            });
            if (q && window.animaFuzzyCmp) {
                rows.sort(function (a, b) { return window.animaFuzzyCmp(q, a, b); });
            }
            return rows;
        };

        nodeType.prototype._apRenderRoster = function () {
            var grid = this._apGrid;
            if (!grid) return;
            var p = this._apEnsure();
            var q = String(this._apQuery || "");
            var sig = (p.roster || []).map(function (x) { return keyOf(x.tag); }).join("|") + "\n" + q + "\n" + (this._apFavReady ? "1" : "0");
            if (this._apRosterSig !== sig) {
                var pinTop = !!this._apScrollRosterTop;
                var top = pinTop ? 0 : grid.scrollTop;
                this._apScrollRosterTop = false;
                this._apDestroyRosterSort();
                this._apRosterSig = sig;
                grid.innerHTML = "";
                var self = this;
                var add = document.createElement("button");
                add.type = "button";
                add.className = "apick-add";
                add.title = T("添加画师");
                add.setAttribute("aria-label", T("添加画师"));
                add.textContent = "+";
                add.addEventListener("click", function () { self._apOpenFav(); });
                grid.appendChild(add);
                var view = this._apRosterView();
                if (!view.length) {
                    var empty = document.createElement("div");
                    empty.className = "apick-empty";
                    empty.textContent = q ? T("没有匹配的画师") : (this._apFavReady ? T("名单是空的") : T("加载中..."));
                    grid.appendChild(empty);
                }
                view.forEach(function (item) {
                    var b = document.createElement("button");
                    b.type = "button";
                    b.className = "apick-tile";
                    b.dataset.tag = item.tag;
                    b.title = (item.cn ? (item.cn + " · " + showName(item.tag)) : showName(item.tag)) + (q ? "" : (" · " + T("拖动可调整顺序")));
                    var menu = { node: self, roster: true };
                    bindArtistMenu(b, item.tag, menu);
                    var face = makeFace(self._apItem(item.tag, item), { menu: menu });
                    face.appendChild(makeX(T("从名单移除"), function () { self._apDropRoster(item.tag); }));
                    var name = document.createElement("div");
                    name.className = "apick-name";
                    name.textContent = showName(item.tag);
                    b.appendChild(face);
                    b.appendChild(name);
                    b.addEventListener("click", function () {
                        if (b._apJustDragged) { b._apJustDragged = false; return; }
                        self._apToggleOut(item.tag);
                    });
                    grid.appendChild(b);
                });
                if (!q || pinTop) grid.scrollTop = top;
                this._apBindRosterSort();
            }
            this._apMarkRoster();
        };

        nodeType.prototype._apMarkRoster = function () {
            var grid = this._apGrid;
            if (!grid) return;
            var sel = {};
            this._apEnsure().selected.forEach(function (t) { sel[keyOf(t)] = true; });
            grid.querySelectorAll(".apick-tile[data-tag]").forEach(function (el) {
                el.classList.toggle("on", !!sel[keyOf(el.dataset.tag)]);
            });
        };

        nodeType.prototype._apRenderFoot = function () {
            var foot = this._apFoot;
            if (!foot) return;
            var selected = this._apEnsure().selected;
            if (!selected.length) {
                foot.style.display = "none";
                foot.textContent = "";
                return;
            }
            foot.style.display = "";
            foot.textContent = selected.join(", ");
            foot.title = selected.join(", ");
        };

        nodeType.prototype._apOnSearch = function () {
            var q = (this._apSearch && this._apSearch.value || "").trim();
            this._apQuery = q;
            this._apRenderRoster();
            if (!q) { this._apHideDrop(); return; }
            this._apSearchDrop(q);
        };

        nodeType.prototype._apSearchDrop = function (q) {
            var self = this;
            var seq = (this._apSeq || 0) + 1;
            this._apSeq = seq;
            var ql = q.toLowerCase().replace(/^@+/, "");
            var qn = ql.replace(/\s+/g, "_");
            var roster = {};
            (this._apEnsure().roster || []).forEach(function (x) { roster[keyOf(x.tag)] = true; });
            var favHits = [];
            Object.keys(this._apFav || {}).forEach(function (k) {
                if (roster[k]) return;
                var it = self._apFav[k];
                var cn = String(it.cn || "").toLowerCase();
                if (k.indexOf(qn) >= 0 || k.replace(/_/g, " ").indexOf(ql.replace(/_/g, " ")) >= 0 || cn.indexOf(ql) >= 0) favHits.push(it);
            });
            favHits.sort(function (a, b) {
                if (window.animaFuzzyCmp) {
                    var c = window.animaFuzzyCmp(ql, { tag: a.tag, cn: a.cn }, { tag: b.tag, cn: b.cn });
                    if (c) return c;
                }
                return (b.rating || 0) - (a.rating || 0);
            });
            favHits = favHits.slice(0, 8);
            var paint = function (extra) {
                if (self._apSeq !== seq) return;
                extra = extra || [];
                self._apHits = favHits.concat(extra);
                if (!favHits.length && !extra.length) { self._apHideDrop(); return; }
                self._apPaintDrop(favHits, extra);
            };
            paint([]);
            clearTimeout(this._apTimer);
            this._apTimer = setTimeout(function () {
                fetch("/danbooru_anima/fuzzy_tags", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ query: q })
                }).then(function (r) { return r.json(); }).then(function (d) {
                    var items = (d && d.tags) || [];
                    var names = items.map(function (it) { return it.tag; }).filter(Boolean);
                    if (!names.length) return paint([]);
                    return fetch("/danbooru_anima/tag_categories", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ tags: names })
                    }).then(function (r) { return r.json(); }).then(function (cat) {
                        var cmap = (cat && cat.categories) || {};
                        var extra = [];
                        items.forEach(function (it) {
                            if (extra.length >= 8) return;
                            var k = keyOf(it.tag);
                            if (!k || roster[k] || (self._apFav && self._apFav[k])) return;
                            if (cmap[it.tag] !== 1 && cmap[String(it.tag).toLowerCase()] !== 1) return;
                            extra.push({ tag: normTag(it.tag), cn: cleanCn(it.cn), thumb: "", source: "danbooru" });
                        });
                        paint(extra);
                    });
                }).catch(function () { paint([]); });
            }, 200);
        };

        nodeType.prototype._apPaintDrop = function (favHits, extra) {
            var drop = this._apDrop;
            if (!drop) return;
            var self = this;
            drop.innerHTML = "";
            function addSection(label, list) {
                if (!list.length) return;
                var sec = document.createElement("div");
                sec.className = "apick-sec";
                sec.textContent = label;
                drop.appendChild(sec);
                list.forEach(function (it) {
                    var row = document.createElement("button");
                    row.type = "button";
                    row.className = "apick-hit";
                    var src = thumbSrc(it);
                    if (src) {
                        var img = document.createElement("img");
                        img.alt = "";
                        img.src = src;
                        img.onerror = function () {
                            img.replaceWith(makeChibi("apick-mini"));
                        };
                        row.appendChild(img);
                    } else {
                        row.appendChild(makeChibi("apick-mini"));
                    }
                    var name = document.createElement("b");
                    name.textContent = showName(it.tag);
                    row.appendChild(name);
                    if (it.cn) {
                        var cn = document.createElement("span");
                        cn.textContent = it.cn;
                        row.appendChild(cn);
                    }
                    row.addEventListener("mousedown", function (e) { e.preventDefault(); e.stopPropagation(); });
                    row.addEventListener("click", function (e) {
                        e.stopPropagation();
                        self._apPickHit(it);
                    });
                    drop.appendChild(row);
                });
            }
            addSection(T("收藏里"), favHits);
            addSection(T("其他画师"), extra);
            drop.classList.add("on");
        };

        nodeType.prototype._apPickHit = function (it) {
            this._apAdd(it);
            if (this._apSearch) this._apSearch.value = "";
            this._apQuery = "";
            this._apHideDrop();
            this._apRender();
        };

        nodeType.prototype._apTakeFirstHit = function () {
            var hits = this._apHits || [];
            if (hits.length) this._apPickHit(hits[0]);
        };

        nodeType.prototype._apSortFav = function (list, mode) {
            var out = (list || []).slice();
            if (mode === "new" || mode === "old") {
                out.sort(function (a, b) {
                    var ja = a.joined == null ? 1000000000 : a.joined;
                    var jb = b.joined == null ? 1000000000 : b.joined;
                    if (ja !== jb) return mode === "new" ? (jb - ja) : (ja - jb);
                    return keyOf(a.tag).localeCompare(keyOf(b.tag));
                });
                return out;
            }
            if (mode === "name" || mode === "namez") {
                out.sort(function (a, b) {
                    var c = keyOf(a.tag).localeCompare(keyOf(b.tag));
                    return mode === "namez" ? -c : c;
                });
                return out;
            }
            return this._apRanked(out);
        };

        nodeType.prototype._apFavSorted = function () {
            var mode = this._apFavSort || readFavSort();
            if (this._apFavRanked && this._apFavRankedMode === mode) return this._apFavRanked;
            var fav = this._apFav || {};
            var list = [];
            for (var k in fav) list.push(fav[k]);
            this._apFavRankedMode = mode;
            this._apFavRanked = this._apSortFav(list, mode);
            return this._apFavRanked;
        };

        nodeType.prototype._apFavCard = function (tile, sel) {
            var self = this;
            var b = document.createElement("button");
            b.type = "button";
            b.className = "apick-tile" + (sel[keyOf(tile.tag)] ? " on" : "");
            b.title = tile.cn ? (tile.cn + " · " + showName(tile.tag)) : showName(tile.tag);
            b.appendChild(makeFace(tile, { tiny: true, lazy: true }));
            var name = document.createElement("div");
            name.className = "apick-name";
            name.textContent = showName(tile.tag);
            b.appendChild(name);
            b.addEventListener("click", function () {
                var k = keyOf(tile.tag);
                var on = b.classList.contains("on");
                if (on) self._apDropOut(tile.tag);
                else self._apAdd(tile);
                b.classList.toggle("on", !on);
            });
            return b;
        };

        nodeType.prototype._apOpenFav = function () {
            var self = this;
            this._apFavSeq = (this._apFavSeq || 0) + 1;
            this._apAdexSeq = (this._apAdexSeq || 0) + 1;
            if (this._apAdexTimer) { clearTimeout(this._apAdexTimer); this._apAdexTimer = 0; }
            if (this._apMask) this._apMask.remove();
            var mask = document.createElement("div");
            mask.className = "apick-mask";
            var panel = document.createElement("div");
            panel.className = "apick-panel";
            if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(panel);
            var bar = document.createElement("div");
            bar.className = "apick-panel-h";
            var title = document.createElement("div");
            title.textContent = T("添加画师");
            var close = document.createElement("button");
            close.type = "button";
            close.className = "apick-close";
            close.textContent = "×";
            close.title = T("关闭");
            function shut() {
                self._apFavSeq = (self._apFavSeq || 0) + 1;
                self._apAdexSeq = (self._apAdexSeq || 0) + 1;
                if (self._apAdexTimer) { clearTimeout(self._apAdexTimer); self._apAdexTimer = 0; }
                mask.remove();
                if (self._apMask === mask) self._apMask = null;
            }
            close.addEventListener("click", shut);
            bar.appendChild(title);
            bar.appendChild(close);
            var tabs = document.createElement("div");
            tabs.className = "apick-sorts";
            [
                { id: "fav", label: "收藏" },
                { id: "adex", label: "AnimaDex" },
                { id: "manual", label: "手动" }
            ].forEach(function (tab) {
                var b = document.createElement("button");
                b.type = "button";
                b.className = "apick-sort";
                b.dataset.mode = tab.id;
                b.textContent = T(tab.label);
                b.addEventListener("click", function () {
                    if (self._apAddMode === tab.id) return;
                    self._apSetAddMode(tab.id);
                });
                tabs.appendChild(b);
            });
            var search = document.createElement("input");
            search.className = "apick-search";
            search.type = "text";
            search.placeholder = T("搜索画师");
            search.addEventListener("input", function () {
                if (self._apAddMode === "adex") {
                    self._apAdexQuery = search.value;
                    if (self._apAdexView === "fav") self._apPaintAdexFav();
                    else {
                        self._apAdexPage = 1;
                        self._apQueueAdex();
                    }
                    return;
                }
                if (self._apAddMode === "fav") {
                    self._apFavQuery = search.value;
                    self._apPaintFav();
                }
            });
            var sorts = document.createElement("div");
            sorts.className = "apick-sorts";
            var modes = [
                { id: "rate", label: "评分", tip: "高分在前" },
                { id: "new", label: "最新加入", tip: "最新加入" },
                { id: "old", label: "最早加入", tip: "最早加入" },
                { id: "name", label: "名称 A-Z", tip: "名称 A-Z" },
                { id: "namez", label: "名称 Z-A", tip: "名称 Z-A" }
            ];
            this._apFavSort = readFavSort();
            modes.forEach(function (mode) {
                var b = document.createElement("button");
                b.type = "button";
                b.className = "apick-sort" + (self._apFavSort === mode.id ? " on" : "");
                b.textContent = T(mode.label);
                b.title = T(mode.tip);
                b.addEventListener("click", function () {
                    if (self._apFavSort === mode.id) return;
                    self._apFavSort = mode.id;
                    self._apFavRanked = null;
                    try { localStorage.setItem("apick_fav_sort", mode.id); } catch (e) {}
                    var buttons = sorts.querySelectorAll(".apick-sort");
                    buttons.forEach(function (el, i) {
                        el.classList.toggle("on", modes[i] && modes[i].id === mode.id);
                    });
                    if (grid) grid.scrollTop = 0;
                    self._apPaintFav();
                });
                sorts.appendChild(b);
            });
            var subs = document.createElement("div");
            subs.className = "apick-sorts";
            [
                { id: "browse", label: "浏览" },
                { id: "fav", label: "收藏夹" }
            ].forEach(function (tab) {
                var b = document.createElement("button");
                b.type = "button";
                b.className = "apick-sort";
                b.dataset.view = tab.id;
                b.textContent = T(tab.label);
                b.addEventListener("click", function () {
                    if (self._apAdexView === tab.id) return;
                    self._apAdexView = tab.id;
                    try { localStorage.setItem("apick_adex_view", tab.id); } catch (e) {}
                    self._apShowAdex();
                });
                subs.appendChild(b);
            });
            var manual = document.createElement("div");
            manual.className = "apick-manual";
            var manualInput = document.createElement("input");
            manualInput.className = "apick-search";
            manualInput.type = "text";
            manualInput.placeholder = T("例如 wanke 或 ask_(skeb)");
            var manualGo = document.createElement("button");
            manualGo.type = "button";
            manualGo.className = "apick-addgo";
            manualGo.textContent = T("添加");
            function submitManual() {
                var parts = String(manualInput.value || "").split(/[,，\n]+/);
                var items = [];
                parts.forEach(function (part) {
                    var tag = animaArtistTag(part);
                    if (!tag) return;
                    items.push({ tag: tag, thumb: "", cn: "", source: "manual" });
                });
                if (!items.length) return;
                self._apAddMany(items);
                manualInput.value = "";
            }
            manualInput.addEventListener("keydown", function (e) {
                if (e.key !== "Enter") return;
                e.preventDefault();
                submitManual();
            });
            manualGo.addEventListener("click", submitManual);
            manual.appendChild(manualInput);
            manual.appendChild(manualGo);
            var hint = document.createElement("div");
            hint.className = "apick-manual-hint";
            hint.textContent = T("输入后回车添加。和收藏是同一人就用收藏缩略图，没有就用占位形象。多个用逗号分开");
            var grid = document.createElement("div");
            grid.className = "apick-grid";
            panel.appendChild(bar);
            panel.appendChild(tabs);
            panel.appendChild(subs);
            panel.appendChild(search);
            panel.appendChild(sorts);
            panel.appendChild(manual);
            panel.appendChild(hint);
            panel.appendChild(grid);
            mask.appendChild(panel);
            mask.addEventListener("mousedown", function (e) {
                if (e.target !== mask) return;
                shut();
            });
            document.body.appendChild(mask);
            this._apMask = mask;
            this._apFavGrid = grid;
            this._apAddTabs = tabs;
            this._apAdexSubs = subs;
            this._apFavSorts = sorts;
            this._apAddSearch = search;
            this._apManual = manual;
            this._apManualHint = hint;
            this._apManualInput = manualInput;
            this._apFavQuery = "";
            this._apAdexQuery = "";
            this._apAdexPage = 1;
            var saved = "";
            try { saved = localStorage.getItem("apick_add_mode") || ""; } catch (e) {}
            if (saved !== "fav" && saved !== "adex" && saved !== "manual") {
                saved = Object.keys(this._apFav || {}).length ? "fav" : "adex";
            }
            var view = "";
            try { view = localStorage.getItem("apick_adex_view") || ""; } catch (e2) {}
            this._apAdexView = view === "fav" ? "fav" : "browse";
            this._apSetAddMode(saved);
            var focusEl = saved === "manual" ? manualInput : search;
            try { focusEl.focus({ preventScroll: true }); } catch (e3) { try { focusEl.focus(); } catch (e4) {} }
        };

        nodeType.prototype._apPaintFav = function () {
            var grid = this._apFavGrid;
            var mask = this._apMask;
            if (!grid || !mask) return;
            if (this._apAddMode && this._apAddMode !== "fav") return;
            var seq = (this._apFavSeq || 0) + 1;
            this._apFavSeq = seq;
            var self = this;
            var sel = {};
            this._apEnsure().selected.forEach(function (t) { sel[keyOf(t)] = true; });
            var q = queryText(this._apFavQuery);
            var qn = q.replace(/\s+/g, "_");
            var qs = q.replace(/_/g, " ");
            var list = this._apFavSorted();
            if (q) {
                list = list.filter(function (it) {
                    var name = keyOf(it.tag);
                    var cn = String(it.cn || "").toLowerCase();
                    return name.indexOf(qn) >= 0 || name.replace(/_/g, " ").indexOf(qs) >= 0 || cn.indexOf(q) >= 0;
                });
                if (window.animaFuzzyCmp) {
                    list.sort(function (a, b) { return window.animaFuzzyCmp(q, a, b); });
                }
            }
            grid.textContent = "";
            if (!list.length) {
                var empty = document.createElement("div");
                empty.className = "apick-empty";
                empty.textContent = q ? T("没有匹配的画师") : (this._apFavReady ? T("还没有收藏画师") : T("加载中..."));
                grid.appendChild(empty);
                return;
            }
            var i = 0;
            function step() {
                if (self._apFavSeq !== seq || self._apMask !== mask) return;
                var frag = document.createDocumentFragment();
                var n = 0;
                while (i < list.length && n < 48) {
                    frag.appendChild(self._apFavCard(list[i], sel));
                    i++;
                    n++;
                }
                grid.appendChild(frag);
                if (i < list.length) requestAnimationFrame(step);
            }
            step();
        };

        nodeType.prototype._apSetAddMode = function (mode) {
            if (mode !== "fav" && mode !== "adex" && mode !== "manual") mode = "fav";
            this._apAddMode = mode;
            try { localStorage.setItem("apick_add_mode", mode); } catch (e) {}
            if (this._apAddTabs) {
                this._apAddTabs.querySelectorAll(".apick-sort").forEach(function (el) {
                    el.classList.toggle("on", el.dataset.mode === mode);
                });
            }
            if (this._apFavSorts) this._apFavSorts.style.display = mode === "fav" ? "" : "none";
            if (this._apAdexSubs) this._apAdexSubs.style.display = mode === "adex" ? "" : "none";
            if (this._apAddSearch) {
                this._apAddSearch.style.display = mode === "manual" ? "none" : "";
                this._apAddSearch.placeholder = mode === "adex" ? T("搜索 AnimaDex 画师") : T("搜索画师");
                this._apAddSearch.value = mode === "adex" ? (this._apAdexQuery || "") : (this._apFavQuery || "");
            }
            if (this._apManual) this._apManual.style.display = mode === "manual" ? "" : "none";
            if (this._apManualHint) this._apManualHint.style.display = mode === "manual" ? "" : "none";
            if (this._apFavGrid) this._apFavGrid.style.display = mode === "manual" ? "none" : "";
            if (mode === "fav") this._apPaintFav();
            else if (mode === "adex") this._apShowAdex();
            else if (this._apFavGrid) this._apFavGrid.textContent = "";
            if (mode === "manual" && this._apManualInput) {
                try { this._apManualInput.focus({ preventScroll: true }); } catch (e2) {}
            }
        };

        nodeType.prototype._apShowAdex = function () {
            var view = this._apAdexView === "fav" ? "fav" : "browse";
            this._apAdexView = view;
            if (this._apAdexSubs) {
                this._apAdexSubs.querySelectorAll(".apick-sort").forEach(function (el) {
                    el.classList.toggle("on", el.dataset.view === view);
                });
            }
            if (view === "fav") this._apPaintAdexFav();
            else this._apRunAdex();
        };

        nodeType.prototype._apQueueAdex = function () {
            var self = this;
            if (this._apAdexTimer) clearTimeout(this._apAdexTimer);
            this._apAdexTimer = setTimeout(function () {
                self._apAdexTimer = 0;
                self._apRunAdex();
            }, 300);
        };

        nodeType.prototype._apRunAdex = function () {
            if (this._apAdexTimer) { clearTimeout(this._apAdexTimer); this._apAdexTimer = 0; }
            this._apAdexPage = 1;
            this._apFetchAdex(false);
        };

        nodeType.prototype._apAdexItem = function (r) {
            r = r || {};
            var raw = r.trigger || r.name || r.slug || "";
            return {
                tag: animaArtistTag(raw),
                thumb: r.thumb_url || "",
                cn: "",
                source: "animadex"
            };
        };

        nodeType.prototype._apFetchAdex = function (append) {
            var self = this;
            var grid = this._apFavGrid;
            var mask = this._apMask;
            if (!grid || !mask || this._apAddMode !== "adex" || this._apAdexView === "fav") return;
            var seq = (this._apAdexSeq || 0) + 1;
            this._apAdexSeq = seq;
            var page = this._apAdexPage || 1;
            var q = String(this._apAdexQuery || "").trim();
            if (!append) {
                grid.textContent = "";
                var loading = document.createElement("div");
                loading.className = "apick-empty";
                loading.textContent = T("正在搜索 AnimaDex…");
                grid.appendChild(loading);
            }
            fetch("/danbooru_anima/animadex_search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "artists", query: q, page: page, sort: "count", filters: {} })
            }).then(function (r) { return r.json(); }).then(function (d) {
                if (seq !== self._apAdexSeq || self._apMask !== mask || self._apAddMode !== "adex" || self._apAdexView === "fav") return;
                var results = (d && d.results) || [];
                if (!append) grid.textContent = "";
                else {
                    var oldMore = grid.querySelector(".apick-morebtn");
                    if (oldMore) oldMore.remove();
                }
                if (!d || d.success === false) {
                    if (!append) {
                        var err = document.createElement("div");
                        err.className = "apick-empty";
                        err.textContent = T("AnimaDex 暂时打不开");
                        grid.appendChild(err);
                    }
                    return;
                }
                if (!results.length && !append) {
                    var empty = document.createElement("div");
                    empty.className = "apick-empty";
                    empty.textContent = q ? T("AnimaDex 没有找到这位画师") : T("AnimaDex 暂时打不开");
                    grid.appendChild(empty);
                    return;
                }
                var sel = {};
                self._apEnsure().selected.forEach(function (t) { sel[keyOf(t)] = true; });
                var frag = document.createDocumentFragment();
                results.forEach(function (row) {
                    var item = self._apAdexItem(row);
                    if (!item.tag) return;
                    frag.appendChild(self._apFavCard(item, sel));
                });
                grid.appendChild(frag);
                var total = d.total || 0;
                if (!q && total && page * 36 < total) {
                    var more = document.createElement("button");
                    more.type = "button";
                    more.className = "apick-morebtn";
                    more.textContent = T("加载更多");
                    more.addEventListener("click", function () {
                        if (more.disabled) return;
                        more.disabled = true;
                        more.textContent = T("加载中...");
                        self._apAdexPage = page + 1;
                        self._apFetchAdex(true);
                    });
                    grid.appendChild(more);
                }
            }).catch(function () {
                if (seq !== self._apAdexSeq || self._apMask !== mask) return;
                if (append) return;
                grid.textContent = "";
                var err = document.createElement("div");
                err.className = "apick-empty";
                err.textContent = T("AnimaDex 暂时打不开");
                grid.appendChild(err);
            });
        };

        nodeType.prototype._apPaintAdexFav = function () {
            var self = this;
            var grid = this._apFavGrid;
            var mask = this._apMask;
            if (!grid || !mask || this._apAddMode !== "adex") return;
            var seq = (this._apAdexSeq || 0) + 1;
            this._apAdexSeq = seq;
            grid.textContent = "";
            var loading = document.createElement("div");
            loading.className = "apick-empty";
            loading.textContent = T("加载中...");
            grid.appendChild(loading);
            fetch("/danbooru_anima/favorites?cats=animadex_artists").then(function (r) { return r.json(); }).then(function (d) {
                if (seq !== self._apAdexSeq || self._apMask !== mask || self._apAddMode !== "adex" || self._apAdexView !== "fav") return;
                var arts = (d && d.favorites && d.favorites.animadex_artists) || {};
                var list = [];
                var seen = {};
                function take(k) {
                    if (!k || k === "_order" || String(k).charAt(0) === "_") return;
                    if (seen[k]) return;
                    var info = arts[k];
                    if (!info || typeof info !== "object") return;
                    seen[k] = 1;
                    var tag = animaArtistTag(k);
                    if (!tag) return;
                    list.push({ tag: tag, thumb: info.thumb || "", cn: cleanCn(info.cn), source: "animadex" });
                }
                (Array.isArray(arts._order) ? arts._order : []).forEach(take);
                Object.keys(arts).forEach(take);
                var q = queryText(self._apAdexQuery);
                var qn = q.replace(/\s+/g, "_");
                var qs = q.replace(/_/g, " ");
                if (q) {
                    list = list.filter(function (it) {
                        var name = keyOf(it.tag);
                        var cn = String(it.cn || "").toLowerCase();
                        return name.indexOf(qn) >= 0 || name.replace(/_/g, " ").indexOf(qs) >= 0 || cn.indexOf(q) >= 0;
                    });
                    if (window.animaFuzzyCmp) {
                        list.sort(function (a, b) { return window.animaFuzzyCmp(q, a, b); });
                    }
                }
                grid.textContent = "";
                if (!list.length) {
                    var empty = document.createElement("div");
                    empty.className = "apick-empty";
                    empty.textContent = q ? T("没有匹配的画师") : T("还没有 AnimaDex 收藏");
                    grid.appendChild(empty);
                    return;
                }
                var sel = {};
                self._apEnsure().selected.forEach(function (t) { sel[keyOf(t)] = true; });
                list.forEach(function (it) { grid.appendChild(self._apFavCard(it, sel)); });
            }).catch(function () {
                if (seq !== self._apAdexSeq || self._apMask !== mask) return;
                grid.textContent = "";
                var err = document.createElement("div");
                err.className = "apick-empty";
                err.textContent = T("AnimaDex 暂时打不开");
                grid.appendChild(err);
            });
        };
    }
});
