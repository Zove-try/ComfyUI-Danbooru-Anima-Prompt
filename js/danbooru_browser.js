import { app } from "/scripts/app.js";
import "./00_anima_i18n.js";
import { $el } from "/scripts/ui.js";
import "./00_anima_queue_snapshot.js?v=3";
import "./00_anima_theme.js";
import "./00_anima_fav_grid.js";
import "./anima_collapse_outputs.js";
// 模块级变量，跟踪事件监听器引用，避免 onNodeCreated 重复添加
let _pageKeyHandlerInstalled = false;
// 全局翻译缓存（跨节点共享，避免作用域问题）
const _globalTagTranslations = {};
const _globalTagCache = {};
const _globalTranslationCache = {};
// 收藏用上次打开帖子的缩略图 URL
let _lastThumbUrl = '';
// 收藏缓存（模块级 = 所有节点共享，解决跨节点同步问题）
let _favCache = null;

function _animaSiteJumpUrl(site, tag) {
    var q = String(tag || "").trim().replace(/ /g, "_");
    if (!q) return "";
    if (site === "gelbooru") return "https://gelbooru.com/index.php?page=post&s=list&tags=" + encodeURIComponent(q);
    return "https://danbooru.donmai.us/posts?tags=" + encodeURIComponent(q);
}

if (!window.animaBm) {
    window.animaBm = {
        _key: "anima_browser_bookmarks_v1",
        _winKey: "anima_bm_win_v1",
        _txt: function(s) { return (typeof window.animaTxt === "function") ? window.animaTxt(s) : s; },
        _skin: function(el) { if (el && typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(el); },
        _read: function() {
            try {
                var d = JSON.parse(localStorage.getItem(this._key) || "{}");
                return (d && typeof d === "object") ? d : {};
            } catch (e) { return {}; }
        },
        _write: function(all) { localStorage.setItem(this._key, JSON.stringify(all)); },
        _loadWin: function() {
            try {
                var d = JSON.parse(localStorage.getItem(this._winKey) || "");
                return (d && typeof d === "object") ? d : null;
            } catch (e) { return null; }
        },
        _saveWin: function(panel) {
            try {
                var r = panel.getBoundingClientRect();
                localStorage.setItem(this._winKey, JSON.stringify({
                    left: Math.round(r.left), top: Math.round(r.top),
                    width: Math.round(r.width), height: Math.round(r.height)
                }));
            } catch (e) {}
        },
        _thumbSrc: function(site, url) {
            var u = String(url || "").trim();
            if (!u) return "";
            if (u.indexOf("image_proxy?url=") >= 0 || u.indexOf("data:") === 0) return u;
            if (u.indexOf("//") === 0) u = "https:" + u;
            else if (u.charAt(0) === "/") return u;
            var base = (site === "gelbooru") ? "/gelbooru_anima/image_proxy?url=" : "/danbooru_anima/image_proxy?url=";
            return base + encodeURIComponent(u);
        },
        _cleanName: function(name) {
            return String(name || "").trim().replace(/\s+/g, " ").slice(0, 80);
        },
        _bindDrag: function(handle, panel) {
            handle.style.cursor = "move";
            handle.onmousedown = function(ev) {
                if (ev.button !== 0) return;
                var t = ev.target;
                var tag = t && t.tagName ? String(t.tagName).toLowerCase() : "";
                if (tag === "button" || tag === "input" || tag === "select" || tag === "textarea") return;
                if (t && t.closest && t.closest("button, input, select, textarea")) return;
                ev.preventDefault();
                var r = panel.getBoundingClientRect();
                var ox = ev.clientX - r.left;
                var oy = ev.clientY - r.top;
                function mv(e) {
                    panel.style.left = (e.clientX - ox) + "px";
                    panel.style.top = (e.clientY - oy) + "px";
                    panel.style.right = "auto";
                    panel.style.transform = "none";
                    if (window.clampPopup) window.clampPopup(panel);
                }
                function up() {
                    document.removeEventListener("mousemove", mv);
                    document.removeEventListener("mouseup", up);
                }
                document.addEventListener("mousemove", mv);
                document.addEventListener("mouseup", up);
            };
        },
        list: function(site) {
            var arr = this._read()[site];
            return Array.isArray(arr) ? arr.slice() : [];
        },
        folders: function(site) {
            var all = this._read();
            var box = all._folders;
            var arr = box && box[site];
            return Array.isArray(arr) ? arr.slice() : [];
        },
        _folderArr: function(all, site) {
            if (!all._folders || typeof all._folders !== "object") all._folders = {};
            if (!Array.isArray(all._folders[site])) all._folders[site] = [];
            return all._folders[site];
        },
        addFolder: function(site, name) {
            var n = this._cleanName(name).slice(0, 40);
            if (!n) return null;
            var all = this._read();
            var arr = this._folderArr(all, site);
            if (arr.length >= 40) return null;
            var row = { id: "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: n };
            arr.push(row);
            this._write(all);
            return row;
        },
        renameFolder: function(site, id, name) {
            var n = this._cleanName(name).slice(0, 40);
            if (!n) return;
            var all = this._read();
            var arr = this._folderArr(all, site);
            for (var i = 0; i < arr.length; i++) if (arr[i].id === id) arr[i].name = n;
            this._write(all);
        },
        removeFolder: function(site, id) {
            var all = this._read();
            var arr = this._folderArr(all, site);
            all._folders[site] = arr.filter(function(f) { return f.id !== id; });
            var items = Array.isArray(all[site]) ? all[site] : [];
            for (var i = 0; i < items.length; i++) {
                if (String(items[i].folder || "") === String(id)) items[i].folder = "";
            }
            this._write(all);
        },
        moveTo: function(site, id, folderId) {
            var all = this._read();
            var items = Array.isArray(all[site]) ? all[site] : [];
            for (var i = 0; i < items.length; i++) {
                if (items[i].id === id) items[i].folder = String(folderId || "");
            }
            this._write(all);
        },
        _find: function(site, item) {
            var tags = String((item && item.tags) || "").trim().replace(/\s+/g, " ");
            var postId = String((item && item.postId) || "");
            var rating = String((item && item.rating) || "");
            var arr = this.list(site);
            for (var i = 0; i < arr.length; i++) {
                if (String(arr[i].postId) === postId && String(arr[i].tags || "") === tags && String(arr[i].rating || "") === rating) return arr[i];
            }
            return null;
        },
        add: function(site, item) {
            var all = this._read();
            var arr = Array.isArray(all[site]) ? all[site] : [];
            var tags = String(item.tags || "").trim().replace(/\s+/g, " ");
            var postId = String(item.postId || "");
            var rating = String(item.rating || "");
            if (!postId) return null;
            var idx = -1;
            for (var i = 0; i < arr.length; i++) {
                if (String(arr[i].postId) === postId && String(arr[i].tags || "") === tags && String(arr[i].rating || "") === rating) { idx = i; break; }
            }
            var prev = idx >= 0 ? arr[idx] : null;
            var incomingName = this._cleanName(item.name);
            var row = {
                id: prev ? prev.id : (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
                postId: postId, tags: tags, rating: rating,
                name: item.nameSet ? incomingName : (incomingName || (prev ? String(prev.name || "") : "")),
                folder: item.folderSet ? String(item.folder || "") : (prev ? String(prev.folder || "") : ""),
                thumb: item.thumb || (prev ? (prev.thumb || "") : ""),
                at: Date.now()
            };
            if (idx >= 0) arr.splice(idx, 1);
            arr.unshift(row);
            if (arr.length > 200) arr.length = 200;
            all[site] = arr;
            this._write(all);
            return row;
        },
        promptAdd: function(site, item, onDone) {
            var self = this;
            var txt = this._txt.bind(this);
            var prev = this._find(site, item) || {};
            var tags = String((item && item.tags) || "").trim().replace(/\s+/g, " ");
            var old = document.getElementById("anima-bm-name");
            if (old) old.remove();
            var pop = document.createElement("div");
            pop.id = "anima-bm-name";
            var dlgW = 400;
            pop.style.cssText = "position:fixed;z-index:100080;width:" + dlgW + "px;max-width:94vw;max-height:84vh;overflow:auto;box-sizing:border-box;background:rgba(var(--anima-bg-deep-rgb),var(--anima-popup-alpha,.94));border:1px solid rgba(var(--anima-line-soft-rgb),.42);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.7);padding:12px;";
            pop.style.left = Math.max(10, Math.round((window.innerWidth - dlgW) / 2)) + "px";
            pop.style.top = Math.max(10, Math.round(window.innerHeight * 0.12)) + "px";
            function close() { if (pop.parentNode) pop.remove(); }
            var head = document.createElement("div");
            head.textContent = txt("添加书签");
            head.title = txt("拖拽移动");
            head.style.cssText = "color:var(--anima-accent-soft);font-weight:700;font-size:14px;margin:-12px -12px 8px;padding:10px 12px;user-select:none;border-bottom:1px solid rgba(var(--anima-line-soft-rgb),.42);";
            pop.appendChild(head);
            this._bindDrag(head, pop);
            var well = document.createElement("div");
            well.style.cssText = "width:140px;height:140px;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;background:rgba(var(--anima-bg-deep-rgb),.72);color:var(--anima-mute);border-radius:8px;overflow:hidden;font-size:12px;";
            var src = this._thumbSrc(site, item && item.thumb);
            if (src) {
                var img = document.createElement("img");
                img.src = src;
                img.alt = "";
                img.draggable = false;
                img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
                img.onerror = function() { if (img.parentNode) img.remove(); well.textContent = txt("无图"); };
                well.appendChild(img);
            } else {
                well.textContent = txt("无图");
            }
            pop.appendChild(well);
            var lab = document.createElement("div");
            lab.textContent = txt("搜索标签");
            lab.style.cssText = "font-size:11px;color:var(--anima-accent-soft);margin-bottom:2px;";
            pop.appendChild(lab);
            var tagLine = document.createElement("div");
            tagLine.textContent = tags || txt("（未填标签，从这张图继续）");
            tagLine.style.cssText = "font-size:12px;color:var(--anima-ink-soft);line-height:1.45;word-break:break-word;max-height:64px;overflow:auto;margin-bottom:10px;";
            pop.appendChild(tagLine);
            var nameLab = document.createElement("div");
            nameLab.textContent = txt("书签名称");
            nameLab.style.cssText = "font-size:11px;color:var(--anima-accent-soft);margin-bottom:4px;";
            pop.appendChild(nameLab);
            var input = document.createElement("input");
            input.type = "text";
            input.maxLength = 80;
            input.autocomplete = "off";
            input.placeholder = txt("给书签起个名字");
            input.value = String(prev.name || "");
            input.style.cssText = "width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:rgba(var(--anima-input-rgb),.88);color:var(--anima-ink);font-size:14px;outline:none;";
            pop.appendChild(input);
            var folderLab = document.createElement("div");
            folderLab.textContent = txt("分类");
            folderLab.style.cssText = "font-size:11px;color:var(--anima-accent-soft);margin:10px 0 4px;";
            pop.appendChild(folderLab);
            var folderSelect = document.createElement("select");
            folderSelect.style.cssText = "width:100%;box-sizing:border-box;padding:6px 8px;border-radius:6px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:rgba(var(--anima-input-rgb),.88);color:var(--anima-ink);font-size:13px;";
            function addOpt(value, label) {
                var op = document.createElement("option");
                op.value = value;
                op.textContent = label;
                folderSelect.appendChild(op);
            }
            addOpt("", txt("未分类"));
            this.folders(site).forEach(function(f) { addOpt(f.id, f.name); });
            var view = (self._viewFolder && self._viewFolder[site]) || "all";
            var preset = String(prev.folder || "");
            if (!preset && view && view !== "all") preset = String(view);
            folderSelect.value = preset;
            if (folderSelect.value !== preset) folderSelect.value = "";
            pop.appendChild(folderSelect);
            var folderNew = document.createElement("input");
            folderNew.type = "text";
            folderNew.maxLength = 40;
            folderNew.placeholder = txt("或新建分类");
            folderNew.style.cssText = "width:100%;box-sizing:border-box;margin-top:6px;padding:6px 8px;border-radius:6px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:rgba(var(--anima-input-rgb),.88);color:var(--anima-ink);font-size:13px;outline:none;";
            pop.appendChild(folderNew);
            var bar = document.createElement("div");
            bar.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:12px;";
            var cancel = document.createElement("button");
            cancel.type = "button";
            cancel.textContent = txt("取消");
            cancel.style.cssText = "padding:6px 14px;border-radius:6px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:rgba(var(--anima-input-rgb),.86);color:var(--anima-ink-strong);cursor:pointer;";
            var ok = document.createElement("button");
            ok.type = "button";
            ok.textContent = txt("保存");
            ok.style.cssText = "padding:6px 14px;border-radius:6px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi));color:var(--anima-on-accent);cursor:pointer;font-weight:700;";
            function confirm() {
                var folderId = folderSelect.value || "";
                var neu = self._cleanName(folderNew.value).slice(0, 40);
                if (neu) {
                    var created = self.addFolder(site, neu);
                    if (created) folderId = created.id;
                }
                item.name = input.value;
                item.nameSet = true;
                item.folder = folderId;
                item.folderSet = true;
                if (!self._viewFolder) self._viewFolder = {};
                if (folderId) self._viewFolder[site] = folderId;
                else if (self._viewFolder[site] && self._viewFolder[site] !== "all") self._viewFolder[site] = "";
                var row = self.add(site, item);
                close();
                if (self._openSite === site && typeof self._refresh === "function") self._refresh();
                if (typeof onDone === "function") onDone(row);
            }
            cancel.onclick = function(ev) { ev.preventDefault(); ev.stopPropagation(); close(); };
            ok.onclick = function(ev) { ev.preventDefault(); ev.stopPropagation(); confirm(); };
            input.onkeydown = function(ev) {
                ev.stopPropagation();
                if (ev.key === "Enter") { ev.preventDefault(); confirm(); }
                else if (ev.key === "Escape") { ev.preventDefault(); close(); }
            };
            folderNew.onkeydown = function(ev) {
                ev.stopPropagation();
                if (ev.key === "Enter") { ev.preventDefault(); confirm(); }
                else if (ev.key === "Escape") { ev.preventDefault(); close(); }
            };
            bar.appendChild(cancel);
            bar.appendChild(ok);
            pop.appendChild(bar);
            document.body.appendChild(pop);
            self._skin(pop);
            if (window.clampPopup) window.clampPopup(pop);
            setTimeout(function() { try { input.focus(); if (input.value) input.select(); } catch (eF) {} }, 0);
        },
        remove: function(site, id) {
            var all = this._read();
            var arr = Array.isArray(all[site]) ? all[site] : [];
            all[site] = arr.filter(function(x) { return x.id !== id; });
            this._write(all);
        },
        show: function(site, onPick) {
            var old = document.getElementById("anima-bm-pop");
            var oldMask = document.getElementById("anima-bm-mask");
            var oldHover = document.getElementById("anima-bm-hover");
            var oldMove = document.getElementById("anima-bm-move");
            if (old) old.remove();
            if (oldMask) oldMask.remove();
            if (oldHover) oldHover.remove();
            if (oldMove) oldMove.remove();
            var txt = this._txt.bind(this);
            var self = this;
            if (!self._viewFolder) self._viewFolder = {};
            var hoverTimer = 0;
            var pop = document.createElement("div");
            pop.id = "anima-bm-pop";
            var saved = this._loadWin();
            var w = saved && saved.width ? Number(saved.width) : 560;
            var h = saved && saved.height ? Number(saved.height) : 460;
            w = Math.max(340, Math.min(w, window.innerWidth - 20));
            h = Math.max(260, Math.min(h, window.innerHeight - 20));
            var left = saved && saved.left != null ? Number(saved.left) : Math.max(10, Math.round((window.innerWidth - w) / 2));
            var top = saved && saved.top != null ? Number(saved.top) : Math.max(10, Math.round((window.innerHeight - h) / 2));
            pop.style.cssText = "position:fixed;z-index:100060;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;background:rgba(var(--anima-bg-deep-rgb),var(--anima-popup-alpha,.94));border:1px solid rgba(var(--anima-line-soft-rgb),.42);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.7);padding:12px;";
            pop.style.left = left + "px";
            pop.style.top = top + "px";
            pop.style.width = w + "px";
            pop.style.height = h + "px";
            function hideHover() {
                if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = 0; }
                var el = document.getElementById("anima-bm-hover");
                if (el) el.remove();
            }
            function shut() {
                self._saveWin(pop);
                hideHover();
                var mv = document.getElementById("anima-bm-move");
                if (mv) mv.remove();
                if (pop.parentNode) pop.remove();
                if (self._openSite === site) { self._openSite = ""; self._refresh = null; }
            }
            var head = document.createElement("div");
            head.title = txt("拖拽移动");
            head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin:-12px -12px 8px;padding:8px 10px 8px 12px;flex-shrink:0;user-select:none;border-bottom:1px solid rgba(var(--anima-line-soft-rgb),.42);";
            var title = document.createElement("span");
            title.textContent = txt("书签");
            title.style.cssText = "color:var(--anima-accent-soft);font-weight:700;font-size:15px;";
            var close = document.createElement("button");
            close.type = "button";
            close.textContent = txt("关闭");
            close.style.cssText = "padding:4px 12px;border-radius:6px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:rgba(var(--anima-input-rgb),.86);color:var(--anima-ink-strong);cursor:pointer;font-size:13px;font-weight:700;";
            close.onmousedown = function(ev) { ev.stopPropagation(); };
            close.onclick = function(ev) { ev.preventDefault(); ev.stopPropagation(); shut(); };
            head.appendChild(title);
            head.appendChild(close);
            pop.appendChild(head);
            this._bindDrag(head, pop);
            var dragBind = head.onmousedown;
            head.onmousedown = function(ev) {
                hideHover();
                if (dragBind) dragBind(ev);
                document.addEventListener("mouseup", function saveOnce() {
                    document.removeEventListener("mouseup", saveOnce);
                    if (pop.isConnected) self._saveWin(pop);
                });
            };
            var bar = document.createElement("div");
            bar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px;flex-shrink:0;";
            pop.appendChild(bar);
            var scroller = document.createElement("div");
            scroller.style.cssText = "overflow:auto;flex:1;min-height:0;";
            scroller.addEventListener("scroll", hideHover);
            pop.appendChild(scroller);
            var grip = document.createElement("div");
            grip.title = txt("拖拽调整大小");
            grip.style.cssText = "position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;z-index:4;background:linear-gradient(135deg, transparent 50%, rgba(var(--anima-accent-rgb),.55) 50%);";
            grip.onmousedown = function(ev) {
                if (ev.button !== 0) return;
                ev.preventDefault();
                ev.stopPropagation();
                hideHover();
                var r = pop.getBoundingClientRect();
                var sx = ev.clientX, sy = ev.clientY, sw = r.width, sh = r.height;
                function mv(e) {
                    var nw = Math.max(340, Math.min(window.innerWidth - 20, sw + e.clientX - sx));
                    var nh = Math.max(260, Math.min(window.innerHeight - 20, sh + e.clientY - sy));
                    pop.style.width = nw + "px";
                    pop.style.height = nh + "px";
                    if (window.clampPopup) window.clampPopup(pop);
                }
                function up() {
                    document.removeEventListener("mousemove", mv);
                    document.removeEventListener("mouseup", up);
                    self._saveWin(pop);
                }
                document.addEventListener("mousemove", mv);
                document.addEventListener("mouseup", up);
            };
            pop.appendChild(grip);
            function openHover(card, item) {
                hoverTimer = 0;
                var prevH = document.getElementById("anima-bm-hover");
                if (prevH) prevH.remove();
                var tags = String(item.tags || "").trim();
                var custom = String(item.name || "").trim();
                var hover = document.createElement("div");
                hover.id = "anima-bm-hover";
                hover.style.cssText = "position:fixed;z-index:100070;pointer-events:none;padding:8px;background:rgba(var(--anima-bg-deep-rgb),var(--anima-popup-alpha,.94));border:1px solid rgba(var(--anima-line-soft-rgb),.42);border-radius:10px;box-shadow:0 16px 40px rgba(0,0,0,.75);";
                var frame = document.createElement("div");
                frame.style.cssText = "display:flex;align-items:center;justify-content:center;background:rgba(var(--anima-bg-deep-rgb),.72);color:var(--anima-mute);border-radius:6px;min-width:120px;min-height:80px;font-size:12px;";
                var src = self._thumbSrc(site, item.thumb);
                var pic = null;
                if (src) {
                    pic = document.createElement("img");
                    pic.src = src;
                    pic.alt = "";
                    pic.draggable = false;
                    pic.style.cssText = "max-width:min(420px,46vw);max-height:min(62vh,640px);width:auto;height:auto;object-fit:contain;display:block;";
                    pic.onerror = function() { if (pic.parentNode) pic.remove(); frame.textContent = txt("无图"); };
                    frame.appendChild(pic);
                } else {
                    frame.textContent = txt("无图");
                }
                hover.appendChild(frame);
                var info = document.createElement("div");
                info.style.cssText = "margin-top:8px;max-width:min(420px,46vw);";
                if (custom) {
                    var nm = document.createElement("div");
                    nm.textContent = custom;
                    nm.style.cssText = "font-size:13px;font-weight:700;color:var(--anima-ink);margin-bottom:4px;word-break:break-word;";
                    info.appendChild(nm);
                }
                var folders = self.folders(site);
                var fname = "";
                for (var fi = 0; fi < folders.length; fi++) if (folders[fi].id === item.folder) fname = folders[fi].name;
                if (fname) {
                    var fl = document.createElement("div");
                    fl.textContent = txt("分类") + "  " + fname;
                    fl.style.cssText = "font-size:11px;color:var(--anima-mute);margin-bottom:4px;word-break:break-word;";
                    info.appendChild(fl);
                }
                var tagLab = document.createElement("div");
                tagLab.textContent = txt("搜索标签");
                tagLab.style.cssText = "font-size:11px;color:var(--anima-accent-soft);margin-bottom:2px;";
                var tagBody = document.createElement("div");
                tagBody.textContent = tags || txt("（未填标签，从这张图继续）");
                tagBody.style.cssText = "font-size:12px;color:var(--anima-ink-soft);line-height:1.45;word-break:break-word;";
                info.appendChild(tagLab);
                info.appendChild(tagBody);
                hover.appendChild(info);
                document.body.appendChild(hover);
                self._skin(hover);
                function place() {
                    if (!hover.parentNode || !card.isConnected) return;
                    var r = card.getBoundingClientRect();
                    var hw = hover.offsetWidth || 240;
                    var hh = hover.offsetHeight || 180;
                    var gap = 10;
                    var hx = r.right + gap;
                    if (hx + hw > window.innerWidth - 8) hx = r.left - gap - hw;
                    if (hx < 8) hx = Math.max(8, window.innerWidth - hw - 8);
                    var hy = r.top;
                    if (hy + hh > window.innerHeight - 8) hy = Math.max(8, window.innerHeight - hh - 8);
                    hover.style.left = hx + "px";
                    hover.style.top = hy + "px";
                }
                place();
                if (pic) pic.onload = place;
            }
            function openMove(anchor, item) {
                hideHover();
                var prevM = document.getElementById("anima-bm-move");
                if (prevM) prevM.remove();
                var menu = document.createElement("div");
                menu.id = "anima-bm-move";
                menu.style.cssText = "position:fixed;z-index:100075;min-width:148px;max-width:220px;max-height:240px;overflow:auto;padding:6px;background:rgba(var(--anima-bg-deep-rgb),var(--anima-popup-alpha,.94));border:1px solid rgba(var(--anima-line-soft-rgb),.42);border-radius:8px;box-shadow:0 12px 32px rgba(0,0,0,.65);";
                function addChoice(label, folderId, on) {
                    var row = document.createElement("div");
                    row.textContent = (on ? "✓ " : "") + label;
                    row.style.cssText = "padding:5px 8px;cursor:pointer;font-size:12px;color:var(--anima-ink);border-radius:4px;" + (on ? "background:rgba(var(--anima-accent-rgb),0.25);" : "");
                    row.onmouseenter = function() { row.style.background = "rgba(var(--anima-accent-rgb),0.25)"; };
                    row.onmouseleave = function() { if (!on) row.style.background = "transparent"; };
                    row.onclick = function(ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        self.moveTo(site, item.id, folderId);
                        if (menu.parentNode) menu.remove();
                        paint();
                    };
                    menu.appendChild(row);
                }
                addChoice(txt("未分类"), "", !item.folder);
                self.folders(site).forEach(function(f) {
                    addChoice(f.name, f.id, String(item.folder || "") === f.id);
                });
                document.body.appendChild(menu);
                self._skin(menu);
                var ar = anchor.getBoundingClientRect();
                var mx = ar.left;
                var my = ar.bottom + 4;
                if (my + 180 > window.innerHeight) my = Math.max(8, ar.top - 8 - Math.min(180, menu.offsetHeight || 160));
                if (mx + 200 > window.innerWidth) mx = Math.max(8, window.innerWidth - 210);
                menu.style.left = mx + "px";
                menu.style.top = my + "px";
                setTimeout(function() {
                    function away(ev) {
                        if (menu.contains && menu.contains(ev.target)) return;
                        if (menu.parentNode) menu.remove();
                        document.removeEventListener("pointerdown", away, true);
                    }
                    document.addEventListener("pointerdown", away, true);
                }, 0);
            }
            function chipBtn(label, on) {
                var b = document.createElement("button");
                b.type = "button";
                b.textContent = label;
                b.style.cssText = "max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 8px;border-radius:999px;cursor:pointer;font-size:12px;border:1px solid " + (on ? "rgba(var(--anima-accent-rgb),.8)" : "rgba(var(--anima-line-soft-rgb),.42)") + ";background:" + (on ? "rgba(var(--anima-accent-rgb),.22)" : "rgba(var(--anima-input-rgb),.35)") + ";color:" + (on ? "var(--anima-accent-soft)" : "var(--anima-ink-soft)") + ";";
                return b;
            }
            function paint() {
                hideHover();
                var oldMenu = document.getElementById("anima-bm-move");
                if (oldMenu) oldMenu.remove();
                while (bar.firstChild) bar.removeChild(bar.firstChild);
                while (scroller.firstChild) scroller.removeChild(scroller.firstChild);
                var allItems = self.list(site);
                var folders = self.folders(site);
                var view = self._viewFolder[site];
                if (view == null) view = "all";
                if (view !== "all" && view !== "" && !folders.some(function(f) { return f.id === view; })) {
                    view = "all";
                    self._viewFolder[site] = "all";
                }
                function countOf(fid) {
                    var n = 0;
                    for (var i = 0; i < allItems.length; i++) {
                        var f = String(allItems[i].folder || "");
                        if (fid === "all" || (fid === "" && !f) || f === fid) n++;
                    }
                    return n;
                }
                function selectView(next) {
                    self._viewFolder[site] = next;
                    paint();
                }
                var allChip = chipBtn(txt("全部") + " " + countOf("all"), view === "all");
                allChip.onclick = function(ev) { ev.preventDefault(); ev.stopPropagation(); selectView("all"); };
                bar.appendChild(allChip);
                var noneChip = chipBtn(txt("未分类") + " " + countOf(""), view === "");
                noneChip.onclick = function(ev) { ev.preventDefault(); ev.stopPropagation(); selectView(""); };
                bar.appendChild(noneChip);
                folders.forEach(function(f) {
                    var c = chipBtn(f.name + " " + countOf(f.id), view === f.id);
                    c.title = f.name;
                    c.onclick = function(ev) { ev.preventDefault(); ev.stopPropagation(); selectView(f.id); };
                    bar.appendChild(c);
                });
                var addF = chipBtn("+ " + txt("新建分类"), false);
                addF.onclick = function(ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    var inp = document.createElement("input");
                    inp.type = "text";
                    inp.maxLength = 40;
                    inp.placeholder = txt("分类名称");
                    inp.style.cssText = "width:120px;padding:3px 8px;border-radius:999px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:rgba(var(--anima-input-rgb),.88);color:var(--anima-ink);font-size:12px;outline:none;";
                    inp.onmousedown = function(e2) { e2.stopPropagation(); };
                    inp.onkeydown = function(e2) {
                        e2.stopPropagation();
                        if (e2.key === "Enter") {
                            e2.preventDefault();
                            var created = self.addFolder(site, inp.value);
                            if (created) self._viewFolder[site] = created.id;
                            paint();
                        } else if (e2.key === "Escape") { e2.preventDefault(); paint(); }
                    };
                    bar.replaceChild(inp, addF);
                    try { inp.focus(); } catch (eF) {}
                };
                bar.appendChild(addF);
                var current = null;
                for (var ci = 0; ci < folders.length; ci++) if (folders[ci].id === view) current = folders[ci];
                if (current) {
                    var ren = chipBtn(txt("改名"), false);
                    ren.onclick = function(ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        var inp = document.createElement("input");
                        inp.type = "text";
                        inp.maxLength = 40;
                        inp.value = current.name;
                        inp.style.cssText = "width:120px;padding:3px 8px;border-radius:999px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:rgba(var(--anima-input-rgb),.88);color:var(--anima-ink);font-size:12px;outline:none;";
                        inp.onmousedown = function(e2) { e2.stopPropagation(); };
                        inp.onkeydown = function(e2) {
                            e2.stopPropagation();
                            if (e2.key === "Enter") { e2.preventDefault(); self.renameFolder(site, current.id, inp.value); paint(); }
                            else if (e2.key === "Escape") { e2.preventDefault(); paint(); }
                        };
                        bar.insertBefore(inp, ren);
                        ren.style.display = "none";
                        try { inp.focus(); inp.select(); } catch (eF) {}
                    };
                    bar.appendChild(ren);
                    var delF = chipBtn(txt("删除分类"), false);
                    delF.style.color = "#f87171";
                    delF.onclick = function(ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        if (!delF._armed) { delF._armed = true; delF.textContent = txt("确认删除分类"); return; }
                        self.removeFolder(site, current.id);
                        self._viewFolder[site] = "";
                        paint();
                    };
                    bar.appendChild(delF);
                }
                var shown = allItems.filter(function(it) {
                    var f = String(it.folder || "");
                    if (view === "all") return true;
                    if (view === "") return !f;
                    return f === view;
                });
                if (!shown.length) {
                    var tip = document.createElement("div");
                    tip.textContent = allItems.length ? txt("这个分类里还没有书签") : txt("还没有书签。在图片上右键，选「添加书签」。");
                    tip.style.cssText = "color:var(--anima-mute);font-size:13px;padding:16px 4px;";
                    scroller.appendChild(tip);
                    return;
                }
                var grid = document.createElement("div");
                grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:8px;";
                shown.forEach(function(item) {
                    var tags = String(item.tags || "").trim();
                    var custom = String(item.name || "").trim();
                    var card = document.createElement("div");
                    card.style.cssText = "position:relative;border-radius:8px;overflow:hidden;cursor:pointer;background:rgba(var(--anima-well-rgb),.22);border:1px solid rgba(var(--anima-line-soft-rgb),.42);display:flex;flex-direction:column;min-width:0;";
                    var well = document.createElement("div");
                    well.style.cssText = "position:relative;width:100%;aspect-ratio:1;overflow:hidden;background:rgba(var(--anima-bg-deep-rgb),.72);color:var(--anima-mute);display:flex;align-items:center;justify-content:center;font-size:12px;";
                    var src = self._thumbSrc(site, item.thumb);
                    if (src) {
                        var img = document.createElement("img");
                        img.src = src;
                        img.alt = "";
                        img.draggable = false;
                        img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
                        img.onerror = function() { if (img.parentNode) img.remove(); well.textContent = txt("无图"); };
                        well.appendChild(img);
                    } else {
                        well.textContent = txt("无图");
                    }
                    card.appendChild(well);
                    var cap = document.createElement("div");
                    cap.textContent = custom || tags || txt("（未填标签，从这张图继续）");
                    cap.style.cssText = "padding:4px 4px 6px;font-size:11px;font-weight:700;line-height:1.3;color:var(--anima-ink);text-align:center;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;min-height:2.6em;";
                    card.appendChild(cap);
                    var mover = document.createElement("span");
                    mover.textContent = "📁";
                    mover.title = txt("移到分类");
                    mover.style.cssText = "position:absolute;top:3px;left:3px;z-index:2;width:18px;height:18px;line-height:18px;text-align:center;border-radius:4px;background:rgba(var(--anima-bg-deep-rgb),.72);color:var(--anima-ink);font-size:11px;cursor:pointer;";
                    mover.onclick = function(ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        openMove(mover, item);
                    };
                    mover.onmousedown = function(ev) { ev.stopPropagation(); };
                    card.appendChild(mover);
                    var del = document.createElement("span");
                    del.textContent = "✕";
                    del.title = txt("删除");
                    del.style.cssText = "position:absolute;top:3px;right:3px;z-index:2;padding:0 5px;border-radius:4px;background:rgba(var(--anima-bg-deep-rgb),.72);color:#f87171;font-size:12px;line-height:18px;opacity:0;cursor:pointer;";
                    del.onclick = function(ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        hideHover();
                        self.remove(site, item.id);
                        paint();
                    };
                    del.onmousedown = function(ev) { ev.stopPropagation(); };
                    card.appendChild(del);
                    card.onmouseenter = function() {
                        del.style.opacity = "1";
                        if (hoverTimer) clearTimeout(hoverTimer);
                        hoverTimer = setTimeout(function() { openHover(card, item); }, 350);
                    };
                    card.onmouseleave = function() {
                        del.style.opacity = "0";
                        hideHover();
                    };
                    card.onclick = function() {
                        if (typeof onPick === "function") onPick(item);
                    };
                    grid.appendChild(card);
                });
                scroller.appendChild(grid);
            }
            self._openSite = site;
            self._refresh = function() { if (pop.isConnected) paint(); };
            paint();
            document.body.appendChild(pop);
            self._skin(pop);
            if (window.clampPopup) window.clampPopup(pop);
            self._saveWin(pop);
        }
    };
}
if (!window.animaSiteJumpMenu) {
    window.animaSiteJumpMenu = function(opts) {
        opts = opts || {};
        if (typeof window._animaSiteJumpClose === "function") {
            var prevClose = window._animaSiteJumpClose;
            window._animaSiteJumpClose = null;
            try { prevClose(true); } catch (eClose) {}
        }
        var txt = function(s) { return (typeof window.animaTxt === "function") ? window.animaTxt(s) : s; };
        var menu = document.createElement("div");
        menu.id = "anima-site-jump-menu";
        menu.style.cssText = "position:fixed;z-index:100050;min-width:220px;max-width:340px;max-height:70vh;overflow:auto;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid rgba(var(--anima-line-soft-rgb),.5);border-radius:8px;padding:6px;box-shadow:0 8px 28px rgba(0,0,0,.65);";
        var head = document.createElement("div");
        head.textContent = txt(opts.site === "gelbooru" ? "在G站搜索" : "在D站搜索");
        head.style.cssText = "padding:6px 10px 8px;font-size:12px;font-weight:700;color:var(--anima-ink-soft);";
        menu.appendChild(head);
        if (typeof opts.onBookmark === "function") {
            var bmRow = document.createElement("div");
            bmRow.textContent = "🔖 " + txt("添加书签");
            bmRow.style.cssText = "padding:7px 10px;margin-bottom:4px;cursor:pointer;font-size:13px;color:var(--anima-ink);border-radius:4px;font-weight:700;";
            bmRow.onmouseenter = function() { bmRow.style.background = "rgba(var(--anima-accent-rgb),0.22)"; };
            bmRow.onmouseleave = function() { bmRow.style.background = "transparent"; };
            bmRow.onclick = function(ev) {
                ev.preventDefault();
                ev.stopPropagation();
                try { opts.onBookmark(); } catch (eBm) {}
                cleanup();
            };
            menu.appendChild(bmRow);
        }
        if (opts.loading) {
            var wait = document.createElement("div");
            wait.textContent = txt("正在读取这张图的标签…");
            wait.style.cssText = "padding:6px 10px 10px;font-size:12px;color:var(--anima-mute);";
            menu.appendChild(wait);
        } else {
            var groups = opts.groups || {};
            var trans = opts.translations || {};
            var cats = [
                { key: "artist", label: "画师", icon: "🎨", empty: "这张图没有画师" },
                { key: "character", label: "角色", icon: "👤", empty: "这张图没有角色" },
                { key: "series", label: "系列", icon: "📺", empty: "这张图没有系列" }
            ];
            cats.forEach(function(cat) {
                var title = document.createElement("div");
                title.textContent = cat.icon + " " + txt(cat.label);
                title.style.cssText = "padding:4px 10px;font-size:11px;font-weight:700;color:var(--anima-accent-soft);";
                menu.appendChild(title);
                var tags = Array.isArray(groups[cat.key]) ? groups[cat.key] : [];
                if (!tags.length) {
                    var empty = document.createElement("div");
                    empty.textContent = txt(cat.empty);
                    empty.style.cssText = "padding:2px 10px 8px 22px;font-size:12px;color:var(--anima-mute);";
                    menu.appendChild(empty);
                    return;
                }
                tags.slice(0, 24).forEach(function(tag) {
                    var raw = String(tag || "");
                    var cn = trans[raw] || trans[raw.replace(/_/g, " ")] || trans[raw.replace(/ /g, "_")] || "";
                    var row = document.createElement("div");
                    row.textContent = cn ? (cn + " · " + raw) : raw;
                    row.style.cssText = "padding:6px 10px 6px 22px;cursor:pointer;font-size:12px;color:var(--anima-ink);border-radius:4px;";
                    row.onmouseenter = function() { row.style.background = "rgba(var(--anima-accent-rgb),0.22)"; };
                    row.onmouseleave = function() { row.style.background = "transparent"; };
                    row.onclick = function(ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        var url = _animaSiteJumpUrl(opts.site, raw);
                        if (url) window.open(url, "_blank", "noopener");
                        cleanup();
                    };
                    menu.appendChild(row);
                });
                if (tags.length > 24) {
                    var more = document.createElement("div");
                    more.textContent = "+" + (tags.length - 24);
                    more.style.cssText = "padding:2px 10px 8px 22px;font-size:11px;color:var(--anima-mute);";
                    menu.appendChild(more);
                }
            });
        }
        var token = opts.token;
        var mask = document.createElement("div");
        mask.setAttribute("data-anima-site-jump-mask", "1");
        mask.style.cssText = "position:fixed;inset:0;z-index:100049;background:transparent;";
        function cleanup(replacing) {
            if (!replacing && window._animaSiteJumpToken === token) window._animaSiteJumpToken = 0;
            if (menu.parentNode) menu.remove();
            if (mask.parentNode) mask.remove();
            window.removeEventListener("pointerdown", onAway, true);
            window.removeEventListener("mousedown", onAway, true);
            window.removeEventListener("keydown", onKey, true);
            window.removeEventListener("contextmenu", onAwayMenu, true);
            if (window._animaSiteJumpClose === cleanup) window._animaSiteJumpClose = null;
        }
        window._animaSiteJumpClose = cleanup;
        function onAway(ev) {
            if (menu.contains(ev.target)) return;
            ev.preventDefault();
            ev.stopPropagation();
            cleanup();
        }
        function onAwayMenu(ev) {
            if (menu.contains(ev.target)) {
                ev.preventDefault();
                return;
            }
            ev.preventDefault();
            ev.stopPropagation();
            cleanup();
        }
        function onKey(ev) {
            if (ev.key === "Escape" || ev.key === "Esc") {
                ev.preventDefault();
                ev.stopPropagation();
                cleanup();
            }
        }
        mask.addEventListener("pointerdown", onAway, true);
        mask.addEventListener("mousedown", onAway, true);
        mask.addEventListener("contextmenu", onAwayMenu, true);
        document.body.appendChild(mask);
        document.body.appendChild(menu);
        var rect = menu.getBoundingClientRect();
        var left = opts.x || 0;
        var top = opts.y || 0;
        if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
        if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8;
        menu.style.left = Math.max(8, left) + "px";
        menu.style.top = Math.max(8, top) + "px";
        window.addEventListener("pointerdown", onAway, true);
        window.addEventListener("mousedown", onAway, true);
        window.addEventListener("keydown", onKey, true);
        window.addEventListener("contextmenu", onAwayMenu, true);
    };
}
function _animaOpenSiteJump(x, y, site, groups, translations, onBookmark) {
    var token = Date.now() + Math.random();
    window._animaSiteJumpToken = token;
    window.animaSiteJumpMenu({ x: x, y: y, site: site, groups: groups, translations: translations || {}, loading: !groups, token: token, onBookmark: onBookmark });
    return token;
}


// ── 关闭页面时主动释放大引用，加快卸载（防关闭卡死） ──
window.addEventListener("pagehide", () => {
    try {
        // 清空各浏览器节点的全局注册表，避免卸载时逐项释放
        window._dbVisPollers = [];
        window._dbAcCloseFns = [];
        // 清空模块级大缓存
        for (const _k in _globalTagTranslations) delete _globalTagTranslations[_k];
        for (const _k in _globalTagCache) delete _globalTagCache[_k];
        for (const _k in _globalTranslationCache) delete _globalTranslationCache[_k];
        _favCache = null;
    } catch(e) {}
});

if (typeof window.animaSyncUiLang === "function") window.animaSyncUiLang();

app.registerExtension({
    name: "Comfy.DanbooruAnimaBrowser",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "DanbooruBrowser") return;
        window.hookAnimaNodeChrome(nodeType);

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            this.setSize([800, 1150]);
            window.applyAnimaNodeChrome(this);
            this.isChanged = true;

            const node = this;
            try {
                this.title = (typeof animaTxt === "function") ? animaTxt("D站浏览器 (Danbooru Browser)") : "D站浏览器 (Danbooru Browser)";
            } catch {}
            let currentPage = 1;
            let _totalPages = 0;
            let _onTail = false;
            let _lastBeforeId = null;   // 时间排序：Danbooru 游标 page=b<id>
            let _lastBeforeScore = null; // 评分排序：下一页 score:<=N（不能用 id 游标）
            let _seenIds = new Set();
            let _searchGen = 0;
            let currentPosts = [];
            const postById = (id) => {
                const n = Number(id);
                return currentPosts.find(p => Number(p.id) === n) || null;
            };
            const postSnap = (post) => {
                if (!post) return { post_id: null };
                const tags = post.tags || post.tag_string || "";
                return {
                    post_id: post.id,
                    tags: Array.isArray(tags) ? tags.join(" ") : tags,
                    file_url: post.file_url || "",
                    large_url: post.large_url || post.large_file_url || "",
                    preview_url: post.preview_url || post.preview_file_url || "",
                    sample_url: post.sample_url || "",
                    is_video: !!post.is_video,
                };
            };
            let selectedPostId = null;
            let isLoading = false;
            let _preloadQueue = null;
            let acCache = {};       // 前端缓存 query → tags[]
            let tagCache = {};      // 预加载的标签 {post_id: classified}
            let _multiEnabled = false;
            let _multiSelections = new Set();
            let _multiMerge = { all: true, quality_meta: true, count: true, character: true, series: true, artist: true, general: true };
            let _tagFusionEnabled = false;
            let _fusionActiveSlot = 1;
            let _fusionSlots = { 1: new Set(), 2: new Set(), 3: new Set() };
            let _sync12 = false;

            // ── 隐藏内部 widget（端口也隐藏） ──
            const selWidget = node.widgets?.find(w => w.name === "selection_data");
            if (selWidget) { selWidget.computeSize = () => [0, 0]; selWidget.serialize = true; try { selWidget.hidden = true; } catch(e){} }
            const ratingWidget = node.widgets?.find(w => w.name === "rating_filter");
            if (ratingWidget) { ratingWidget.computeSize = () => [0, 0]; ratingWidget.serialize = true; try { ratingWidget.hidden = true; } catch(e){} }
            const nodeSettingsWidget = node.widgets?.find(w => w.name === "node_settings");
            if (nodeSettingsWidget) { nodeSettingsWidget.computeSize = () => [0, 0]; nodeSettingsWidget.serialize = true; try { nodeSettingsWidget.hidden = true; } catch(e){} }
            // _tag_fusion widget（隐藏，分序号数据）
            const fusionWidget = node.widgets?.find(w => w.name === "_tag_fusion");
            if (fusionWidget) { fusionWidget.computeSize = () => [0, 0]; fusionWidget.serialize = true; try { fusionWidget.hidden = true; } catch(e){} }

            // ── 初始自动搜索（重启后页面不空白；延迟等 widget 恢复 + DOM 就绪） ──
            setTimeout(() => {
                try { if (typeof doSearch === "function" && searchInput && !searchInput.value) doSearch(1); } catch(e) {}
            }, 500);

            // ── 远程搜索通道（AnimaDex 一键发送，全局变量队列，不依赖端口） ──
            node._dbAdexTimer = setInterval(() => {
                try {
                    let q = (window._adexDbSearch || "").trim();
                    if (q && searchInput) {
                        window._adexDbSearch = "";
                        searchInput.value = q;
                        if (typeof doSearch === "function") doSearch(1, q);
                        return;
                    }
                    const raw = localStorage.getItem("anima_opv_site_search");
                    if (!raw || !searchInput) return;
                    const msg = JSON.parse(raw);
                    if (!msg || msg.site !== "danbooru" || !msg.q || !msg.t || node._opvSearchT === msg.t) return;
                    if (Date.now() - Number(msg.t) > 12000) return;
                    node._opvSearchT = msg.t;
                    searchInput.value = msg.q;
                    if (typeof doSearch === "function") doSearch(1, msg.q);
                } catch(e) {}
            }, 400);

            // ── 评级过滤持久化 ──
            const saveRatingState = () => {
                if (!ratingWidget) return;
                const state = JSON.stringify({ all: _ratAll.checked, ratings: [..._activeRatings] });
                ratingWidget.value = state;
                node.isChanged = true;
            };
            const loadRatingState = () => {
                if (!ratingWidget) return;
                try {
                    const state = JSON.parse(ratingWidget.value || "{}");
                    if (state.all !== undefined) _ratAll.checked = state.all;
                    allCb.checked = _ratAll.checked;
                    if (state.ratings) {
                        _activeRatings.clear();
                        for (const val of state.ratings) _activeRatings.add(val);
                        for (const cb of ratingCbs) cb.checked = false;
                        for (const val of state.ratings) {
                            const idx = ["general", "sensitive", "questionable", "explicit"].indexOf(val);
                            if (idx >= 0) ratingCbs[idx].checked = true;
                        }
                    }
                } catch {}
            };

            // ── 节点独立设置持久化（多选、原图输出等） ──
            const saveNodeSettings = () => {
                try {
                    if (!node.properties) node.properties = {};
                    node.properties.anima_ports_collapsed = !!node._animaPortsCollapsed;
                } catch (e) {}
                if (!nodeSettingsWidget) { node.isChanged = true; return; }
                const state = {
                    multi_select_enabled: _multiEnabled,
                    multi_merge_all: _multiMerge.all,
                    multi_merge_quality_meta: _multiMerge.quality_meta,
                    multi_merge_count: _multiMerge.count,
                    multi_merge_character: _multiMerge.character,
                    multi_merge_series: _multiMerge.series,
                    multi_merge_artist: _multiMerge.artist,
                    multi_merge_general: _multiMerge.general,
                    original_resolution: _origResCheck ? _origResCheck.checked : false,
                    tag_fusion_enabled: _tagFusionEnabled || false,
                    ports_collapsed: !!node._animaPortsCollapsed,
                };
                nodeSettingsWidget.value = JSON.stringify(state);
                node.isChanged = true;
            };
            const loadNodeSettings = () => {
                let storedPorts;
                if (nodeSettingsWidget) {
                    try {
                        const s = JSON.parse(nodeSettingsWidget.value || "{}");
                        if (s.multi_select_enabled !== undefined) {
                            _multiEnabled = s.multi_select_enabled;
                            toggleMultiCbs(_multiEnabled);
                        }
                        _tagFusionEnabled = s.tag_fusion_enabled ?? false;
                        for (const k of Object.keys(_multiMerge)) {
                            const key = "multi_merge_" + k;
                            if (s[key] !== undefined) _multiMerge[k] = s[key];
                        }
                        if (s.original_resolution !== undefined && _origResCheck) {
                            _origResCheck.checked = s.original_resolution;
                        }
                        if (s.ports_collapsed !== undefined) storedPorts = !!s.ports_collapsed;
                    } catch {}
                }
                if (storedPorts === undefined) {
                    try {
                        if (node.properties && node.properties.anima_ports_collapsed !== undefined) {
                            storedPorts = !!node.properties.anima_ports_collapsed;
                        }
                    } catch (e) {}
                }
                if (storedPorts !== undefined && typeof node._animaSetPortsCollapsed === "function") {
                    node._animaSetPortsCollapsed(storedPorts, { adjustHeight: false, silent: true });
                }
                try { if (typeof node._animaSyncPortsChrome === "function") node._animaSyncPortsChrome(); } catch (e) {}
            };
            if (typeof window.hookAnimaCollapseOutputs === "function") {
                window.hookAnimaCollapseOutputs(node, {
                    onChange: function (c) {
                        saveNodeSettings();
                    },
                    readStored: function () {
                        try {
                            if (nodeSettingsWidget && nodeSettingsWidget.value) {
                                var s = JSON.parse(nodeSettingsWidget.value || "{}");
                                if (s.ports_collapsed !== undefined) return !!s.ports_collapsed;
                            }
                        } catch (e) {}
                        try { return !!(node.properties && node.properties.anima_ports_collapsed); } catch (e2) { return false; }
                    }
                });
            }

            // ── DOM Widget 容器 ──
            // hover 反馈：按钮/卡片统一亮起（非选中态）
            (function(){
                var _st = document.createElement("style");
                _st.textContent = ".danbooru-anima-browser button{transition:filter .15s ease,transform .15s ease,box-shadow .15s ease;}"
                    + ".danbooru-anima-browser button:hover{filter:brightness(1.25);transform:translateY(-1px);}"
                    + ".danbooru-anima-browser .db-img-card{transition:filter .18s ease,transform .18s ease,box-shadow .18s ease;user-select:none;-webkit-user-drag:none;}"
                    + ".danbooru-anima-browser .db-img-card:hover{filter:brightness(1.15);transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,0.35);}"
                    + ".danbooru-anima-browser .db-img-card:active{transform:none!important;}"
                    + ".db-fav-overlay button{transition:filter .15s ease,transform .15s ease,box-shadow .15s ease;}"
                    + ".db-fav-overlay button:hover{filter:brightness(1.25);transform:translateY(-1px);}"
                    + ".db-fav-overlay .db-fav-img,.db-fav-overlay .db-fav-card{transition:filter .18s ease,transform .18s ease,box-shadow .18s ease;}"
                    + ".db-fav-overlay .db-fav-img:hover,.db-fav-overlay .db-fav-card:hover{filter:brightness(1.12);transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,0.35);}"
                    + ".db-fav-overlay .db-fav-img .db-fav-hover-actions{position:absolute;bottom:0;left:0;right:0;display:flex;gap:4px;padding:6px 6px 8px;background:linear-gradient(transparent,rgba(0,0,0,0.88));opacity:0;pointer-events:none;transition:opacity .15s ease;z-index:6;}"
                    + ".db-fav-overlay .db-fav-img:hover .db-fav-hover-actions{opacity:1;pointer-events:auto;}"
                    + ".db-fav-overlay .db-fav-hover-actions .db-img-cls,.db-fav-overlay .db-fav-hover-actions .db-img-large,.db-fav-overlay .db-fav-hover-actions .db-img-del{flex:1;text-align:center;padding:5px 4px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;background:rgba(0,0,0,0.55);backdrop-filter:blur(2px);border:1px solid rgba(255,255,255,.18);color:var(--anima-ink-strong);}"
                    + ".db-fav-overlay .db-fav-hover-actions .db-img-large{color:#4caf50;}"
                    + ".db-fav-overlay .db-fav-hover-actions .db-img-del{color:#f87171;background:rgba(42,22,22,0.72);}"
                    + ".danbooru-anima-browser .db-act-row{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:space-evenly;padding:16px 2px 7px;z-index:5;opacity:0;pointer-events:none;transition:opacity .15s ease;background:linear-gradient(transparent,rgba(0,0,0,0.55));}"
                    + ".danbooru-anima-browser .db-img-card:hover .db-act-row{opacity:1;pointer-events:auto;}"
                    + ".danbooru-anima-browser .db-act{flex:1;text-align:center;cursor:pointer;font-size:20px;line-height:1;user-select:none;filter:drop-shadow(0 0 3px rgba(0,0,0,.8));}"
                    + ".danbooru-anima-browser .db-act:hover{transform:translateY(-1px);filter:drop-shadow(0 0 4px rgba(0,0,0,.95)) brightness(1.3);}"
                    + ".danbooru-anima-browser .db-hover-badge{opacity:0;transition:opacity .15s ease;}"
                    + ".danbooru-anima-browser .db-img-card:hover .db-hover-badge{opacity:1;}"
                    + ".danbooru-anima-browser .db-sortbar > span,.danbooru-anima-browser .db-sortbar > button,.danbooru-anima-browser .db-fusionbar > span,.danbooru-anima-browser .db-fusionbar > button{transition:filter .15s ease,transform .15s ease,box-shadow .15s ease;}"
                    + ".danbooru-anima-browser .db-sortbar > span:hover,.danbooru-anima-browser .db-sortbar > button:hover,.danbooru-anima-browser .db-fusionbar > span:hover,.danbooru-anima-browser .db-fusionbar > button:hover{filter:brightness(1.35);transform:translateY(-1px);}";
;
                document.head.appendChild(_st);
            })();
            const container = $el("div.danbooru-anima-browser", {
                style: {
                    width: "100%", height: "100%", overflow: "hidden",
                    position: "relative",
                    display: "flex", flexDirection: "column", flex: "1 1 auto",
                    background: "linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)", borderRadius: "4px",
                    fontSize: "13px",
                }
            });
            if (typeof window.animaShieldDomWidget === "function") window.animaShieldDomWidget(container);
            if (typeof window.applyAnimaPanelGlow === "function") window.applyAnimaPanelGlow(container);
            if (typeof window.animaMakePortsChromeToggle === "function") container.appendChild(window.animaMakePortsChromeToggle(node));

            // ═══════════ 搜索栏 ═══════════
            const searchBar = $el("div", {
                style: { position: "relative", display: "flex", padding: "6px", gap: "4px", background: "linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)", borderBottom: "1px solid var(--anima-line)", flexWrap: "wrap" }
            });
            const searchInput = $el("input", {
                type: "text", placeholder: animaTxt("输入文字后按回车键即可模糊搜索"),
                style: { flex: "1 1 160px", padding: "12px 16px", borderRadius: "6px", border: "1px solid var(--anima-line)", background: "linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)", color: "#e0e0e0", fontSize: "20px", outline: "none", minWidth: "100px" }
            });
            const searchBtn = $el("button", {
                textContent: "🔍", title: animaTxt("搜索"),
                style: { padding: "10px 20px", borderRadius: "10px", border: "none", background: "linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi))", color: "#ffffff", cursor: "pointer", fontSize: "20px" }
            });
            let _hotActive = false;
            const _HOT_STYLE = { border: "2px solid #fbbf24", boxShadow: "0 0 12px #fbbf2466" };
            const _DEF_STYLE = { border: "none", boxShadow: "none" };
            const hotBtn = $el("button", {
                textContent: "🔥", title: animaTxt("热门"),
                style: { padding: "10px 18px", borderRadius: "6px", border: "none", background: "transparent", color: "#fbbf24", cursor: "pointer", fontSize: "20px" }
            });
            hotBtn.onclick = () => {
                _hotActive = !_hotActive;
                Object.assign(hotBtn.style, _hotActive ? _HOT_STYLE : _DEF_STYLE);
                searchInput.value = "";
                // 热门模式强制重置排序为时间
                if (_hotActive) { _sortOrder = ""; _updateSort(); }
                doSearch(1, _hotActive ? "order:rank" : "");
            };

            // ── 🧠 语义搜索切换 ──
            let _semanticActive = false;
            const _SEM_STYLE = { border: "2px solid var(--anima-accent-soft)", boxShadow: "0 0 12px color-mix(in srgb, var(--anima-accent-soft) 40%, transparent)" };
            const _SEM_DEF_STYLE = { border: "none", boxShadow: "none" };
            const semBtn = $el("button", {
                textContent: "🧠", title: animaTxt("语义搜索（E5-Small）"),
                style: { padding: "10px 18px", borderRadius: "6px", border: "none", background: "transparent", color: "var(--anima-accent-soft)", cursor: "pointer", fontSize: "20px" }
            });
            let _vecReady = false;
            let _vecInitPromise = null;
            const _ensureVecReady = async () => {
                if (_vecReady) return true;
                const stR = await fetch("/danbooru_anima/vec_status");
                const stD = await stR.json();
                if (stD.ready) { _vecReady = true; return true; }
                if (stD.error) return false;
                // 依赖检测：缺 sentence-transformers 时先提醒安装
                if (stD.deps_ok === false) {
                    const depsTxt = (stD.deps_required || ["sentence-transformers", "torch"]).join(" ");
                    const ok2 = await _showInitDialog(
                        "⚠️ 语义搜索缺少依赖\n\n检测到未安装: " + depsTxt + "\n\n" +
                        "请先在 ComfyUI 的 python 环境中安装：\n" +
                        "pip install sentence-transformers torch\n\n" +
                        "安装完成后重启 ComfyUI，再点 🧠 使用语义搜索。"
                    );
                    return false; // 缺依赖不自动初始化，等用户装好再试
                }
                // 模型+缓存已存在 → 直接自动加载，不弹下载提示
                if (stD.files_ok === true) {
                    await fetch("/danbooru_anima/vec_init", {method:"POST"});
                    _vecInitPromise = new Promise(resolve => {
                        const poll = setInterval(async () => {
                            const pR = await fetch("/danbooru_anima/vec_status");
                            const pD = await pR.json();
                            if (pD.ready) { clearInterval(poll); _vecReady = true; resolve(true); }
                            if (pD.error) { clearInterval(poll); resolve(false); }
                        }, 800);
                    });
                    return await _vecInitPromise;
                }
                const ok = await _showInitDialog("语义搜索需要 E5-Small 模型\n首次初始化约需 30 秒-1 分钟，是否开始？\n\n模型下载：\n🤗 HuggingFace: https://huggingface.co/intfloat/multilingual-e5-small\n🇨🇳 国内: https://pan.quark.cn/s/e501b783f10f\n\n缓存下载也是同一网盘地址");
                if (!ok) return false;
                await fetch("/danbooru_anima/vec_init", {method:"POST"});
                _vecInitPromise = new Promise(resolve => {
                    const poll = setInterval(async () => {
                        const pR = await fetch("/danbooru_anima/vec_status");
                        const pD = await pR.json();
                        if (pD.ready) { clearInterval(poll); _vecReady = true; resolve(true); }
                        if (pD.error) { clearInterval(poll); resolve(false); }
                    }, 1500);
                });
                return await _vecInitPromise;
            };
            semBtn.onclick = async () => {
                if (!_semanticActive) {
                    // 首次开启语义搜索 → 检查引擎（加载中给视觉反馈，避免误以为坏了）
                    semBtn.textContent = "⏳";
                    semBtn.disabled = true;
                    semBtn.title = "语义搜索加载中...";
                    try {
                        const ready = await _ensureVecReady();
                        if (!ready) { semBtn.textContent = "🧠"; semBtn.title = animaTxt("语义搜索（E5-Small）"); return; } // 用户取消或失败，不开启
                    } finally {
                        semBtn.disabled = false;
                        if (!_semanticActive) { semBtn.textContent = "🧠"; semBtn.title = animaTxt("语义搜索（E5-Small）"); }
                    }
                }
                _semanticActive = !_semanticActive;
                Object.assign(semBtn.style, _semanticActive ? _SEM_STYLE : _SEM_DEF_STYLE);
                searchInput.placeholder = _semanticActive ? "🔮 输入中文/英文，语义匹配标签..." : "输入文字后按回车键即可模糊搜索";
                if (!_semanticActive) { acList.style.display = "none"; }
            };

            // ── ⭐ 收藏夹 ──
            const _getFavs = async (force = false) => {
                if (!force && _favCache) return _favCache;
                const r = await fetch('/danbooru_anima/favorites');
                const text = await r.text();
                let d = {};
                try {
                    d = JSON.parse(text);
                } catch (e) {
                    throw new Error('收藏夹接口异常（HTTP ' + r.status + '），请先重启 ComfyUI 再打开');
                }
                if (d.success === false || !d.favorites || typeof d.favorites !== "object") {
                    throw new Error(d.error || ('收藏夹加载失败 HTTP ' + r.status));
                }
                _favCache = d.favorites;
                return _favCache;
            };
            const _toggleFav = async (tag, cat, thumbUrl, cn) => {
                if (!_favCache) await _getFavs();
                if (_favCache[cat]?.[tag]) {
                    await fetch('/danbooru_anima/favorites/remove', {
                        method: 'POST', headers: {'Content-Type':'application/json'},
                        body: JSON.stringify({ tag, category: cat })
                    });
                    delete _favCache[cat][tag];
                    const _o2 = _favCache[cat]?._order;
                    if (_o2) { const _ix2 = _o2.indexOf(tag); if (_ix2 >= 0) _o2.splice(_ix2, 1); }
                    return 'removed';
                } else {
                    const addR = await fetch('/danbooru_anima/favorites/add', {
                        method: 'POST', headers: {'Content-Type':'application/json'},
                        body: JSON.stringify({ tag, category: cat, thumb_url: thumbUrl || '', cn: cn || '' })
                    });
                    const addD = await addR.json();
                    if (!addD.success) { console.warn('[Fav] add failed', addD); return 'error'; }
                    if (!_favCache[cat]) _favCache[cat] = { _order: [] };
                    _favCache[cat][tag] = { thumb: thumbUrl || '', cn: cn || '' };
                    if (_favCache[cat]._order) {
                        if (!_favCache[cat]._order.includes(tag)) _favCache[cat]._order.push(tag);
                        console.log('[Fav] pushed to order', {cat, tag, orderLen: _favCache[cat]._order.length});
                    } else {
                        _favCache[cat]._order = [tag];
                        console.log('[Fav] created order', {cat, tag});
                    }
                    return 'added';
                }
            };
            // 预加载收藏列表，让 ❤️/★ 按钮初始状态正确（只改爱心，禁止整表重绘，否则会把瀑布流已加载页清掉）
            _getFavs().then(() => {
                try {
                    gridContainer.querySelectorAll(".db-img-card").forEach(function(card) {
                        var pid = String(card.dataset.postid || card._postId || "");
                        if (!pid) return;
                        var btn = card.querySelector('[data-role="img-fav"]');
                        if (!btn) return;
                        var isFav = _favCache && _favCache.images && _favCache.images[pid];
                        btn.textContent = isFav ? "❤️" : "🤍";
                        btn.title = isFav ? "取消收藏图片" : "收藏图片";
                        btn.style.color = isFav ? "#f87171" : "var(--anima-ink)";
                    });
                } catch(e) {}
            });
            const openFavPopup = async () => {
                try {
                (function(){
                    if (!document.getElementById('db-fav-folder-sort-css')) {
                        var st = document.createElement('style');
                        st.id = 'db-fav-folder-sort-css';
                        st.textContent = '.db-fav-folder-ghost{opacity:.45;} .db-fav-folder-handle{cursor:grab;flex-shrink:0;padding:0 4px;color:var(--anima-ink-soft);user-select:none;} .db-fav-folder-handle:active{cursor:grabbing;}';
                        document.head.appendChild(st);
                    }
                    if (window.Sortable) return;
                    if (document.getElementById('db-fav-sortable-js')) return;
                    var s = document.createElement('script');
                    s.id = 'db-fav-sortable-js';
                    s.src = window.animaAsset("sortable.min.js");
                    document.head.appendChild(s);
                })();
                let favs = await _getFavs();
                const overlay = $el('div', { className: 'db-fav-overlay', style: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 } });
                const _overlayRemoveRaw = overlay.remove.bind(overlay);
                overlay.remove = function () {
                    if (window.__animaFavRefresh) delete window.__animaFavRefresh.danbooru;
                    return _overlayRemoveRaw();
                };
                const _favSize = JSON.parse(localStorage.getItem('db_fav_size') || '{"w":1000,"h":640}');
const dialog = $el('div', { style: { background: 'linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)', borderRadius: '8px', padding: '16px', width: _favSize.w + 'px', height: _favSize.h + 'px', maxWidth: '95vw', maxHeight: '90vh', minWidth: '400px', minHeight: '300px', border: '1px solid rgba(var(--anima-line-soft-rgb),.42)', boxShadow: '0 6px 30px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', resize: 'both', overflow: 'auto' } });
if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(dialog);
                dialog.classList.add('anima-fav-popup');
dialog.onmouseup = () => {
  const nw = Math.max(400, dialog.offsetWidth);
  const nh = Math.max(300, dialog.offsetHeight);
  if (nw !== _favSize.w || nh !== _favSize.h) { _favSize.w = nw; _favSize.h = nh; localStorage.setItem('db_fav_size', JSON.stringify(_favSize)); }
};
                const titleRow = $el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } });
                const title = $el('div', { textContent: '⭐ 收藏夹', style: { fontSize: '15px', fontWeight: 'bold', color: 'var(--anima-ink)' } });
                const closeBtn = $el('span', { textContent: '✕', style: { cursor: 'pointer', color: 'var(--anima-ink-strong)', fontSize: '14px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(var(--anima-line-soft-rgb),.42)', background: 'rgba(var(--anima-input-rgb),.86)' }, onclick: () => overlay.remove() });
                // 导出/导入收藏
                const makeIoBtn = (txt, title, color, onClick) => {
                    const b = $el('button', { textContent: txt, title, style: { padding: '4px 10px', borderRadius: '4px', border: '1px solid ' + color, background: 'transparent', color, cursor: 'pointer', fontSize: '12px', marginRight: '6px' }, onclick: onClick });
                    return b;
                };
                const exportBtn = makeIoBtn('📤 导出', '导出收藏为 JSON 文件', 'var(--anima-ink-mid)', () => {
                    window.open('/danbooru_anima/favorites/export', '_blank');
                });
                const importBtn = makeIoBtn('📥 导入', '从 JSON 文件导入收藏', '#34d399', () => {
                    const inp = document.createElement('input');
                    inp.type = 'file';
                    inp.accept = '.json';
                    inp.onchange = async (ev) => {
                        const file = ev.target.files?.[0];
                        if (!file) return;
                        try {
                            const text = await file.text();
                            const data = JSON.parse(text);
                            // 自定义弹窗
                            const mask = $el('div', { style: { position:'fixed', inset:0, background:'transparent', display:'flex', alignItems:'center', justifyContent:'center', zIndex:99999 } });
                            const box = $el('div', { style: { background:'linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)', borderRadius:'8px', padding:'24px', width:'380px', border:'1px solid rgba(var(--anima-line-soft-rgb),.42)', textAlign:'center' } });
                            box.innerHTML = '<div style="font-size:16px;font-weight:bold;color:#e0e0e0;margin-bottom:12px;">📥 导入收藏</div>'
                                + '<div style="font-size:13px;color:var(--anima-ink-soft);margin-bottom:16px;">选择导入方式：</div>'
                                + '<div style="display:flex;gap:8px;justify-content:center;">'
                                + '<button id="db-imp-merge" style="flex:1;padding:8px 0;border:1px solid rgba(var(--anima-line-soft-rgb),.42);border-radius:4px;background:var(--anima-line);color:var(--anima-ink-mid);cursor:pointer;font-size:13px;font-weight:bold;">不覆盖</button>'
                                + '<button id="db-imp-over" style="flex:1;padding:8px 0;border:1px solid rgba(var(--anima-line-soft-rgb),.42);border-radius:4px;background:#2a1616;color:#f87171;cursor:pointer;font-size:13px;font-weight:bold;">覆盖（清空文件夹）</button>'
                                + '</div>';
                            const doImp = async (mode) => {
                                mask.remove();
                                const r = await fetch('/danbooru_anima/favorites/import', {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ favorites: data, mode })
                                });
                                const d = await r.json();
                                if (d.success) {
                                    _favCache = null;
                                    favs = await _getFavs(true);
                                    _folders = favs._folders || {};
                                    _buildMainTabs();
                                    _buildSidebar();
                                    _renderContent();
                                }
                                alert(d.message || (d.success ? '导入成功' : '导入失败: ' + (d.error || '未知')));
                            };
                            box.querySelector('#db-imp-merge').onclick = () => doImp('merge');
                            box.querySelector('#db-imp-over').onclick = () => doImp('overwrite');
                            if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(box);
                            mask.appendChild(box);
                            mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
                            document.body.appendChild(mask);
                        } catch (e) { alert('导入失败: ' + (e.message || e)); }
                    };
                    inp.click();
                });
                titleRow.append(title, exportBtn, importBtn, closeBtn);
                const _searchAndSelect = async (tagStr, postId) => {
                    overlay.remove();
                    // 替换选中：清掉旧的，只保留当前单图
                    _multiSelections.clear();
                    _multiSelections.add(Number(postId));
                    const sels = [..._multiSelections].map(id => {
                        const p = postById(id);
                        return p ? postSnap(p) : { post_id: Number(id) };
                    });
                    const pl = JSON.stringify({ selections: sels, merge: _multiMerge, image_connected: imageConnected() });
                    if (selWidget) selWidget.value = pl;
                    node.isChanged = true;
                    // 加载中占位
                    gridContainer.innerHTML = '<div style="text-align:center;padding:40px;color:var(--anima-ink-soft);font-size:16px;grid-column:1/-1;">⏳ 正在加载收藏的图片...</div>';
                    // 直接调 post API 拿到图片数据，不走搜索栏
                    try {
                        const r = await fetch('/danbooru_anima/post/' + postId);
                        const d = await r.json();
                        if (d.success && d.post) {
                            const p = d.post;
                            const post = {
                                id: p.id,
                                preview_url: p.preview_url || '',
                                large_url: p.large_url || '',
                                file_url: p.file_url || '',
                                is_video: false,
                                tags: Array.isArray(p.tags) ? p.tags.join(' ') : (p.tags || ''),
                                rating: p.rating || '',
                                score: p.score || 0,
                                width: p.width || 0,
                                height: p.height || 0,
                            };
                            currentPosts = [post];
                            renderGrid([post]);
                            if (selWidget) selWidget.value = JSON.stringify({ selections: [postSnap(post)], merge: _multiMerge, image_connected: imageConnected() });
                            node.isChanged = true;
                            if (d.classified) tagCache[post.id] = d.classified;
                            if (d.translations) {
                                Object.assign(_globalTagTranslations, d.translations);
                                tagTranslationCache[post.id] = d.translations;
                            }
                            setTimeout(() => {
                                for (const card of gridContainer.children) {
                                    if (card._postId === Number(postId)) {
                                        card.style.boxShadow = "0 0 0 3px #fbbf24";
                                        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        setTimeout(() => { card.style.boxShadow = ""; }, 2000);
                                        break;
                                    }
                                }
                            }, 100);
                        }
                    } catch {}
                };
                // ── 侧边栏 + 内容区 ──
                const _tagCats = [
                    { key: 'artists', label: animaTxt("🎨 画师") },
                    { key: 'characters', label: animaTxt("👤 角色") },
                    { key: 'series', label: animaTxt("📺 系列") },
                    { key: 'general', label: animaTxt("🏷 通用") },
                ];
                let _folders = favs._folders || {};
                const mainTabBar = $el('div', { style: { display: 'flex', gap: '4px', borderBottom: '1px solid var(--anima-ink-mid)', marginBottom: '8px' } });
                const bodyRow = $el('div', { style: { display: 'flex', flex: 1, overflow: 'hidden', gap: '12px' } });
                let _favZoom = parseFloat(localStorage.getItem('db_fav_zoom') || '1');
                let _favSideZoom = parseFloat(localStorage.getItem('db_fav_side_zoom') || '1');
                const sidebar = $el('div', { style: { width: (240*_favSideZoom)+'px', minWidth: (240*_favSideZoom)+'px', overflow: 'auto', borderRight: '1px solid var(--anima-line)', paddingRight: '8px', paddingTop: '4px', zoom: _favSideZoom } });
                const contentArea = $el('div', { style: { flex: 1, overflow: 'auto', minHeight: '200px' } });
                let activeMain = 'images';
                let activeCategory = 'images';
                let activeFolder = '__uncat';
                let _imgMode = 'multi';
                let _favSort = 'desc';
                let _tagFavSort = 'rate';
                try {
                    var _tfs0 = localStorage.getItem('db_tag_fav_sort');
                    if (_tfs0 === 'asc' || _tfs0 === 'desc' || _tfs0 === 'rate') _tagFavSort = _tfs0;
                } catch (eTfs) {}
                const _selectedImgs = new Set();
                let _imgPage = 1;
                let _tagPage = 1;
                const IMGS_PER_PAGE = 30;

                let _favFilter = null;
                let _favFilterOpen = false;
                let _favFilterQSeries = '';
                let _favFilterQChar = '';
                let _favShowArtist = false;
                let _favViewKeys = [];
                let _favFacetCache = null;
                let _favPanelItems = null;
                let _favPanelKeys = [];
                let _favFolderDragging = false;
                let _favSortables = [];
                function _favEsc(s) {
                    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
                }
                function _favNormTag(s) { return String(s || '').replace(/ /g, '_').toLowerCase(); }
                function _favActiveSeries() {
                    if (!_favFilter) return '';
                    if (_favFilter.kind === 'series') return _favNormTag(_favFilter.tag);
                    if (_favFilter.series) return _favNormTag(_favFilter.series);
                    return '';
                }
                function _favHasTag(arr, want) {
                    if (!Array.isArray(arr)) return false;
                    want = _favNormTag(want);
                    if (!want) return false;
                    for (let i = 0; i < arr.length; i++) {
                        if (_favNormTag(arr[i]) === want) return true;
                    }
                    return false;
                }
                function _favPushUnique(arr, key) {
                    if (!key) return;
                    if (arr.indexOf(key) < 0) arr.push(key);
                }
                function _favMergeArr(dst, src) {
                    if (!Array.isArray(src)) return dst;
                    if (!src.length) return Array.isArray(dst) ? dst : [];
                    if (!Array.isArray(dst) || !dst.length) return src.slice();
                    const out = dst.slice();
                    src.forEach(function(x) {
                        const k = String(x || '');
                        if (!k) return;
                        const nk = _favNormTag(k);
                        let found = false;
                        for (let i = 0; i < out.length; i++) {
                            if (_favNormTag(out[i]) === nk) { found = true; break; }
                        }
                        if (!found) out.push(k);
                    });
                    return out;
                }
                function _favCharacterTitle() { return _favActiveSeries() ? '本系列角色' : '角色'; }
                function _favCharacterFacets(facets) {
                    const ser = _favActiveSeries();
                    if (ser) return (facets && facets.seriesChars && facets.seriesChars[ser]) || [];
                    return (facets && facets.character) || [];
                }
                function _parseFavMeta(cn) {
                    const out = { tags: '', large_url: '', series: null, character: null, artist: null, translations: {} };
                    function absorb(obj) {
                        if (!obj || typeof obj !== 'object') return;
                        if (obj.tags) out.tags = obj.tags;
                        if (obj.large_url) out.large_url = obj.large_url;
                        out.series = _favMergeArr(out.series, obj.series);
                        out.character = _favMergeArr(out.character, obj.character);
                        out.artist = _favMergeArr(out.artist, obj.artist);
                        if (obj.translations && typeof obj.translations === 'object') {
                            Object.keys(obj.translations).forEach(function(tk) {
                                if (obj.translations[tk] && !out.translations[tk]) out.translations[tk] = obj.translations[tk];
                            });
                        }
                        if (obj.classified && typeof obj.classified === 'object') absorb(obj.classified);
                    }
                    if (!cn) return out;
                    if (typeof cn === 'object') { absorb(cn); return out; }
                    try {
                        absorb(JSON.parse(cn));
                    } catch (e) { out.tags = String(cn); }
                    return out;
                }
                function _userFolderLayout(catKey) {
                    const folders = (_folders[catKey] || {});
                    const existing = Object.keys(folders).filter(function(nm) { return nm !== '__tmp'; });
                    const existSet = {};
                    existing.forEach(function(nm) { existSet[nm] = true; });
                    function dedupe(arr) {
                        const seen = {}, out = [];
                        (arr || []).forEach(function(nm) {
                            if (!nm || !existSet[nm] || seen[nm]) return;
                            seen[nm] = true;
                            out.push(nm);
                        });
                        return out;
                    }
                    const pinned = dedupe((favs._folder_pinned && favs._folder_pinned[catKey]) || []);
                    const pset = {};
                    pinned.forEach(function(nm) { pset[nm] = true; });
                    let unpinned = dedupe((favs._folder_order && favs._folder_order[catKey]) || []).filter(function(nm) { return !pset[nm]; });
                    const known = {};
                    pinned.concat(unpinned).forEach(function(nm) { known[nm] = true; });
                    existing.forEach(function(nm) { if (!known[nm]) unpinned.push(nm); });
                    return { pinned: pinned, unpinned: unpinned };
                }
                function _sortedFolderNames(catKey) {
                    const L = _userFolderLayout(catKey);
                    return L.pinned.concat(L.unpinned);
                }
                function _favCollectFacets(items, folderKeys) {
                    const sig = (folderKeys || []).join('\0');
                    if (_favFacetCache && _favFacetCache.sig === sig) return _favFacetCache.data;
                    const counts = { series: {}, character: {}, artist: {} };
                    const seriesChars = {};
                    const trans = {};
                    (folderKeys || []).forEach(function(k) {
                        const it = items[k];
                        if (!it) return;
                        const m = _parseFavMeta(it.cn);
                        const tr = m.translations || {};
                        Object.keys(tr).forEach(function(tk) { if (tr[tk] && !trans[tk]) trans[tk] = tr[tk]; });
                        const serKeys = [];
                        const chaKeys = [];
                        ['series', 'character', 'artist'].forEach(function(kind) {
                            const arr = m[kind];
                            if (!Array.isArray(arr)) return;
                            arr.forEach(function(t) {
                                if (!t) return;
                                const key = _favNormTag(t);
                                if (!key) return;
                                counts[kind][key] = (counts[kind][key] || 0) + 1;
                                if (!trans[key]) {
                                    const cn = tr[t] || tr[key] || tr[String(t).replace(/_/g, ' ')];
                                    if (cn) trans[key] = cn;
                                }
                                if (kind === 'series') _favPushUnique(serKeys, key);
                                else if (kind === 'character') _favPushUnique(chaKeys, key);
                            });
                        });
                        serKeys.forEach(function(st) {
                            if (!seriesChars[st]) seriesChars[st] = {};
                            chaKeys.forEach(function(ct) {
                                seriesChars[st][ct] = (seriesChars[st][ct] || 0) + 1;
                            });
                        });
                    });
                    function ranked(kind) {
                        return Object.keys(counts[kind]).map(function(t) {
                            return { tag: t, count: counts[kind][t], cn: trans[t] || trans[String(t).replace(/_/g, ' ')] || '' };
                        }).sort(function(a, b) { return b.count - a.count || a.tag.localeCompare(b.tag); });
                    }
                    function rankedMap(obj) {
                        return Object.keys(obj).map(function(t) {
                            return { tag: t, count: obj[t], cn: trans[t] || trans[String(t).replace(/_/g, ' ')] || '' };
                        }).sort(function(a, b) { return b.count - a.count || a.tag.localeCompare(b.tag); });
                    }
                    const seriesCharLists = {};
                    Object.keys(seriesChars).forEach(function(st) { seriesCharLists[st] = rankedMap(seriesChars[st]); });
                    const data = { series: ranked('series'), character: ranked('character'), artist: ranked('artist'), seriesChars: seriesCharLists };
                    _favFacetCache = { sig: sig, data: data };
                    return data;
                }
                function _favKindQuery(kind) {
                    if (kind === 'series') return (_favFilterQSeries || '').trim().toLowerCase();
                    return (_favFilterQChar || '').trim().toLowerCase();
                }
                function _favVisibleList(list, kind) {
                    const q = _favKindQuery(kind);
                    const out = [];
                    const seen = {};
                    function push(it) {
                        const k = _favNormTag(it.tag);
                        if (!k || seen[k]) return;
                        seen[k] = true;
                        out.push(it);
                    }
                    if (kind === 'series') {
                        const ser = _favActiveSeries();
                        if (ser) {
                            for (let i = 0; i < list.length; i++) {
                                if (_favNormTag(list[i].tag) === ser) { push(list[i]); break; }
                            }
                        }
                    } else if (_favFilter && _favFilter.kind === kind) {
                        for (let i = 0; i < list.length; i++) {
                            if (_favNormTag(list[i].tag) === _favNormTag(_favFilter.tag)) { push(list[i]); break; }
                        }
                    }
                    const cap = q ? 80 : 40;
                    if (!q) {
                        for (let i = 0; i < list.length && out.length < cap; i++) push(list[i]);
                    } else {
                        for (let i = 0; i < list.length && out.length < cap; i++) {
                            const en = String(list[i].tag || '').toLowerCase();
                            const cn = String(list[i].cn || '').toLowerCase();
                            const note = (kind === 'series' || kind === 'character') && typeof window.animaFacetNoteGet === 'function'
                                ? String(window.animaFacetNoteGet(kind, list[i].tag) || '').toLowerCase()
                                : '';
                            if (en.indexOf(q) >= 0 || cn.indexOf(q) >= 0 || (note && note.indexOf(q) >= 0)) push(list[i]);
                        }
                    }
                    return out;
                }
                function _favChipRowHtml(kind, title, list) {
                    if (kind === 'artist') {
                        const force = !!(_favFilter && _favFilter.kind === 'artist') || _favShowArtist;
                        if (!force) return '';
                    }
                    const vis = _favVisibleList(list, kind);
                    if (!vis.length) return '';
                    let h = '<div class="db-fav-filter-sec" data-kind="' + kind + '" style="margin-top:6px;">';
                    h += '<div style="color:var(--anima-ink-soft);font-size:11px;margin-bottom:4px;">' + title + '</div>';
                    h += '<div class="db-fav-chip-row" style="display:flex;flex-wrap:wrap;gap:6px;">';
                    vis.forEach(function(it) {
                        let sel = false;
                        if (kind === 'series') sel = _favActiveSeries() === _favNormTag(it.tag);
                        else if (kind === 'character') sel = !!(_favFilter && _favFilter.kind === 'character' && _favNormTag(_favFilter.tag) === _favNormTag(it.tag));
                        else sel = !!(_favFilter && _favFilter.kind === kind && _favNormTag(_favFilter.tag) === _favNormTag(it.tag));
                        const base = it.cn ? (String(it.tag || '') + ' ' + String(it.cn || '')) : String(it.tag || '');
                        let label = _favEsc(base);
                        let tip = '';
                        if (kind === 'series' || kind === 'character') {
                            const note = (typeof window.animaFacetNoteGet === 'function') ? window.animaFacetNoteGet(kind, it.tag) : '';
                            if (note) label = _favEsc(note);
                            tip = ' title="' + _favEsc(base + ' — ' + animaTxt('右键设置备注')) + '"';
                        }
                        h += '<button type="button" class="db-fav-fchip" data-kind="' + kind + '" data-tag="' + _favEsc(it.tag) + '" data-cn="' + _favEsc(it.cn) + '"' + tip + ' style="padding:3px 8px;border-radius:12px;border:1px solid ' + (sel ? '#f87171' : 'rgba(var(--anima-line-soft-rgb),.42)') + ';background:' + (sel ? 'rgba(248,113,113,0.18)' : 'rgba(var(--anima-input-rgb),.86)') + ';color:var(--anima-ink-strong);cursor:pointer;font-size:11px;">' + label + ' <span style="opacity:.7">(' + it.count + ')</span></button>';
                    });
                    h += '</div></div>';
                    return h;
                }
                function _favRebuildFilterSections(root) {
                    if (!root || !_favFacetCache || !_favFacetCache.data) return;
                    const panel = root.querySelector('.db-fav-filter-panel');
                    if (!panel) return;
                    const loading = panel.querySelector('.db-fav-filter-loading');
                    if (loading) loading.remove();
                    const facets = _favFacetCache.data;
                    const artBtn = panel.querySelector('.db-fav-filter-show-artist');
                    if (artBtn && !(facets.artist && facets.artist.length)) artBtn.remove();
                    panel.querySelectorAll('.db-fav-filter-sec').forEach(function(el) { el.remove(); });
                    const empty = panel.querySelector('.db-fav-filter-empty');
                    if (empty) empty.remove();
                    const html = _favChipRowHtml('series', '系列', facets.series)
                        + _favChipRowHtml('character', _favCharacterTitle(), _favCharacterFacets(facets))
                        + _favChipRowHtml('artist', '画师', facets.artist);
                    if (html) panel.insertAdjacentHTML('beforeend', html);
                    else panel.insertAdjacentHTML('beforeend', '<div class="db-fav-filter-empty" style="color:var(--anima-ink-soft);font-size:12px;margin-top:6px;">暂无系列/角色数据。请到设置里一键为旧收藏补全标签。</div>');
                }
                function _favItemMatch(item, filter) {
                    if (!filter || !item) return true;
                    const m = _parseFavMeta(item.cn);
                    if (filter.kind === 'series') return _favHasTag(m.series, filter.tag);
                    if (filter.kind === 'character') {
                        if (!_favHasTag(m.character, filter.tag)) return false;
                        if (filter.series) return _favHasTag(m.series, filter.series);
                        return true;
                    }
                    return _favHasTag(m[filter.kind], filter.tag);
                }
                function _favFilterPanelHtml(items, folderKeys) {
                    if (!_favFilterOpen) return '';
                    const sig = (folderKeys || []).join('\0');
                    const cached = (_favFacetCache && _favFacetCache.sig === sig && _favFacetCache.data) || null;
                    let html = '<div class="db-fav-filter-panel" style="display:block;margin:0 0 10px;padding:8px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);border-radius:6px;background:rgba(var(--anima-well-rgb),.10);">';
                    html += '<div style="display:flex;flex-direction:column;gap:6px;">';
                    html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">';
                    html += '<input class="db-fav-filter-q-series" value="' + _favEsc(_favFilterQSeries) + '" placeholder="搜系列…" style="flex:1;min-width:140px;padding:4px 8px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);color:var(--anima-ink-mid);font-size:12px;outline:none;">';
                    if (_favFilter) html += '<button type="button" class="db-fav-filter-clear" style="padding:4px 10px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:rgba(var(--anima-input-rgb),.86);color:var(--anima-ink-strong);cursor:pointer;font-size:11px;">清除筛选</button>';
                    if (!_favShowArtist && (!cached || (cached.artist && cached.artist.length))) html += '<button type="button" class="db-fav-filter-show-artist" style="padding:4px 10px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:rgba(var(--anima-input-rgb),.86);color:var(--anima-ink-strong);cursor:pointer;font-size:11px;">显示画师</button>';
                    html += '</div>';
                    html += '<input class="db-fav-filter-q-char" value="' + _favEsc(_favFilterQChar) + '" placeholder="搜角色…" style="width:100%;box-sizing:border-box;padding:4px 8px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);color:var(--anima-ink-mid);font-size:12px;outline:none;">';
                    html += '<div style="font-size:11px;color:var(--anima-mute-dim);">' + animaTxt('右键角色或系列可设备注') + '</div>';
                    html += '</div>';
                    if (cached) {
                        const facets = cached;
                        const ser = facets.series, cha = facets.character, art = facets.artist;
                        html += _favChipRowHtml('series', '系列', ser);
                        html += _favChipRowHtml('character', _favCharacterTitle(), _favCharacterFacets(facets));
                        html += _favChipRowHtml('artist', '画师', art);
                        if (!ser.length && !cha.length && !art.length) html += '<div class="db-fav-filter-empty" style="color:var(--anima-ink-soft);font-size:12px;margin-top:6px;">暂无系列/角色数据。请到设置里一键为旧收藏补全标签。</div>';
                    } else {
                        html += '<div class="db-fav-filter-loading" style="color:var(--anima-ink-soft);font-size:12px;margin-top:6px;">加载筛选…</div>';
                    }
                    html += '</div>';
                    return html;
                }
                function _favFillFilterPanel(root) {
                    if (!_favFilterOpen || !root || !_favPanelItems || !_favPanelKeys) return;
                    _favCollectFacets(_favPanelItems, _favPanelKeys);
                    _favRebuildFilterSections(root);
                }
                function _favToggleFilterPanel(root, fallbackRender) {
                    _favFilterOpen = !_favFilterOpen;
                    const btn = root && root.querySelector('.db-fav-filter-toggle');
                    if (btn) btn.textContent = animaTxt("筛选 ") + (_favFilterOpen ? '▴' : '▾');
                    const existing = root && root.querySelector('.db-fav-filter-panel');
                    if (!_favFilterOpen) {
                        if (existing) existing.remove();
                        return;
                    }
                    if (existing) return;
                    const bar = root && root.querySelector('.db-mode-bar');
                    if (!bar || !_favPanelItems || !_favPanelKeys) {
                        if (typeof fallbackRender === 'function') fallbackRender();
                        return;
                    }
                    bar.insertAdjacentHTML('afterend', _favFilterPanelHtml(_favPanelItems, _favPanelKeys));
                    const sig = (_favPanelKeys || []).join('\0');
                    if (!(_favFacetCache && _favFacetCache.sig === sig)) {
                        requestAnimationFrame(function() { _favFillFilterPanel(root); });
                    }
                }
                function _openFolder(catKey, folder) {
                    if (_favFolderDragging) return;
                    _favFilter = null;
                    _favFacetCache = null;
                    activeCategory = catKey;
                    activeFolder = folder;
                    _imgPage = 1;
                    _tagPage = 1;
                    _renderContent();
                    _buildSidebar();
                }
                function _bindFavFolderSortable(wrap, catKey, isPinned) {
                    if (!wrap || !wrap.children.length) return;
                    let tries = 0;
                    function go() {
                        if (!window.Sortable || !wrap.isConnected) {
                            if (++tries > 25) return;
                            setTimeout(go, 80);
                            return;
                        }
                        const inst = Sortable.create(wrap, {
                            handle: '.db-fav-folder-handle',
                            animation: 150,
                            ghostClass: 'db-fav-folder-ghost',
                            group: { name: isPinned ? 'db-fav-pin' : 'db-fav-order', pull: false, put: false },
                            onStart: function() { _favFolderDragging = true; },
                            onEnd: function() {
                                setTimeout(function() { _favFolderDragging = false; }, 50);
                                const pinW = sidebar.querySelector('.db-fav-pin-wrap');
                                const ordW = sidebar.querySelector('.db-fav-order-wrap');
                                const readNames = function(w) {
                                    if (!w) return [];
                                    return Array.from(w.querySelectorAll('.db-fav-folder-row')).map(function(el) { return el.dataset.folderName; }).filter(Boolean);
                                };
                                const layout = _userFolderLayout(catKey);
                                const pinned = pinW ? readNames(pinW) : layout.pinned;
                                const order = ordW ? readNames(ordW) : layout.unpinned;
                                fetch('/danbooru_anima/favorites/folder', {
                                    method: 'POST', headers: {'Content-Type':'application/json'},
                                    body: JSON.stringify({ action: 'reorder', category: catKey, pinned: pinned, order: order })
                                }).then(function(r) { return r.json(); }).then(function(d) {
                                    if (!d || !d.success) {
                                        alert('排序保存失败: ' + ((d && d.error) || ''));
                                        _refreshPopupData();
                                        return;
                                    }
                                    if (!favs._folder_pinned) favs._folder_pinned = {};
                                    if (!favs._folder_order) favs._folder_order = {};
                                    favs._folder_pinned[catKey] = (d.pinned != null) ? d.pinned : pinned;
                                    favs._folder_order[catKey] = (d.order != null) ? d.order : order;
                                    if (_favCache) {
                                        _favCache._folder_pinned = favs._folder_pinned;
                                        _favCache._folder_order = favs._folder_order;
                                    }
                                }).catch(function() { _refreshPopupData(); });
                            }
                        });
                        _favSortables.push(inst);
                    }
                    go();
                }

                // ── 收藏夹查看大图覆盖层 ──
                const _showFavImageOverlay = (largeUrl, thumbUrl, postId) => {
                    const _sUrl = largeUrl || thumbUrl || "";
                    if (!_sUrl) return;
                    let _showingOrig = false;
                    const _ov = $el("div", { style: { position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "12px" } });
                    let _imgFallbackDone = false;
                    const _img = $el("img", {
                        style: { maxWidth: "95%", maxHeight: "85%", objectFit: "contain", borderRadius: "6px", boxShadow: "0 4px 30px rgba(0,0,0,0.6)", cursor: "zoom-out" },
                        onclick: () => _ov.remove(),
                        onerror: () => {
                            if (!_imgFallbackDone && thumbUrl) {
                                _imgFallbackDone = true;
                                _img.src = "/danbooru_anima/image_proxy?url=" + encodeURIComponent(thumbUrl);
                            }
                        }
                    });
                    _img.src = "/danbooru_anima/image_proxy?url=" + encodeURIComponent(_sUrl);
                    const _bar = $el("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", justifyContent: "center" } });
                    // 查看原图按钮
                    const _viewBtn = $el("span", {
                        textContent: animaTxt("📥 查看原图"),
                        style: { padding: "8px 18px", borderRadius: "6px", background: "var(--anima-line)", color: "var(--anima-ink-strong)", cursor: "pointer", fontSize: "14px", fontWeight: "700", border: "1px solid rgba(var(--anima-line-soft-rgb),.42)", display: largeUrl ? "inline" : "none" },
                        onclick: () => {
                            if (_showingOrig) return;
                            _showingOrig = true;
                            _viewBtn.textContent = animaTxt("⏳ 加载中...");
                            _viewBtn.style.opacity = "0.5";
                            const _testImg = new Image();
                            _testImg.onload = () => {
                                _img.src = "/danbooru_anima/image_proxy?url=" + encodeURIComponent(largeUrl);
                                _viewBtn.textContent = animaTxt("✅ 原图");
                                _viewBtn.style.opacity = "1";
                            };
                            _testImg.onerror = () => {
                                _viewBtn.textContent = animaTxt("❌ 原图加载失败");
                                _viewBtn.style.opacity = "1";
                                _showingOrig = false;
                            };
                            _testImg.src = "/danbooru_anima/image_proxy?url=" + encodeURIComponent(largeUrl);
                        }
                    });
                    const _dlBtn = $el("span", {
                        textContent: "⏬ 保存",
                        style: { padding: "8px 18px", borderRadius: "6px", background: "linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi))", color: "#ffffff", cursor: "pointer", fontSize: "14px", fontWeight: "700", border: "1px solid rgba(var(--anima-line-soft-rgb),.42)" },
                        onclick: async () => {
                            const _targetUrl = _showingOrig ? largeUrl : _sUrl;
                            if (!_targetUrl) return;
                            try {
                                const r = await fetch("/danbooru_anima/image_proxy?url=" + encodeURIComponent(_targetUrl));
                                const blob = await r.blob();
                                const a = document.createElement("a");
                                a.href = URL.createObjectURL(blob);
                                a.download = (postId || "image") + "_" + (_targetUrl.split("/").pop() || "image.jpg");
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(a.href);
                            } catch(ex) { alert("保存失败: " + (ex.message || ex)); }
                        }
                    });
                    const _closeBtn = $el("span", {
                        textContent: animaTxt("✕ 关闭"),
                        style: { padding: "8px 18px", borderRadius: "6px", background: "linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)", color: "var(--anima-ink-strong)", cursor: "pointer", fontSize: "14px", fontWeight: "700", border: "1px solid rgba(var(--anima-line-soft-rgb),.42)" },
                        onclick: () => _ov.remove()
                    });
                    _bar.append(_viewBtn, _dlBtn, _closeBtn);
                    _ov.append(_img, _bar);
                    document.body.appendChild(_ov);
                };

                const _buildFavImg = (key, thumb, tagsStr, mode, largeUrl) => {
                    const isChk = _selectedImgs.has(key);
                    const chkHtml = '<div class="db-img-check" style="position:absolute;top:4px;right:4px;z-index:5;width:24px;height:24px;background:rgba(0,0,0,0.7);border-radius:4px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:' + (isChk ? '#fbbf24' : 'var(--anima-ink-mid)') + ';font-size:16px;">' + (isChk ? '☑' : '☐') + '</div>';
                    const selOv = isChk ? '<div style="position:absolute;inset:0;z-index:4;background:rgba(248,113,113,0.15);display:flex;align-items:center;justify-content:center;"><span style="font-size:48px;color:#f87171;text-shadow:0 2px 8px rgba(0,0,0,0.8);">✓</span></div>' : '';
                    const imgThumb = thumb
                        ? '<div style="width:100%;aspect-ratio:16/9;overflow:hidden;background:rgba(var(--anima-well-rgb),.08);display:flex;align-items:center;justify-content:center;"><img src="/danbooru_anima/image_proxy?url=' + encodeURIComponent(thumb) + '" style="max-width:100%;max-height:100%;object-fit:contain;" loading="lazy"></div>'
                        : '<div style="width:100%;aspect-ratio:16/9;background:rgba(var(--anima-well-rgb),.08);display:flex;align-items:center;justify-content:center;color:rgba(var(--anima-ink-chip-rgb),.78);font-size:16px;">🖼</div>';
                    const largeBtnHtml = largeUrl ? '<div class="db-img-large" data-postid="' + key + '" data-largeurl="' + largeUrl.replace(/"/g, '&quot;') + '" data-thumb="' + (thumb || '').replace(/"/g, '&quot;') + '" title="查看大图">🖼️ 大图</div>' : '';
                    return '<div class="db-fav-img" draggable="true" data-postid="' + key + '" data-tags="' + tagsStr.replace(/"/g, '&quot;') + '" data-cat="images" style="position:relative;background:rgba(var(--anima-well-rgb),.16);border-radius:6px;overflow:hidden;border:2px solid ' + (isChk ? '#f87171' : 'rgba(255,255,255,.12)') + ';cursor:pointer;">'
                        + selOv + chkHtml + imgThumb
                        + '<div class="db-fav-hover-actions">'
                        + '<div class="db-img-cls" data-postid="' + key + '" title="画师/角色/系列">🔍 分类</div>'
                        + largeBtnHtml
                        + '<button class="db-img-del" data-postid="' + key + '">🗑 删除</button>'
                        + '</div></div>';
                };
                const _getFolderKeys = (catKey) => {
                    const folders = _folders[catKey] || {};
                    const allInFolders = new Set();
                    for (const items of Object.values(folders)) {
                        for (const k of items) allInFolders.add(k);
                    }
                    return {
                        uncategorized: Object.keys(favs[catKey] || {}).filter(k => k !== '_order' && !allInFolders.has(k)),
                        folders,
                    };
                };
                const _makeFolderItems = (parentDiv, catKey) => {
                    const fdata = _getFolderKeys(catKey);
                    const total = Object.keys(favs[catKey] || {}).filter(k => k !== '_order').length;
                    const layout = _userFolderLayout(catKey);
                    const tmpItems = (fdata.folders['__tmp'] || []).length;
                    const subStyle = (sel) => ({ fontSize: '12px', padding: '3px 6px 3px 32px', cursor: 'pointer', color: sel ? 'var(--anima-ink-mid)' : 'var(--anima-ink-soft)', borderRadius: '3px', marginBottom: '1px', background: sel ? 'var(--anima-line)' : 'transparent' });
                    const rowStyle = (sel) => ({ fontSize: '12px', padding: '3px 6px 3px 20px', cursor: 'pointer', color: sel ? 'var(--anima-ink-mid)' : 'var(--anima-ink-soft)', borderRadius: '3px', marginBottom: '1px', background: sel ? 'var(--anima-line)' : 'transparent', display: 'flex', alignItems: 'center', gap: '4px' });
                    const makeDropTarget = (el, targetFolder) => {
                        el.dataset.dropFolder = targetFolder;
                        el.addEventListener('dragenter', (e) => { e.preventDefault(); el.style.background = 'var(--anima-line)'; el.style.outline = '2px solid #f87171'; });
                        el.addEventListener('dragover', (e) => e.preventDefault());
                        el.addEventListener('dragleave', () => { el.style.background = ''; el.style.outline = ''; });
                        el.addEventListener('drop', (e) => {
                            e.preventDefault(); e.stopPropagation();
                            el.style.background = ''; el.style.outline = '';
                            const postIds = e.dataTransfer.getData('text/db-drag-ids');
                            if (!postIds) return;
                            const ids = JSON.parse(postIds);
                            const isUncat = el.dataset.dropUncat === '1';
                            const body = isUncat
                                ? JSON.stringify({ action: 'remove_from_all', category: 'images', item_keys: ids })
                                : JSON.stringify({ action: 'move', category: 'images', item_keys: ids, target_folder: targetFolder });
                            fetch('/danbooru_anima/favorites/folder', {
                                method: 'POST', headers: {'Content-Type':'application/json'},
                                body
                            }).then(r => r.json()).then(d => {
                                if (d.success) { _selectedImgs.clear(); _refreshPopupData(); }
                                else alert('移动失败: ' + (d.error || ''));
                            });
                        });
                    };
                    const appendFolderRow = (host, fname, isPinned) => {
                        const cnt = (fdata.folders[fname] || []).length;
                        const wrap = $el('div', { className: 'db-fav-folder-row', style: rowStyle(activeCategory === catKey && activeFolder === fname) });
                        wrap.dataset.folderName = fname;
                        const handle = $el('span', { className: 'db-fav-folder-handle', textContent: '☰' });
                        handle.addEventListener('click', (e) => e.stopPropagation());
                        const label = $el('span', { className: 'db-fav-folder-label', textContent: (isPinned ? '📌 ' : '📁 ') + fname + ' (' + cnt + ')', style: { flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } });
                        wrap.append(handle, label);
                        wrap.onclick = (e) => { e.stopPropagation(); _openFolder(catKey, fname); };
                        makeDropTarget(wrap, fname);
                        wrap.addEventListener('contextmenu', (e) => {
                            e.preventDefault(); e.stopPropagation();
                            const menu = $el('div', { style: { position: 'fixed', left: e.clientX + 'px', top: e.clientY + 'px', background: 'linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)', border: '1px solid rgba(var(--anima-line-soft-rgb),.42)', borderRadius: '6px', padding: '4px', zIndex: 10001, minWidth: '140px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' } });
                            const addItem = (lab, cb) => {
                                const item = $el('div', { textContent: lab, style: { padding: '6px 12px', cursor: 'pointer', color: 'var(--anima-ink-soft)', fontSize: '13px', borderRadius: '4px' }, onmouseenter: () => { item.style.background = 'var(--anima-line)'; }, onmouseleave: () => { item.style.background = 'transparent'; }, onclick: () => { menu.remove(); cb(); } });
                                menu.appendChild(item);
                            };
                            addItem(isPinned ? '📌 取消置顶' : '📌 置顶', () => {
                                fetch('/danbooru_anima/favorites/folder', {
                                    method: 'POST', headers: {'Content-Type':'application/json'},
                                    body: JSON.stringify({ action: isPinned ? 'unpin' : 'pin', category: catKey, name: fname })
                                }).then(r => r.json()).then(d => { if (d.success) _refreshPopupData(); else alert((isPinned ? '取消置顶' : '置顶') + '失败: ' + (d.error || '')); });
                            });
                            addItem('✏️ 重命名', () => {
                                const newName = prompt('新名称：', fname);
                                if (newName && newName.trim() && newName.trim() !== fname) {
                                    fetch('/danbooru_anima/favorites/folder', {
                                        method: 'POST', headers: {'Content-Type':'application/json'},
                                        body: JSON.stringify({ action: 'rename', category: catKey, name: fname, new_name: newName.trim() })
                                    }).then(r => r.json()).then(d => { if (d.success) _refreshPopupData(); else alert('重命名失败: ' + (d.error || '')); });
                                }
                            });
                            addItem('🗑 删除（内容→临时）', () => {
                                if (!confirm('确定删除文件夹「' + fname + '」？内容将移到 📦 临时。')) return;
                                fetch('/danbooru_anima/favorites/folder', {
                                    method: 'POST', headers: {'Content-Type':'application/json'},
                                    body: JSON.stringify({ action: 'delete', category: catKey, name: fname })
                                }).then(r => r.json()).then(d => { if (d.success) _refreshPopupData(); else alert('删除失败: ' + (d.error || '')); });
                            });
                            const closeMenu = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', closeMenu); } };
                            setTimeout(() => document.addEventListener('click', closeMenu), 10);
                            document.body.appendChild(menu);
                        });
                        host.appendChild(wrap);
                    };
                    if (total > 0 && fdata.uncategorized.length > 0) {
                        const uc = $el('div', { textContent: '📂 未分类 (' + fdata.uncategorized.length + ')', style: subStyle(activeCategory === catKey && activeFolder === '__uncat'), onclick: (e) => { e.stopPropagation(); _openFolder(catKey, '__uncat'); } });
                        uc.dataset.dropUncat = '1';
                        makeDropTarget(uc, '__tmp');
                        parentDiv.appendChild(uc);
                    }
                    if (layout.pinned.length) {
                        const pinWrap = $el('div', { className: 'db-fav-pin-wrap' });
                        layout.pinned.forEach(function(fn) { appendFolderRow(pinWrap, fn, true); });
                        parentDiv.appendChild(pinWrap);
                        _bindFavFolderSortable(pinWrap, catKey, true);
                    }
                    if (layout.unpinned.length) {
                        const orderWrap = $el('div', { className: 'db-fav-order-wrap' });
                        layout.unpinned.forEach(function(fn) { appendFolderRow(orderWrap, fn, false); });
                        parentDiv.appendChild(orderWrap);
                        _bindFavFolderSortable(orderWrap, catKey, false);
                    }
                    if (tmpItems > 0) {
                        const tdiv = $el('div', { textContent: '📦 临时 (' + tmpItems + ')', style: { ...subStyle(activeCategory === catKey && activeFolder === '__tmp'), color: activeCategory === catKey && activeFolder === '__tmp' ? '#f87171' : 'var(--anima-accent-soft)' }, onclick: (e) => { e.stopPropagation(); _openFolder(catKey, '__tmp'); } });
                        makeDropTarget(tdiv, '__tmp');
                        parentDiv.appendChild(tdiv);
                    }
                };

                const _buildMainTabs = () => {
                    mainTabBar.innerHTML = '';
                    const mains = [
                        { key: 'images', label: animaTxt("🖼 图片"), cnt: Object.keys(favs.images || {}).filter(k => k !== '_order').length },
                        { key: 'tags', label: '🏷 标签', cnt: _tagCats.reduce((s, c) => s + Object.keys(favs[c.key] || {}).filter(k => k !== '_order').length, 0) },
                    ];
                    for (const { key, label, cnt } of mains) {
                        const tab = $el('div', {
                            textContent: label + (cnt ? ' (' + cnt + ')' : ''),
                            style: { padding: '8px 18px', cursor: 'pointer', color: 'var(--anima-ink)', fontSize: '13px', borderRadius: '6px 6px 0 0', fontWeight: 'bold', background: activeMain === key ? 'var(--anima-line)' : 'transparent', borderBottom: activeMain === key ? '2px solid #f87171' : '2px solid transparent' },
                            onclick: () => {
                                if (activeMain === key) return;
                                activeMain = key;
                                activeCategory = key === 'images' ? 'images' : _tagCats[0].key;
                                activeFolder = null;
                                _favFilter = null;
                                _favFacetCache = null;
                                _imgPage = 1;
                                _tagPage = 1;
                                _buildMainTabs();
                                _buildSidebar();
                                _renderContent();
                            }
                        });
                        mainTabBar.appendChild(tab);
                    }
                };
                const _buildSidebar = () => {
                    _favSortables.forEach(function(s) { try { s.destroy(); } catch (e2) {} });
                    _favSortables = [];
                    sidebar.innerHTML = '';
                    if (activeMain === 'images') {
                        const imgTotal = Object.keys(favs.images || {}).filter(k => k !== '_order').length;
                        const imgDiv = $el('div', {
                            textContent: animaTxt("🖼 图片") + (imgTotal ? ' (' + imgTotal + ')' : ''),
                            style: { padding: '8px 6px', cursor: 'pointer', color: activeCategory === 'images' ? 'var(--anima-ink-mid)' : 'var(--anima-ink-soft)', fontSize: '14px', fontWeight: 'bold', borderRadius: '4px', background: activeCategory === 'images' ? 'var(--anima-line)' : 'transparent', marginBottom: '2px', userSelect: 'none' },
                            oncontextmenu: (e) => {
                                e.preventDefault(); e.stopPropagation();
                                const inpRow = $el('div', { style: { display: 'flex', gap: '4px', padding: '3px 6px 3px 32px', alignItems: 'center' } });
                                const inp = $el('input', { type: 'text', placeholder: '新文件夹名称', style: { flex: 1, minWidth: '0', padding: '4px 6px', borderRadius: '3px', border: '1px solid #f87171', background: 'linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)', color: '#e0e0e0', fontSize: '12px', outline: 'none' } });
                                const okBtn = $el('button', { textContent: '✓', style: { padding: '3px 8px', flexShrink: '0', borderRadius: '3px', border: '1px solid rgba(var(--anima-line-soft-rgb),.42)', background: '#4caf50', color: '#fff', cursor: 'pointer', fontSize: '12px' }, onclick: () => { const name = inp.value.trim(); if (!name) return; fetch('/danbooru_anima/favorites/folder', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ action: 'create', category: 'images', name }) }).then(r => r.json()).then(d => { if (d.success) { _refreshPopupData(); } else alert('创建失败: ' + (d.error || '')); }); } });
                                const cancelBtn = $el('button', { textContent: '✕', style: { padding: '3px 8px', flexShrink: '0', borderRadius: '3px', border: '1px solid rgba(var(--anima-line-soft-rgb),.42)', background: 'rgba(var(--anima-input-rgb),.86)', color: 'var(--anima-ink-strong)', cursor: 'pointer', fontSize: '12px' }, onclick: () => { inpRow.remove(); } });
                                inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') okBtn.click(); if (ev.key === 'Escape') cancelBtn.click(); });
                                inpRow.append(inp, okBtn, cancelBtn);
                                imgDiv.after(inpRow);
                                setTimeout(() => { inp.focus(); inpRow.scrollIntoView({block: 'nearest'}); }, 50);
                            },
                            onclick: () => { activeCategory = 'images'; activeFolder = null; _favFilter = null; _favFacetCache = null; _renderContent(); _buildSidebar(); }
                        });
                        sidebar.appendChild(imgDiv);
                        _makeFolderItems(sidebar, 'images');
                    } else {
                        for (const { key, label } of _tagCats) {
                            const total = Object.keys(favs[key] || {}).filter(k => k !== '_order').length;
                            const catDiv = $el('div', {
                                textContent: label + (total ? ' (' + total + ')' : ''),
                                style: { padding: '6px 6px 6px 10px', cursor: 'pointer', color: activeCategory === key ? 'var(--anima-ink-mid)' : 'var(--anima-ink-soft)', fontSize: '13px', fontWeight: 'bold', borderRadius: '3px', background: activeCategory === key ? 'var(--anima-line)' : 'transparent', marginBottom: '1px', userSelect: 'none' },
                                onclick: () => { activeCategory = key; activeFolder = null; _tagPage = 1; _renderContent(); _buildSidebar(); }
                            });
                            sidebar.appendChild(catDiv);
                        }
                    }
                };
                const _renderContent = () => {
                    // 分页栏由图片/标签收藏各自按需显示
                    pagerBar.style.display = 'none';
                    pagerBar.innerHTML = '';
                    const catKey = activeCategory;
                    const items = favs[catKey] || {};
                    // 过滤：按文件夹
                    let keys;
                    if (activeFolder === null) {
                        keys = Object.keys(items);
                    } else if (activeFolder === '__uncat') {
                        keys = _getFolderKeys(catKey).uncategorized;
                    } else if (activeFolder === '__tmp') {
                        keys = (_folders[catKey]?.['__tmp'] || []);
                    } else {
                        keys = (_folders[catKey]?.[activeFolder] || []);
                    }
                    keys = keys.filter(k => k !== '_order');
                    if (!keys.length) {
                        _favViewKeys = [];
                        _favPanelItems = items;
                        _favPanelKeys = [];
                        const hint = activeFolder === '__uncat' ? '未分类' : (activeFolder || catKey);
                        contentArea.innerHTML = '<div style="text-align:center;color:var(--anima-ink-soft);padding:30px;font-size:13px;">暂无内容（' + hint + '）</div>';
                        return;
                    }
                    if (catKey === 'images') {
                        // 排序（asc=先添加在前，desc=后添加在前）
                        if (!_favSort) _favSort = 'desc';
                        // 用 _order 排序（文件夹视图也按收藏时间排）
                        const keySet = new Set(keys); const rawKeys = items._order ? [...new Set(items._order.filter(k => keySet.has(k)))] : keys;
                        const sortedKeys = _favSort === 'desc' ? [...rawKeys].reverse() : rawKeys;
                        const allCnt = keys.length;
                        const selCnt = _selectedImgs.size;
                        let html = '<div class="db-fav-head" style="position:sticky;top:0;z-index:40;isolation:isolate;background:linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%);margin-bottom:10px;">'
                            + '<div class="db-mode-bar" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 0 8px;border-bottom:1px solid var(--anima-line);">'
                            + '<span style="color:#f87171;font-size:13px;font-weight:bold;">☑ 多选</span>'
                            + '<button type="button" class="db-fav-filter-toggle" style="flex-shrink:0;position:relative;z-index:2;padding:4px 10px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:rgba(var(--anima-input-rgb),.86);color:var(--anima-ink-strong);cursor:pointer;font-size:11px;">筛选 ' + (_favFilterOpen ? '▴' : '▾') + '</button>'
                            + '<button class="db-img-sel-all" style="padding:4px 10px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:rgba(var(--anima-input-rgb),.86);color:var(--anima-ink-strong);cursor:pointer;font-size:11px;">' + (_favFilter ? '全选筛选' : '全选') + '</button>'
                            + '<button class="db-img-sel-none" style="padding:4px 10px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:rgba(var(--anima-input-rgb),.86);color:var(--anima-ink-strong);cursor:pointer;font-size:11px;">取消</button>'
                            + '<select class="db-fav-sort" style="padding:3px 6px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);color:var(--anima-ink-soft);font-size:11px;cursor:pointer;margin-left:4px;">'
                            + '<option value="asc"' + (_favSort === 'asc' ? ' selected' : '') + '>⬆ 最早</option>'
                            + '<option value="desc"' + (_favSort === 'desc' ? ' selected' : '') + '>⬇ 最新</option>'
                            + '</select>';
                        if (selCnt > 0) {
                            html += '<button class="db-img-export" style="padding:6px 16px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:#f87171;color:#fff;cursor:pointer;font-size:13px;font-weight:bold;">📤 输出 (' + selCnt + ')</button>';
                            html += '<button class="db-img-del-sel" style="padding:6px 16px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:#2a1616;color:#f87171;cursor:pointer;font-size:13px;font-weight:bold;">🗑 删除选中</button>';
                        }
                        html += '<button class="db-img-move-folder" style="padding:6px 16px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:var(--anima-line);color:var(--anima-ink-mid);cursor:pointer;font-size:13px;font-weight:bold;">📂 移动</button>';
                        html += '<span class="db-tool-item" style="margin-left:auto;display:flex;align-items:center;gap:4px;font-size:12px;color:var(--anima-ink-soft);">📂<input class="db-side-zoom" type="range" min="0.5" max="2" step="0.1" value="' + _favSideZoom + '" style="width:50px;cursor:pointer;"></span>';
                        html += '<span class="db-tool-item" style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--anima-ink-soft);">🖼<input id="db-zoom-slider" type="range" min="0.5" max="2" step="0.1" value="' + _favZoom + '" style="width:50px;cursor:pointer;"></span>';
                        html += '</div>';
                        html += _favFilterPanelHtml(items, sortedKeys);
                        html += '</div>';
                        const viewKeys = _favFilter ? sortedKeys.filter(function(k) { return _favItemMatch(items[k], _favFilter); }) : sortedKeys;
                        _favViewKeys = viewKeys;
                        let totalPages = 1;
                        if (!viewKeys.length) {
                            html += '<div style="text-align:center;color:var(--anima-ink-soft);padding:30px;font-size:13px;">无匹配项</div>';
                            pagerBar.style.display = 'none';
                            pagerBar.innerHTML = '';
                        } else {
                        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(' + Math.round(200*_favZoom) + 'px,1fr));gap:' + Math.round(12*_favZoom) + 'px;">';
                        totalPages = Math.ceil(viewKeys.length / IMGS_PER_PAGE); if (_imgPage > totalPages) _imgPage = totalPages || 1; const pagedKeys = viewKeys.slice((_imgPage - 1) * IMGS_PER_PAGE, _imgPage * IMGS_PER_PAGE); for (const key of pagedKeys) {
                            const item = items[key];
                            if (!item) continue; // 跳过幽灵占位
                            const parsed = _parseFavMeta(item.cn);
                            html += _buildFavImg(key, item.thumb || '', parsed.tags, _imgMode, parsed.large_url);
                        }
                        html += '</div>';
                        if (totalPages > 1) {
                            pagerBar.style.display = 'block';
                            pagerBar.innerHTML =
                                '<div style="display:flex;justify-content:center;gap:10px;align-items:center;padding:6px 0;">'
                                + '<button class="db-img-pg-prev" ' + (_imgPage <= 1 ? 'disabled style="opacity:0.3"' : '') + ' style="padding:4px 12px;border-radius:3px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);color:var(--anima-ink-mid);cursor:pointer;font-size:12px;">◀ 上一页</button>'
                                + '<span style="color:var(--anima-ink-soft);font-size:12px;display:flex;align-items:center;gap:4px;">第 <input class="db-fav-goto" type="number" min="1" max="' + totalPages + '" value="' + _imgPage + '" style="width:52px;padding:2px 4px;border-radius:3px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);color:var(--anima-ink-mid);font-size:12px;outline:none;"> / ' + totalPages + ' 页</span>'
                                + '<button class="db-fav-goto-btn" style="padding:4px 10px;border-radius:3px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:var(--anima-line);color:var(--anima-ink-mid);cursor:pointer;font-size:12px;">跳转</button>'
                                + '<button class="db-img-pg-next" ' + (_imgPage >= totalPages ? 'disabled style="opacity:0.3"' : '') + ' style="padding:4px 12px;border-radius:3px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);color:var(--anima-ink-mid);cursor:pointer;font-size:12px;">下一页 ▶</button>'
                                + '</div>';
                        } else {
                            pagerBar.style.display = 'none';
                            pagerBar.innerHTML = '';
                        }
                        }
                        _favPanelItems = items;
                        _favPanelKeys = sortedKeys;
                        contentArea.innerHTML = html;
                        if (_favFilterOpen) {
                            const _fsig = sortedKeys.join('\0');
                            if (!(_favFacetCache && _favFacetCache.sig === _fsig)) {
                                requestAnimationFrame(function() { _favFillFilterPanel(contentArea); });
                            }
                        }
                    // 缩放滑块实时生效
                    const _zs = contentArea.querySelector('#db-zoom-slider');
                    if (_zs) {
                        _zs.oninput = function() {
                            _favZoom = parseFloat(this.value);
                            localStorage.setItem('db_fav_zoom', _favZoom);
                        };
                        _zs.onchange = function() {
                            _favZoom = parseFloat(this.value);
                            localStorage.setItem('db_fav_zoom', _favZoom);
                            _renderContent();
                        };
                    }
                    const _ss = contentArea.querySelector('.db-side-zoom');
                    if (_ss) {
                        _ss.oninput = function() {
                            _favSideZoom = parseFloat(this.value);
                            localStorage.setItem('db_fav_side_zoom', _favSideZoom);
                        };
                        _ss.onchange = function() {
                            _favSideZoom = parseFloat(this.value);
                            localStorage.setItem('db_fav_side_zoom', _favSideZoom);
                            sidebar.style.width = (240*_favSideZoom)+'px';
                            sidebar.style.minWidth = (240*_favSideZoom)+'px';
                            sidebar.style.zoom = _favSideZoom;
                            _buildSidebar();
                            _renderContent();
                        };
                    }
                    } else {
                        const keySet = new Set(keys); const rawKeys = items._order ? [...new Set(items._order.filter(k => keySet.has(k)))] : keys;
                        const sortedKeys = (window.animaFavGrid && window.animaFavGrid.sortTagFavKeys)
                            ? window.animaFavGrid.sortTagFavKeys(rawKeys, items, _tagFavSort)
                            : (_tagFavSort === 'desc' ? [...rawKeys].reverse() : rawKeys);
                        const totalPages = Math.ceil(sortedKeys.length / IMGS_PER_PAGE);
                        if (_tagPage > totalPages) _tagPage = totalPages || 1;
                        if (_tagPage < 1) _tagPage = 1;
                        const pagedKeys = sortedKeys.slice((_tagPage - 1) * IMGS_PER_PAGE, _tagPage * IMGS_PER_PAGE);
                        let html = '<div class="db-mode-bar" style="position:sticky;top:0;z-index:10;background:linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%);display:flex;gap:8px;align-items:center;margin-bottom:10px;padding:6px 0 8px;border-bottom:1px solid var(--anima-line);">'
                            + '<span style="color:var(--anima-ink-mid);font-size:13px;font-weight:bold;">🏷 ' + sortedKeys.length + '</span>'
                            + '<select class="db-tag-fav-sort" style="padding:3px 6px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);color:var(--anima-ink-soft);font-size:11px;cursor:pointer;">'
                            + '<option value="rate"' + (_tagFavSort === 'rate' ? ' selected' : '') + '>⭐ 星级</option>'
                            + '<option value="desc"' + (_tagFavSort === 'desc' ? ' selected' : '') + '>⬇ 最新</option>'
                            + '<option value="asc"' + (_tagFavSort === 'asc' ? ' selected' : '') + '>⬆ 最早</option>'
                            + '</select></div>'
                            + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">';
                        for (const tag of pagedKeys) {
                            const item = items[tag];
                            const thumb = item?.thumb || '';
                            const cn = item?.cn || '';
                            const display = cn ? tag + ' (' + cn + ')' : tag;
                            const titleSet = item?.title || '';
                            html += '<div class="db-fav-card" data-tag="' + tag + '" data-cat="' + catKey + '" style="background:rgba(var(--anima-well-rgb),.16);border-radius:6px;overflow:hidden;border:1px solid rgba(255,255,255,.10);cursor:pointer;">';
                            if (thumb) {
                                html += '<div style="width:100%;aspect-ratio:16/9;overflow:hidden;background:rgba(var(--anima-well-rgb),.08);display:flex;align-items:center;justify-content:center;">'
                                    + '<img src="/danbooru_anima/image_proxy?url=' + encodeURIComponent(thumb) + '" style="max-width:100%;max-height:100%;object-fit:contain;" loading="lazy">'
                                    + '</div>';
                            } else {
                                html += '<div style="width:100%;aspect-ratio:16/9;background:rgba(var(--anima-well-rgb),.08);display:flex;align-items:center;justify-content:center;color:rgba(var(--anima-ink-chip-rgb),.78);font-size:16px;">🏷</div>';
                            }
                            html += '<div class="db-fav-name" data-tag="' + tag + '" data-cat="' + catKey + '" style="padding:6px 8px;font-size:13px;word-break:break-all;font-weight:bold;">';
                            if (titleSet) html += '<span style="color:#fbbf24;">' + titleSet + '</span><br><span style="color:var(--anima-ink);font-size:12px;font-weight:normal;">' + tag + (cn ? ' (' + cn + ')' : '') + '</span>';
                            else html += '<span style="color:var(--anima-ink);">' + display + '</span>';
                            html += '</div>';
                            html += '<div style="display:flex;gap:4px;padding:2px 6px 6px;">'
                                + '<button class="db-fav-title" data-tag="' + tag + '" data-cat="' + catKey + '" style="background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);color:#fbbf24;border:1px solid rgba(var(--anima-line-soft-rgb),.42);border-radius:4px;padding:4px 6px;cursor:pointer;font-size:12px;">✏️</button>'
                                + '<button class="db-fav-del" data-tag="' + tag + '" data-cat="' + catKey + '" style="flex:1;background:#2a1616;color:#f87171;border:1px solid rgba(var(--anima-line-soft-rgb),.42);border-radius:4px;padding:4px 8px;cursor:pointer;font-size:12px;">🗑 删除</button>'
                                + '<button class="db-fav-thumb" data-tag="' + tag + '" data-cat="' + catKey + '" style="flex:1;background:var(--anima-line);color:var(--anima-ink-mid);border:1px solid rgba(var(--anima-line-soft-rgb),.42);border-radius:4px;padding:4px 8px;cursor:pointer;font-size:12px;">🖼 换图</button>'
                                + '</div></div>';
                        }
                        html += '</div>';
                        if (totalPages > 1) {
                            pagerBar.style.display = 'block';
                            pagerBar.innerHTML =
                                '<div style="display:flex;justify-content:center;gap:10px;align-items:center;padding:6px 0;">'
                                + '<button class="db-img-pg-prev" ' + (_tagPage <= 1 ? 'disabled style="opacity:0.3"' : '') + ' style="padding:4px 12px;border-radius:3px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);color:var(--anima-ink-mid);cursor:pointer;font-size:12px;">◀ 上一页</button>'
                                + '<span style="color:var(--anima-ink-soft);font-size:12px;display:flex;align-items:center;gap:4px;">第 <input class="db-fav-goto" type="number" min="1" max="' + totalPages + '" value="' + _tagPage + '" style="width:52px;padding:2px 4px;border-radius:3px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);color:var(--anima-ink-mid);font-size:12px;outline:none;"> / ' + totalPages + ' 页</span>'
                                + '<button class="db-fav-goto-btn" style="padding:4px 10px;border-radius:3px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:var(--anima-line);color:var(--anima-ink-mid);cursor:pointer;font-size:12px;">跳转</button>'
                                + '<button class="db-img-pg-next" ' + (_tagPage >= totalPages ? 'disabled style="opacity:0.3"' : '') + ' style="padding:4px 12px;border-radius:3px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);color:var(--anima-ink-mid);cursor:pointer;font-size:12px;">下一页 ▶</button>'
                                + '</div>';
                        } else {
                            pagerBar.style.display = 'none';
                            pagerBar.innerHTML = '';
                        }
                        contentArea.innerHTML = html;
                        if (window.animaFavGrid && window.animaFavGrid.makeRateRow) {
                            var _rateCards = contentArea.querySelectorAll('.db-fav-card[data-tag]');
                            for (var _ri = 0; _ri < _rateCards.length; _ri++) {
                                (function (card) {
                                    var tag = card.getAttribute('data-tag') || '';
                                    var cat = card.getAttribute('data-cat') || catKey;
                                    var info = items[tag] || {};
                                    var row = window.animaFavGrid.makeRateRow(info.rating || 0, function (n) {
                                        window.animaFavGrid.rateFavorite('danbooru', tag, cat, n).then(function (d) {
                                            if (!d || !d.success) return;
                                            items[tag] = items[tag] || {};
                                            items[tag].rating = n;
                                            if (favs[cat] && favs[cat][tag]) favs[cat][tag].rating = n;
                                            _renderContent();
                                        });
                                    }, { center: true, size: 13 });
                                    row.style.padding = '0 8px 8px';
                                    card.appendChild(row);
                                })(_rateCards[_ri]);
                            }
                        }
                    }
                };
                // ── 拖拽支持 ──
                contentArea.addEventListener('dragstart', (e) => {
                    const card = e.target.closest('.db-fav-img');
                    if (!card) { e.preventDefault(); return; }
                    const postId = card.dataset.postid;
                    if (!postId) { e.preventDefault(); return; }
                    let ids;
                    if (_imgMode === 'multi' && _selectedImgs.size > 0) {
                        ids = [..._selectedImgs].map(String);
                    } else {
                        ids = [postId];
                    }
                    e.dataTransfer.setData('text/db-drag-ids', JSON.stringify(ids));
                    e.dataTransfer.effectAllowed = 'move';
                    card.style.opacity = '0.5';
                    e.dataTransfer.setDragImage(card, 30, 30);
                    setTimeout(() => { card.style.opacity = ''; }, 0);
                });
                const _refreshPopupData = async () => {
                    _favCache = null;
                    _favFacetCache = null;
                    favs = await _getFavs();
                    _folders = favs._folders || {};
                    _buildMainTabs();
                    _buildSidebar();
                    _renderContent();
                };
                window.__animaFavRefresh = window.__animaFavRefresh || {};
                window.__animaFavRefresh.danbooru = function () {
                    if (overlay.isConnected) _refreshPopupData();
                };
                _buildMainTabs();
                _buildSidebar();
                bodyRow.append(sidebar, contentArea);
                // 置顶分页栏（固定在弹窗顶部非滚动区，始终可见）
                const pagerBar = $el('div', { style: { padding: '0 12px', borderBottom: '1px solid rgba(255,255,255,.10)', background: 'rgba(var(--anima-bg-deep-rgb),.62)', flexShrink: 0, display: 'none' } });
                pagerBar.addEventListener('click', (e) => {
                    const pgPrev = e.target.closest('.db-img-pg-prev');
                    if (pgPrev && !pgPrev.disabled) { e.stopPropagation(); if (activeMain === 'tags') _tagPage--; else _imgPage--; _renderContent(); return; }
                    const pgNext = e.target.closest('.db-img-pg-next');
                    if (pgNext && !pgNext.disabled) { e.stopPropagation(); if (activeMain === 'tags') _tagPage++; else _imgPage++; _renderContent(); return; }
                    const gBtn = e.target.closest('.db-fav-goto-btn');
                    if (gBtn) { e.stopPropagation(); const inp = pagerBar.querySelector('.db-fav-goto'); _dbFavGotoInp(inp); }
                });
                pagerBar.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && e.target.closest('.db-fav-goto')) { e.preventDefault(); _dbFavGotoInp(e.target); }
                });
                const _dbFavGotoInp = (inp) => {
                    if (!inp) return;
                    const v = parseInt(inp.value, 10);
                    if (isNaN(v)) return;
                    const tps = Math.max(1, parseInt(inp.max, 10) || 1);
                    if (activeMain === 'tags') _tagPage = Math.min(Math.max(v, 1), tps);
                    else _imgPage = Math.min(Math.max(v, 1), tps);
                    _renderContent();
                };
                dialog.append(titleRow, mainTabBar, pagerBar, bodyRow);
                overlay.appendChild(dialog);
                document.body.appendChild(overlay);
                _renderContent();
                // ── 右键菜单（移动到文件夹） ──
                overlay.addEventListener('contextmenu', (e) => {
                    const fchip = e.target.closest('.db-fav-fchip');
                    if (fchip) {
                        const kind = fchip.getAttribute('data-kind');
                        if (kind === 'series' || kind === 'character') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (typeof window.animaFacetNoteEdit === 'function') {
                                const tag = fchip.getAttribute('data-tag') || '';
                                const cn = fchip.getAttribute('data-cn') || '';
                                window.animaFacetNoteEdit({
                                    kind: kind,
                                    tag: tag,
                                    fallback: cn ? (tag + ' ' + cn) : tag,
                                    onSaved: function() { _favRebuildFilterSections(contentArea); }
                                });
                            }
                        }
                        return;
                    }
                    const card = e.target.closest('.db-fav-card, .db-fav-img');
                    if (!card) return;
                    e.preventDefault();
                    e.stopPropagation();
                    // 获取选中项的 key 和 category
                    let itemKey, catKey;
                    if (card.classList.contains('db-fav-img')) {
                        itemKey = card.dataset.postid;
                        catKey = 'images';
                    } else {
                        itemKey = card.dataset.tag;
                        catKey = card.dataset.cat;
                    }
                    if (!catKey || !itemKey) return;
                    if (catKey !== 'images') return; // 只有图片支持文件夹
                    // 构建文件夹列表
                    const folders = _folders[catKey] || {};
                    const folderNames = _sortedFolderNames(catKey);
                    const picker = $el('div', {
                        style: {
                            position: 'fixed', left: e.clientX + 'px', top: e.clientY + 'px',
                            background: 'linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)', border: '1px solid rgba(var(--anima-line-soft-rgb),.42)', borderRadius: '6px',
                            padding: '4px', zIndex: 10001, minWidth: '160px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                        }
                    });
                    const addOpt = (label, folder) => {
                        const opt = $el('div', {
                            textContent: label,
                            style: { padding: '6px 12px', cursor: 'pointer', color: 'var(--anima-ink-soft)', fontSize: '13px', borderRadius: '4px' },
                            onmouseenter: () => { opt.style.background = 'var(--anima-line)'; },
                            onmouseleave: () => { opt.style.background = 'transparent'; },
                            onclick: async () => {
                                picker.remove();
                                if (folder === null) return; // 取消
                                if (folder === '__uncat') {
                                    await fetch('/danbooru_anima/favorites/folder', {
                                        method: 'POST', headers: {'Content-Type':'application/json'},
                                        body: JSON.stringify({ action: 'remove_from_all', category: catKey, item_keys: [itemKey] })
                                    });
                                } else {
                                    await fetch('/danbooru_anima/favorites/folder', {
                                        method: 'POST', headers: {'Content-Type':'application/json'},
                                        body: JSON.stringify({ action: 'move', category: catKey, item_keys: [itemKey], target_folder: folder })
                                    });
                                }
                                _refreshPopupData();
                            }
                        });
                        picker.appendChild(opt);
                    };
                    addOpt('📂 未分类', '__uncat');
                    for (const fname of folderNames) {
                        addOpt('📁 ' + fname, fname);
                    }
                    // 关闭
                    const closePicker = (ev) => { if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener('click', closePicker); } };
                    setTimeout(() => document.addEventListener('click', closePicker), 10);
                    document.body.appendChild(picker);
                });
                // 排序 change 事件委托
                contentArea.addEventListener('change', (e) => {
                    if (e.target.matches('.db-fav-sort')) { _favSort = e.target.value; _imgPage = 1; _tagPage = 1; _renderContent(); }
                    if (e.target.matches('.db-tag-fav-sort')) { _tagFavSort = e.target.value; try { localStorage.setItem('db_tag_fav_sort', _tagFavSort); } catch (eTs) {} _tagPage = 1; _renderContent(); }
                });
                contentArea.addEventListener('input', (e) => {
                    if (e.target.matches('.db-fav-filter-q-series')) { _favFilterQSeries = e.target.value; _favRebuildFilterSections(contentArea); }
                    else if (e.target.matches('.db-fav-filter-q-char')) { _favFilterQChar = e.target.value; _favRebuildFilterSections(contentArea); }
                });
                const _searchTag = (tag) => {
                    if (!tag) return;
                    overlay.remove();
                    if (_clsPopup) { _clsPopup.remove(); _clsPopup = null; }
                    searchInput.value = tag.replace(/ /g, '_');
                    if (_hotActive) { _hotActive = false; Object.assign(hotBtn.style, _DEF_STYLE); _currentForceTags = null; }
                    doSearch(1);
                };
                overlay.addEventListener('click', async (e) => {
                    const _el = (e.target && e.target.nodeType === 1) ? e.target : (e.target && e.target.parentElement);
                    if (!_el) return;
                    // 模式栏按钮 → 允许按钮功能但不穿透到下方图片
                    const _inModeBar = _el.closest('.db-fav-head, .db-mode-bar, .db-fav-sort, .db-tool-item, .db-fav-filter-panel');
                    if (_el.closest('.db-fav-filter-toggle')) {
                        e.stopPropagation();
                        _favToggleFilterPanel(contentArea, _renderContent);
                        return;
                    }
                    const fchip = _el.closest('.db-fav-fchip');
                    if (fchip) {
                        e.stopPropagation();
                        const kind = fchip.getAttribute('data-kind');
                        const tag = _favNormTag(fchip.getAttribute('data-tag'));
                        const curSer = _favActiveSeries();
                        if (kind === 'series') {
                            if (curSer && curSer === tag) _favFilter = null;
                            else _favFilter = { kind: 'series', tag: tag };
                        } else if (kind === 'character') {
                            if (curSer) {
                                if (_favFilter && _favFilter.kind === 'character' && _favNormTag(_favFilter.tag) === tag && _favNormTag(_favFilter.series || '') === curSer)
                                    _favFilter = { kind: 'series', tag: curSer };
                                else
                                    _favFilter = { kind: 'character', tag: tag, series: curSer };
                            } else if (_favFilter && _favFilter.kind === 'character' && !_favFilter.series && _favNormTag(_favFilter.tag) === tag) {
                                _favFilter = null;
                            } else {
                                _favFilter = { kind: 'character', tag: tag };
                            }
                        } else if (_favFilter && _favFilter.kind === kind && _favNormTag(_favFilter.tag) === tag) {
                            _favFilter = null;
                        } else {
                            _favFilter = { kind: kind, tag: tag };
                        }
                        _imgPage = 1;
                        _renderContent();
                        return;
                    }
                    if (_el.closest('.db-fav-filter-clear')) {
                        e.stopPropagation();
                        _favFilter = null;
                        _imgPage = 1;
                        _renderContent();
                        return;
                    }
                    if (_el.closest('.db-fav-filter-show-artist')) {
                        e.stopPropagation();
                        _favShowArtist = true;
                        const ab = _el.closest('.db-fav-filter-show-artist');
                        if (ab) ab.remove();
                        _favRebuildFilterSections(contentArea);
                        return;
                    }
                    // 全选
                    if (e.target.closest('.db-img-sel-all')) {
                        if (_favFilter && _favViewKeys.length) {
                            _favViewKeys.forEach(function(k) { _selectedImgs.add(String(k)); });
                        } else {
                            contentArea.querySelectorAll('.db-fav-img').forEach(el => {
                                const pid = el.dataset.postid;
                                if (pid) _selectedImgs.add(pid);
                            });
                        }
                        _renderContent();
                        return;
                    }

                    // 取消全选
                    if (e.target.closest('.db-img-sel-none')) {
                        _selectedImgs.clear();
                        _renderContent();
                        return;
                    }
                    // 模式栏/缩放条内的点击 → 不穿透到图片选中逻辑
                    if (_inModeBar && !_el.closest('button') && !_el.closest('.db-img-check')) return;
                    // 点击卡片 → 切换选中
                    const imgCard = e.target.closest('.db-fav-img');
                    if (imgCard && !e.target.closest('button') && !e.target.closest('.db-img-check') && !e.target.closest('.db-img-cls') && !e.target.closest('.db-img-large')) {
                        const postId = imgCard.dataset.postid;
                        if (_selectedImgs.has(postId)) {
                            _selectedImgs.delete(postId);
                        } else {
                            _selectedImgs.add(postId);
                        }
                        // 重新渲染显示状态
                        const items = favs.images || {};
                        const item = items[postId];
                        const meta = item?.cn || '{}';
                        let t = '', lu = '';
                        try { const p = JSON.parse(meta); t = p.tags || ''; lu = p.large_url || ''; } catch { t = meta; }
                        imgCard.outerHTML = _buildFavImg(postId, item?.thumb || '', t, _imgMode, lu);
                        _renderContent();
                        return;
                    }
                    // 复选框切换
                    const chk = e.target.closest('.db-img-check');
                    if (chk) {
                        e.stopPropagation();
                        const card = chk.closest('.db-fav-img');
                        if (!card) return;
                        const postId = card.dataset.postid;
                        if (_selectedImgs.has(postId)) {
                            _selectedImgs.delete(postId);
                            chk.textContent = '☐';
                            chk.style.color = 'var(--anima-ink-mid)';
                        } else {
                            _selectedImgs.add(postId);
                            chk.textContent = '☑';
                            chk.style.color = '#fbbf24';
                        }
                        const cnt = overlay.querySelector('.db-sel-cnt');
                        if (cnt) cnt.textContent = _selectedImgs.size;
                        return;
                    }
                    // 分页按钮（置顶栏 pagerBar 单独处理，此处不再响应）
const pgPrev = e.target.closest('.db-img-pg-prev');
if (pgPrev && !pgPrev.disabled) { if (activeMain === 'tags') _tagPage--; else _imgPage--; _renderContent(); return; }
const pgNext = e.target.closest('.db-img-pg-next');
if (pgNext && !pgNext.disabled) { if (activeMain === 'tags') _tagPage++; else _imgPage++; _renderContent(); return; }
                    // 🖼️ 查看大图按钮
                    const largeBtn = e.target.closest('.db-img-large');
                    if (largeBtn) {
                        e.stopPropagation();
                        const pid = largeBtn.dataset.postid;
                        const lUrl = largeBtn.dataset.largeurl || '';
                        const tUrl = largeBtn.dataset.thumb || '';
                        _showFavImageOverlay(lUrl, tUrl, pid);
                        return;
                    }
                    // 🔍 分类按钮
                    const clsBtn = e.target.closest('.db-img-cls');
                    if (clsBtn) {
                        e.stopPropagation();
                        const pid = clsBtn.dataset.postid;
                        const rect = clsBtn.getBoundingClientRect();
                        const showFavClsMini = (artists, chars, series) => {
                            const mini = document.createElement("div");
                            mini.className = "db-cls-mini";
                            mini.style.cssText = "position:fixed;z-index:100001;background:linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%);border-radius:6px;padding:8px;width:200px;max-height:200px;overflow-y:auto;box-shadow:0 4px 16px rgba(0,0,0,0.6);top:" + (rect.bottom + 4) + "px;left:" + rect.left + "px;";
                            [{ t: "🎨 画师", v: artists || [] }, { t: "👤 角色", v: chars || [] }, { t: "📺 系列", v: series || [] }].forEach(cat => {
                                if (!cat.v.length) return;
                                const hdr = document.createElement("div");
                                hdr.textContent = cat.t; hdr.style.cssText = "font-size:11px;font-weight:bold;color:var(--anima-ink-mid);margin-bottom:3px;";
                                mini.appendChild(hdr);
                                cat.v.forEach(tag => {
                                    const span = document.createElement("span");
                                    span.textContent = tag;
                                    span.style.cssText = "display:inline-block;margin:1px 3px;padding:1px 5px;border-radius:3px;font-size:10px;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);color:#e0e0e0;cursor:pointer;";
                                    span.onclick = (ev) => { ev.stopPropagation(); searchInput.value = tag.replace(/ /g, "_"); overlay.remove(); mini.remove(); if (typeof doSearch === "function") doSearch(1); };
                                    mini.appendChild(span);
                                });
                            });
                            if (!(artists || []).length && !(chars || []).length && !(series || []).length) mini.innerHTML = '<div style="color:var(--anima-ink-soft);font-size:11px;">暂无分类数据</div>';
                            document.body.appendChild(mini);
                            const closer = (ev) => { if (!mini.contains(ev.target)) { mini.remove(); document.removeEventListener("click", closer); } };
                            setTimeout(() => document.addEventListener("click", closer), 10);
                        };
                        const favItem = (favs.images || {})[pid];
                        const parsed = _parseFavMeta(favItem && favItem.cn);
                        if (Array.isArray(parsed.series) || Array.isArray(parsed.character) || Array.isArray(parsed.artist)) {
                            showFavClsMini(parsed.artist, parsed.character, parsed.series);
                            return;
                        }
                        clsBtn.textContent = "⏳"; fetch("/danbooru_anima/post/" + pid).then(r => r.json()).then(d => {
                            clsBtn.textContent = "🔍";
                            if (!d.success || !d.classified) return;
                            const g = d.classified;
                            showFavClsMini(g.artist || [], g.character || [], g.series || []);
                        }).catch(() => { clsBtn.textContent = "🔍"; });
                        return;
                    }
                    // 图片分类 → 导出选中（多选模式）
                    const expBtn = e.target.closest('.db-img-export');
                    if (expBtn && _imgMode === 'multi') {
                        if (_selectedImgs.size === 0) return;
                        overlay.remove();
                        const postList = [];
                        const items = favs.images || {};
                        for (const pid of _selectedImgs) {
                            const item = items[pid];
                            if (item) {
                                const meta = item?.cn || '{}';
                                var tagsStr = '', largeUrl = '';
                                try { const p = JSON.parse(meta); tagsStr = p.tags || ''; largeUrl = p.large_url || ''; } catch { tagsStr = meta; }
                                postList.push({
                                    id: Number(pid),
                                    preview_url: item.thumb || '',
                                    large_url: largeUrl,
                                    file_url: largeUrl,
                                    is_video: false,
                                    tags: tagsStr,
                                    rating: '',
                                    score: 0,
                                    width: 0, height: 0,
                                });
                            }
                        }
                        // 只渲染网格供浏览，不自动选中
                        if (selWidget) selWidget.value = "{}";
                        node.isChanged = true;
                        if (postList.length) renderGrid(postList);
                        _multiSelections.clear();
                        _selectedImgs.clear();
                        return;
                    }
                    // 多选 → 移动到文件夹
                    const moveBtn = e.target.closest('.db-img-move-folder');
                    if (moveBtn && _imgMode === 'multi') {
                        if (_selectedImgs.size === 0) return;
                        const folderNames = _sortedFolderNames('images');
                        const picker = $el('div', {
                            style: { position: 'fixed', left: (e.clientX || 400) + 'px', top: (e.clientY || 300) + 'px', background: 'linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)', border: '1px solid rgba(var(--anima-line-soft-rgb),.42)', borderRadius: '6px', padding: '4px', zIndex: 10001, minWidth: '200px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }
                        });
                        const pick = (label, target) => {
                            const opt = $el('div', {
                                textContent: label, style: { padding: '6px 12px', cursor: 'pointer', color: 'var(--anima-ink-soft)', fontSize: '13px', borderRadius: '4px' },
                                onmouseenter: () => { opt.style.background = 'var(--anima-line)'; },
                                onmouseleave: () => { opt.style.background = 'transparent'; },
                                onclick: async () => {
                                    picker.remove();
                                    const ids = [..._selectedImgs].map(String);
                                    await fetch('/danbooru_anima/favorites/folder', {
                                        method: 'POST', headers: {'Content-Type':'application/json'},
                                        body: target === null
                                            ? JSON.stringify({ action: 'remove_from_all', category: 'images', item_keys: ids })
                                            : JSON.stringify({ action: 'move', category: 'images', item_keys: ids, target_folder: target })
                                    });
                                    _refreshPopupData();
                                }
                            });
                            picker.appendChild(opt);
                        };
                        pick('📂 未分类 (解除)', null);
                        for (const f of folderNames) pick('📁 ' + f, f);
                        const closePicker = (ev) => { if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener('click', closePicker); } };
                        setTimeout(() => document.addEventListener('click', closePicker), 10);
                        document.body.appendChild(picker);
                        return;
                    }
                    // 批量删除选中
                    const delSelBtn = e.target.closest('.db-img-del-sel');
                    if (delSelBtn) {
                        if (!confirm(`确认删除选中的 ${_selectedImgs.size} 张图片？`)) return;
                        const ids = [..._selectedImgs];
                        const fileFolders = _favCache?._folders?.images;
                        for (const pid of ids) {
                            await fetch('/danbooru_anima/favorites/remove', {
                                method: 'POST', headers: {'Content-Type':'application/json'},
                                body: JSON.stringify({ tag: pid, category: 'images' })
                            });
                            if (_favCache?.images) {
                                delete _favCache.images[pid];
                                const o = _favCache.images._order;
                                if (o) { const idx = o.indexOf(pid); if (idx >= 0) o.splice(idx, 1); }
                            }
                            if (fileFolders) {
                                for (const fname of Object.keys(fileFolders)) {
                                    const arr = fileFolders[fname];
                                    const idx = arr.indexOf(pid);
                                    if (idx >= 0) arr.splice(idx, 1);
                                }
                            }
                        }
                        _selectedImgs.clear();
                        _refreshPopupData();
                        return;
                    }
                    // 单张删除
                    const imgDel = e.target.closest('.db-img-del');
                    if (imgDel) {
                        const postId = imgDel.dataset.postid;
                        if (!confirm('确认删除这张图片？')) return;
                        await fetch('/danbooru_anima/favorites/remove', {
                            method: 'POST', headers: {'Content-Type':'application/json'},
                            body: JSON.stringify({ tag: postId, category: 'images' })
                        });
                        if (_favCache?.images) {
                            delete _favCache.images[postId];
                            const o = _favCache.images._order;
                            if (o) { const idx = o.indexOf(postId); if (idx >= 0) o.splice(idx, 1); }
                        }
                        // 从所有文件夹中移除
                        const folders = _favCache?._folders?.images;
                        if (folders) {
                            for (const fname of Object.keys(folders)) {
                                const arr = folders[fname];
                                const idx = arr.indexOf(postId);
                                if (idx >= 0) arr.splice(idx, 1);
                            }
                        }
                        _renderContent();
                        return;
                    }
                    // ✏️ 修改标题（内联输入）
                    const titleBtn = e.target.closest('.db-fav-title');
                    if (titleBtn) {
                        const tag = titleBtn.dataset.tag;
                        const cat = titleBtn.dataset.cat;
                        const item = _favCache?.[cat]?.[tag];
                        const oldTitle = item?.title || '';
                        // 在 contentArea 顶部插入输入框
                        const inputRow = $el('div', { style: { padding: '8px 0', display: 'flex', gap: '8px', alignItems: 'center' } });
                        const inp = $el('input', {
                            type: 'text', value: oldTitle, placeholder: '自定义显示名（不修改搜索标签）',
                            style: { flex: 1, padding: '8px 12px', borderRadius: '4px', border: '1px solid rgba(var(--anima-line-soft-rgb),.42)', background: 'linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)', color: '#e0e0e0', fontSize: '14px', outline: 'none' }
                        });
                        const okBtn = $el('button', {
                            textContent: animaTxt("确定"), style: { padding: '8px 16px', borderRadius: '4px', border: '1px solid rgba(var(--anima-line-soft-rgb),.42)', background: 'var(--anima-ink-mid)', color: 'var(--anima-bg-deep)', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' },
                            onclick: async () => {
                                const cleanTitle = inp.value.trim();
                                await fetch('/danbooru_anima/favorites/add', {
                                    method: 'POST', headers: {'Content-Type':'application/json'},
                                    body: JSON.stringify({ tag, category: cat, thumb_url: item?.thumb || '', cn: item?.cn || '', title: cleanTitle })
                                });
                                if (_favCache?.[cat]?.[tag]) _favCache[cat][tag].title = cleanTitle;
                                inputRow.remove();
                                _renderContent();
                            }
                        });
                        const cancelBtn = $el('button', {
                            textContent: animaTxt("取消"), style: { padding: '8px 16px', borderRadius: '4px', border: '1px solid rgba(var(--anima-line-soft-rgb),.42)', background: 'linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)', color: 'var(--anima-ink)', cursor: 'pointer', fontSize: '13px' },
                            onclick: () => inputRow.remove()
                        });
                        inputRow.append(inp, okBtn, cancelBtn);
                        contentArea.prepend(inputRow);
                        inp.focus();
                        inp.select();
                        return;
                    }
                    // 点击卡片（缩略图区域）→ 搜索
                    const card = e.target.closest('.db-fav-card');
                    if (card && !e.target.closest('button')) {
                        const nameDiv = card.querySelector('.db-fav-name');
                        if (nameDiv) _searchTag(nameDiv.dataset.tag);
                        return;
                    }
                    // 点击标签名 → 搜索
                    const nameDiv = e.target.closest('.db-fav-name');
                    if (nameDiv) { _searchTag(nameDiv.dataset.tag); return; }
                    const delBtn = e.target.closest('.db-fav-del');
                    if (delBtn) {
                        const tag = delBtn.dataset.tag;
                        const cat = delBtn.dataset.cat;
                        await fetch('/danbooru_anima/favorites/remove', {
                            method: 'POST', headers: {'Content-Type':'application/json'},
                            body: JSON.stringify({ tag, category: cat })
                        });
                        if (_favCache?.[cat]) delete _favCache[cat][tag];
                        _renderContent();
                        return;
                    }
                    const thumbBtn = e.target.closest('.db-fav-thumb');
                    if (thumbBtn) {
                        const tag = thumbBtn.dataset.tag;
                        const cat = thumbBtn.dataset.cat;
                        var _rating = ["general"];
                        // 立即显示弹窗
                        const picker = $el('div', { style: { position: 'fixed', inset: 0, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 } });
                        const box = $el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', background: 'linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)', borderRadius: '8px', maxWidth: '640px', overflow: 'hidden' } });
                        const ratingBar = $el('div', { style: { display: 'flex', gap: '4px', padding: '8px 12px', borderBottom: '1px solid #4a4a55' } });
                        const ratings = [
                            {v: [], l: "🔘 全部"},
                            {v: ["general"], l: animaTxt("🟢 普通")},
                            {v: ["general","sensitive"], l: animaTxt("🟡 敏感")},
                            {v: ["general","sensitive","questionable"], l: "🟠 擦边"},
                            {v: ["general","sensitive","questionable","explicit"], l: "🔴 深度"},
                        ];
                        ratings.forEach(function(rt) {
                            var btn = $el('span', { textContent: rt.l, style: { padding: '3px 8px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', background: rt.v.join(',') === _rating.join(',') ? 'var(--anima-line)' : 'transparent', color: rt.v.join(',') === _rating.join(',') ? 'var(--anima-ink-mid)' : 'var(--anima-ink-soft)' }, onclick: function() {
                                _rating = rt.v;
                                ratingBar.querySelectorAll('span').forEach(function(b){b.style.background='transparent';b.style.color='var(--anima-ink-soft)';});
                                btn.style.background='var(--anima-line)';btn.style.color='var(--anima-ink-mid)';
                                grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--anima-ink-soft);padding:30px;">加载中...</div>';
                                doSearch(tag);
                            }});
                            ratingBar.appendChild(btn);
                        });
                        box.appendChild(ratingBar);
                        const grid = $el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '6px', padding: '16px', maxHeight: '500px', overflow: 'auto' } });
                        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--anima-ink-soft);padding:30px;">加载中...</div>';
                        box.appendChild(grid);
                        picker.appendChild(box); if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(box);
                        picker.onclick = (ev) => { if (ev.target === picker) picker.remove(); };
                        document.body.appendChild(picker);
                        async function doSearch(queryTag) { console.log('[THUMB] doSearch queryTag='+queryTag+' rating='+JSON.stringify(_rating));
                            try {
                                const r = await fetch('/danbooru_anima/search', {
                                    method: 'POST', headers: {'Content-Type':'application/json'},
                                    body: JSON.stringify({ tags: queryTag, page: 1, limit: 36, rating: _rating, order: "score" })
                                });
                                const d = await r.json();
                                grid.innerHTML = '';
                                if (d.success && d.posts?.length) {
                                for (const p of d.posts.slice(0, 36)) {
                                    const imgUrl = p.preview_url || p.large_url || '';
                                    const img = $el('img', {
                                        src: '/danbooru_anima/image_proxy?url=' + encodeURIComponent(imgUrl),
                                        style: { width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', border: '2px solid transparent' },
                                        onclick: async () => {
                                            await fetch('/danbooru_anima/favorites/update_thumb', {
                                                method: 'POST', headers: {'Content-Type':'application/json'},
                                                body: JSON.stringify({ tag, category: cat, thumb_url: imgUrl })
                                            });
                                            if (_favCache?.[cat]?.[tag]) _favCache[cat][tag].thumb = imgUrl;
                                            picker.remove();
                                            _renderContent();
                                        }
                                    });
                                    grid.appendChild(img);
                                }
                            }
                        } catch(e) { grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#f87171;padding:30px;">加载失败</div>'; }
                        return;
                    }
                    doSearch(tag);
                    }
                });
            } catch (err) {
                alert('⭐ 收藏夹错误: ' + (err?.message || err));
            }
            };
            const favBtn = $el('button', {
                textContent: '⭐', title: animaTxt("收藏夹"),
                style: { padding: '10px 14px', borderRadius: '6px', border: 'none', background: 'transparent', color: '#fbbf24', cursor: 'pointer', fontSize: '20px' }
            });
            favBtn.onclick = openFavPopup;
            // ── 分级过滤复选框（仿 D站画廊） ──
            const _activeRatings = new Set();
            const RATING_MAP = { "general": "普通", "sensitive": "敏感", "questionable": "可疑", "explicit": "深度" };
            const _ratAll = { checked: true };
            const ratingBar = $el("div", { style: { display: "flex", gap: "6px", alignItems: "center", fontSize: "16px" } });
            const allCb = $el("input", { type: "checkbox", checked: true, style: { margin: "0 2px 0 4px", cursor: "pointer" } });
            allCb.onchange = () => {
                _activeRatings.clear();
                _ratAll.checked = allCb.checked;
                for (const cb of ratingCbs) cb.checked = false;
                if (!_ratAll.checked && _activeRatings.size === 0) {
                    // 取消"所有"且未选具体分级 → 自动恢复"所有"
                    allCb.checked = true; _ratAll.checked = true;
                }
                doSearch(1);
                saveRatingState();
            };
            ratingBar.appendChild(allCb);
            ratingBar.appendChild($el("span", { textContent: "所有", style: { color: "#c9c9d1", cursor: "pointer" },
                onclick: () => { allCb.checked = !allCb.checked; allCb.onchange(); } }));
            const ratingCbs = [];
            for (const val of ["general", "sensitive", "questionable", "explicit"]) {
                const cb = $el("input", { type: "checkbox", checked: false, style: { margin: "0 2px 0 4px", cursor: "pointer" } });
                ratingCbs.push(cb);
                cb.onchange = () => {
                    _ratAll.checked = false; allCb.checked = false;
                    if (cb.checked) _activeRatings.add(val);
                    else _activeRatings.delete(val);
                    if (_activeRatings.size === 0) { _ratAll.checked = true; allCb.checked = true; }
                    doSearch(1);
                    saveRatingState();
                };
                ratingBar.appendChild(cb);
                const lbl = RATING_MAP[val];
                const clr = { "general": "#4caf50", "sensitive": "#6ee7b7", "questionable": "#fbbf24", "explicit": "#f87171" }[val];
                ratingBar.appendChild($el("span", { textContent: lbl, style: { color: clr, cursor: "pointer" },
                    onclick: () => { cb.checked = !cb.checked; cb.onchange(); } }));
            }

            // ── 模糊搜下拉 ──
            const acList = $el("div", {
                style: {
                    position: "absolute", top: "100%", left: "6px", right: "6px", zIndex: 1000,
                    display: "none", maxHeight: "240px", overflowY: "auto",
                    background: "linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)", border: "1px solid var(--anima-line)", borderRadius: "0 0 4px 4px",
                    fontSize: "12px",
                }
            });

            // ── 语义搜索启用弹窗（确认 + 进度） ──
            const _showInitDialog = (msg) => new Promise(resolve => {
                const mask = $el("div", { style: { position:"fixed",inset:0,zIndex:99999,background:"transparent",display:"flex",alignItems:"center",justifyContent:"center" } });
                const box = $el("div", { style: { background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",border:"1px solid var(--anima-line)",borderRadius:"12px",padding:"24px 28px",maxWidth:"400px",textAlign:"center",boxShadow:"0 8px 32px rgba(0,0,0,0.5)" } });
                const p = $el("p", { textContent: msg, style: { color:"var(--anima-mute)",fontSize:"13px",lineHeight:1.8,whiteSpace:"pre-wrap",marginBottom:"16px" } });
                const btnRow = $el("div", { style: { display:"flex",gap:"10px",justifyContent:"center" } });
                const noBtn = $el("button", { textContent:animaTxt("取消"), style: { padding:"8px 20px",borderRadius:"6px",border:"1px solid var(--anima-accent)",background:"transparent",color:"var(--anima-mute)",cursor:"pointer",fontSize:"13px" }, onclick: () => { mask.remove(); resolve(false); } });
                const yesBtn = $el("button", { textContent:"开始初始化", style: { padding:"8px 20px",borderRadius:"6px",border:"none",background:"linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi))",color:"#ffffff",cursor:"pointer",fontSize:"13px",fontWeight:"bold" }, onclick: () => { mask.remove(); resolve(true); } });
                btnRow.append(noBtn, yesBtn); box.append(p, btnRow); if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(box); mask.appendChild(box); document.body.appendChild(mask);
            });


            let _acPick = null;
            const _tokenAt = (input) => {
                const val = input.value || "";
                let caret = input.selectionStart;
                if (caret == null || caret < 0 || caret > val.length) caret = val.length;
                let start = caret;
                while (start > 0 && val.charAt(start - 1) !== " ") start--;
                let end = caret;
                while (end < val.length && val.charAt(end) !== " ") end++;
                return { q: val.slice(start, end), start: start, end: end };
            };
            const _applyAcPick = (tag) => {
                const name = String(tag || "").replace(/ /g, "_").trim();
                acList.style.display = "none";
                if (!name || name.charAt(0) === "\u23f3") return;
                const val = searchInput.value || "";
                const saved = _acPick;
                let start, end;
                if (saved && saved.q && val.slice(saved.start, saved.start + saved.q.length) === saved.q) {
                    start = saved.start;
                    end = saved.start + saved.q.length;
                    while (end < val.length && val.charAt(end) !== " ") end++;
                } else {
                    const live = _tokenAt(searchInput);
                    start = live.start;
                    end = live.end;
                }
                const before = val.slice(0, start);
                const after = val.slice(end);
                let next, pos;
                if (!after) {
                    next = before + name + " ";
                    pos = before.length + name.length + 1;
                } else {
                    next = before + name + after;
                    pos = before.length + name.length;
                }
                searchInput.value = next;
                try { searchInput.focus(); searchInput.setSelectionRange(pos, pos); } catch (e) {}
                if (_hotActive) { _hotActive = false; Object.assign(hotBtn.style, _DEF_STYLE); _currentForceTags = null; }
                doSearch(1);
            };
            const showAc = (items, loading, tokenQ) => {
                acList.innerHTML = "";
                if (loading) {
                    acList.innerHTML = '<div style="padding:8px;text-align:center;color:var(--anima-mute);font-size:16px;">⏳ 搜索中...</div>';
                    acList.style.display = "block"; return;
                }
                if (!items?.length) { acList.style.display = "none"; return; }
                const normalItems = items;
                for (const item of normalItems) {
                    const row = $el("div", {
                        style: { padding: "5px 8px", cursor: "pointer", borderBottom: "1px solid var(--anima-bg)", color: "#e0e0e0", display: "flex", justifyContent: "space-between", gap: "8px" },
                        onclick: () => { _applyAcPick(item.tag); },
                        onmouseover: () => { row.style.background = "var(--anima-line)"; },
                        onmouseout: () => { row.style.background = "transparent"; },
                    });
                    row.append(
                        $el("span", { textContent: item.cn ? `${item.cn} (${item.tag})` : item.tag }),
                        $el("span", { textContent: item.src || "", style: { color: "var(--anima-mute)", fontSize: "10px", flexShrink: 0 } })
                    );
                    acList.appendChild(row);
                }
                // "搜云端"按钮——本地结果少于 6 个时显示
                if (normalItems.length < 6) {
                    const _q = tokenQ || (_acPick && _acPick.q) || "";
                    const btn = $el("div", {
                        textContent: _semanticActive ? "🧠 语义搜索" : "☁️ 搜云端（语义匹配）",
                        style: { padding: "6px 8px", cursor: "pointer", textAlign: "center", color: "#ce93d8", fontSize: "11px", borderTop: "1px solid var(--anima-line)" },
                        onclick: async () => {
                            if (!_vecReady) {
                                const ok = await _ensureVecReady();
                                if (!ok) return;
                            }
                            btn.textContent = animaTxt("⏳ 搜索中...");
                            try {
                                let tags;
                                if (_semanticActive) {
                                    const r = await fetch("/danbooru_anima/vec_search", {
                                        method: "POST", headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ query: _q, top_k: 20 }),
                                    });
                                    const d = await r.json();
                                    tags = (d.tags || []).map(t => ({
                                        tag: t.name,
                                        cn: t.cn_name,
                                        src: `🧠 ${(t.score * 100).toFixed(0)}%`,
                                    }));
                                } else {
                                    const r = await fetch("/danbooru_anima/fuzzy_tags", {
                                        method: "POST", headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ query: _q, cloud: true }),
                                    });
                                    const d = await r.json();
                                    tags = d.tags || [];
                                }
                                acCache[_q] = tags;
                                showAc(tags, false, _q);
                            } catch { showAc(normalItems, false, _q); }
                        },
                        onmouseover: () => { btn.style.background = "var(--anima-line)"; },
                        onmouseout: () => { btn.style.background = "transparent"; },
                    });
                    acList.appendChild(btn);
                }
                acList.style.display = "block";
            };

            // ── 输入即模糊搜索（空格后的当前词，前面的标签保留）──
            let _searchTimer = null;
            let _acSeq = 0;
            searchInput.oninput = () => {
                const tok = _tokenAt(searchInput);
                if (!tok.q) { clearTimeout(_searchTimer); acList.style.display = "none"; return; }
                const seq = ++_acSeq;
                clearTimeout(_searchTimer);
                _searchTimer = setTimeout(async () => {
                    const now = _tokenAt(searchInput);
                    if (seq !== _acSeq || !now.q || now.q !== tok.q || now.start !== tok.start) return;
                    _acPick = now;
                    const q = now.q;
                    if (!_semanticActive && acCache[q]) { showAc(acCache[q], false, q); return; }
                    const loadingTimer = setTimeout(() => { if (seq === _acSeq) showAc(null, true, q); }, 200);
                    try {
                        let tags;
                        if (_semanticActive) {
                            if (!_vecReady) {
                                const ok = await _ensureVecReady();
                                if (!ok) { clearTimeout(loadingTimer); if (seq === _acSeq) showAc([]); return; }
                            }
                            const r = await fetch("/danbooru_anima/vec_search", {
                                method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ query: q, top_k: 15 }),
                            });
                            const d = await r.json();
                            if (d.error && !d.tags?.length) {
                                tags = [{ tag: "⏳ " + d.error, cn: "", src: "" }];
                            } else {
                                tags = (d.tags || []).map(t => ({
                                    tag: t.name,
                                    cn: t.cn_name || "",
                                    src: `🧠 ${(t.score * 100).toFixed(0)}%`,
                                }));
                            }
                        } else {
                            const r = await fetch("/danbooru_anima/fuzzy_tags", {
                                method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ query: q }),
                            });
                            const d = await r.json();
                            tags = d.tags || [];
                        }
                        clearTimeout(loadingTimer);
                        if (seq !== _acSeq) return;
                        if (!_semanticActive) acCache[q] = tags;
                        showAc(tags, false, q);
                    } catch { clearTimeout(loadingTimer); if (seq === _acSeq) showAc([]); }
                }, 100);
            };
            searchInput.onkeydown = (e) => {
                if (e.key === "Enter") {
                    clearTimeout(_searchTimer);
                    const q = searchInput.value.trim();
                    if (!q) return;
                    if (_hotActive) { _hotActive = false; Object.assign(hotBtn.style, _DEF_STYLE); _currentForceTags = null; }
                    doSearch(1);
                }
                if (e.key === "Escape") acList.style.display = "none";
            };

            // 点击其他地方关闭下拉（全局单例，防每节点累积）
            if (!window._dbAcCloseInstalled) {
                window._dbAcCloseInstalled = true;
                document.addEventListener("click", (e) => {
                    (window._dbAcCloseFns || []).forEach(_fn => { try { _fn(e); } catch(err) {} });
                });
            }
            if (!window._dbAcCloseFns) window._dbAcCloseFns = [];
            const _acCloseFn = (e) => {
                if (!searchBar.contains(e.target)) acList.style.display = "none";
            };
            window._dbAcCloseFns.push(_acCloseFn);
            node._dbAcCloseFn = _acCloseFn;
            // ── ☆ 收藏按钮事件委托（覆盖 TAGS 弹窗；全局单例，防每节点累积） ──
            if (!window._dbFavClickInstalled) {
                window._dbFavClickInstalled = true;
                document.addEventListener("click", async (e) => {
                    const _fn = window._dbFavClickFn;
                    if (_fn) { try { await _fn(e); } catch(err) {} }
                });
            }
            window._dbFavClickFn = async (e) => {
                const star = e.target.closest(".db-fav-star");
                if (!star) return;
                e.stopPropagation();
                const tag = star.dataset.tag;
                const cat = star.dataset.cat;
                // 缩略图：优先用 _lastThumbUrl，其次 overlay 上的 data-thumbUrl
                let thumbUrl = _lastThumbUrl || (document.querySelector('.db-tag-overlay-content')?.dataset?.thumbUrl) || '';
                _lastThumbUrl = '';  // 用完清空
                star.textContent = "⏳";
                const cn = tagTranslations[tag] || _globalTagTranslations[tag] || '';
                const result = await _toggleFav(tag, cat, thumbUrl, cn);
                star.textContent = result === 'added' ? '★' : '☆';
                star.style.color = result === 'added' ? '#fbbf24' : 'var(--anima-mute)';
                star.title = result === 'added' ? '取消收藏' : '收藏';
            };

// ── 排序栏 ──
            let _sortOrder = localStorage.getItem("db_sort") || "id:desc";
            const sortBar = $el("div", { className: "db-sortbar", style: { display: "none", gap: "6px", padding: "6px 10px", background: "linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)", borderBottom: "1px solid var(--anima-line)", flexShrink: 0 } });
            var _sortBtns = {};
            function _updateSort() {
                Object.keys(_sortBtns).forEach(function(k){var b=_sortBtns[k];b.style.background=k===_sortOrder?"var(--anima-line)":"transparent";b.style.color=k===_sortOrder?"var(--anima-accent-soft)":"var(--anima-mute)";});
                localStorage.setItem("db_sort", _sortOrder);
            }
            [{v:"id:desc",l:animaTxt("🕐 时间")},{v:"score",l:animaTxt("⭐ 评分")}].forEach(function(s){
                var sb=$el("span",{textContent:s.l,style:{padding:"6px 16px",borderRadius:"8px",fontSize:"14px",cursor:"pointer",fontWeight:"bold",color:s.v===_sortOrder?"var(--anima-accent-soft)":"var(--anima-mute)",background:s.v===_sortOrder?"var(--anima-line)":"transparent"},onclick:function(){_sortOrder=s.v;_updateSort();doSearch(1);}});
                _sortBtns[s.v]=sb;sortBar.appendChild(sb);
            });
            _updateSort();
            // ── 多选 / 融合切换按钮（始终可见）──
            const multiToggle = $el("span",{textContent:animaTxt("☐多选"),style:{padding:"6px 14px",borderRadius:"8px",cursor:"pointer",fontSize:"13px",background:"linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)",color:"var(--anima-mute)",userSelect:"none"},
                onclick:function(){_multiEnabled=!_multiEnabled;multiToggle.textContent=_multiEnabled?"☑多选(开)":"☐多选";if(_multiEnabled){_tagFusionEnabled=false;fusionToggle.textContent=animaTxt("🔀分序号");fusionBar.style.display="none";clearMultiSel();}else{clearMultiSel();}toggleMultiCbs(_multiEnabled);saveNodeSettings();}});
            const fusionToggle = $el("span",{textContent:animaTxt("🔀分序号"),style:{padding:"6px 14px",borderRadius:"8px",cursor:"pointer",fontSize:"13px",background:"linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)",color:"var(--anima-mute)",userSelect:"none",marginLeft:"4px"},
                onclick:function(){_tagFusionEnabled=!_tagFusionEnabled;fusionToggle.textContent=_tagFusionEnabled?animaTxt("🔀融合(开)"):animaTxt("🔀分序号");if(_tagFusionEnabled){_multiEnabled=false;multiToggle.textContent=animaTxt("☐多选");toggleMultiCbs(false);clearMultiSel();_fusionSlots={1:new Set(),2:new Set(),3:new Set()};_fusionActiveSlot=1;}else{_fusionSlots={1:new Set(),2:new Set(),3:new Set()};if(typeof writeFusionWidget==='function')writeFusionWidget();if(typeof refreshFusionBar==='function')refreshFusionBar();}clearMultiSel();fusionBar.style.display=_tagFusionEnabled?"flex":"none";updateSlotBtnStyles();saveNodeSettings();}});
            sortBar.appendChild(multiToggle);
            sortBar.appendChild(fusionToggle);
            // 确保 sortBar 始终可见（包含排序 + 切换按钮）
            sortBar.style.display = "flex";
            sortBar.style.flexWrap = "wrap";
            // 按钮状态稍后由节点初始化时设置
            const refreshBtn = $el("button", { textContent: "🔄", title: "强制刷新（绕过缓存，加载最新图片）", style: { padding: "5px 14px", borderRadius: "10px", border: "1px solid rgba(var(--anima-accent-rgb),0.4)", background: "transparent", color: "var(--anima-accent-soft)", cursor: "pointer", fontSize: "15px" }, onclick: async () => { _endReached = false; clearTimeout(_searchTimer); searchInput.value = ""; _currentForceTags = null; refreshBtn.textContent = "⟳"; refreshBtn.style.pointerEvents = "none"; try { await doSearch(1, null, false, true); } catch(e) {} refreshBtn.textContent = "🔄"; refreshBtn.style.pointerEvents = ""; _showRefreshToast(); } });
            // 刷新完成提示
            let _refreshToastTimer = null;
            const _showRefreshToast = () => {
                let _t = document.getElementById("db-refresh-toast");
                if (!_t) {
                    _t = document.createElement("div");
                    _t.id = "db-refresh-toast";
                    _t.textContent = animaTxt("✅ 已强制刷新最新图片");
                    _t.style.cssText = "position:absolute;top:8px;right:8px;z-index:50;background:linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%);border:1px solid rgba(var(--anima-accent-rgb),0.4);color:var(--anima-accent-soft);padding:6px 14px;border-radius:8px;font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,0.4);opacity:0;transition:opacity .2s;pointer-events:none;";
                    container.appendChild(_t);
                }
                _t.style.opacity = "1";
                clearTimeout(_refreshToastTimer);
                _refreshToastTimer = setTimeout(() => { _t.style.opacity = "0"; }, 2200);
            };
            let _bookmarkBeforeId = 0;
            let _bookmarkMark = false;
            const _applyDbRating = (ratingStr) => {
                const vals = ["general", "sensitive", "questionable", "explicit"];
                const parts = String(ratingStr || "").split(",").map(function(s){ return s.trim(); }).filter(Boolean);
                _activeRatings.clear();
                for (var _ri = 0; _ri < ratingCbs.length; _ri++) ratingCbs[_ri].checked = false;
                if (!parts.length) { _ratAll.checked = true; allCb.checked = true; return; }
                _ratAll.checked = false; allCb.checked = false;
                parts.forEach(function(p) {
                    var i = vals.indexOf(p);
                    if (i >= 0) { ratingCbs[i].checked = true; _activeRatings.add(p); }
                });
                if (_activeRatings.size === 0) { _ratAll.checked = true; allCb.checked = true; }
            };
            const _openDbBookmark = (bm) => {
                searchInput.value = String((bm && bm.tags) || "");
                _applyDbRating(bm && bm.rating);
                if (_hotActive) { _hotActive = false; try { Object.assign(hotBtn.style, _DEF_STYLE); } catch (eH) {} }
                _currentForceTags = null;
                _sortOrder = "id:desc";
                try { _updateSort(); } catch (eS) {}
                _endReached = false;
                _onTail = false;
                var pid = Number(bm && bm.postId);
                _bookmarkBeforeId = pid > 0 ? (pid + 1) : 0;
                _bookmarkMark = true;
                doSearch(1);
            };
            const bmBtn = $el("button", {
                textContent: "🔖", title: animaTxt("书签"),
                style: { padding: "10px 12px", borderRadius: "6px", border: "none", background: "transparent", color: "var(--anima-accent-soft)", cursor: "pointer", fontSize: "18px" }
            });
            bmBtn.onclick = function() { if (window.animaBm) window.animaBm.show("danbooru", _openDbBookmark); };
            searchBar.append(searchInput, acList, searchBtn, refreshBtn, hotBtn, semBtn, bmBtn, favBtn, ratingBar);
            // 排序栏插入到搜索栏下方
            // 等 DOM 挂载后插入排序栏
            setTimeout(function(){if(searchBar.parentNode)searchBar.parentNode.insertBefore(sortBar, searchBar.nextSibling);}, 100);
            container.appendChild(searchBar);

            // ═══════════ 顶部信息栏（放在搜索栏和网格之间，永远可见） ═══════════
            const infoBar = $el("div", {
                style: { display: "block", background: "var(--anima-line)", borderBottom: "1px solid var(--anima-bg)", flexShrink: 0, padding: "4px 8px", color: "#e0e0e0", fontSize: "10px", lineHeight: "1.5", maxHeight: "60px", overflow: "auto" }
            });
            infoBar.style.display = "none";  // 提示文字已移除，仅在多选/状态时显示
            container.appendChild(infoBar);

            // ═══════════ 分页工具条（按钮在顶部，不用到底部去翻页） ═══════════
            const pageToolbar = $el("div", {
                style: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "6px", padding: "4px 8px", background: "linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)", borderBottom: "1px solid var(--anima-line)", flexShrink: 0 }
            });
            const pageStatus = $el("span", { textContent: "", style: { color: "#a0a0a0", fontSize: "13px", marginRight: "auto" } });
            const _setPageStatus = (page) => {
                const p = String(page || currentPage || 1);
                pageStatus.textContent = _totalPages
                    ? (animaTxt("第") + p + " / " + _totalPages + animaTxt("页"))
                    : (animaTxt("第") + p + animaTxt("页"));
            };
            // ── 页码指示器（地藏画廊同款）：滚动时找视口内第一张可见卡片，显示其所属页 ──
            let _pageScrollTimer = null;
            const _updatePageIndicator = () => {
                try {
                    const _gr = gridContainer.getBoundingClientRect();
                    const _first = Array.from(gridContainer.querySelectorAll(".db-img-card")).find(ch => {
                        const _r = ch.getBoundingClientRect();
                        return _r.bottom > _gr.top && _r.top < _gr.bottom;
                    });
                    if (_first && _first.dataset.galleryPage) {
                        _setPageStatus(_first.dataset.galleryPage);
                    }
                } catch(e) {}
            };
            // prevBtn/nextBtn 在底栏中定义，稍后移入 pageToolbar

            // ═══════════ 标签弹窗（毛玻璃覆盖网格中间） ═══════════
            const overlay = $el("div.anima-full-mask", {
                style: {
                    position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: 9999,
                    display: "none", justifyContent: "center", alignItems: "center",
                    background: "transparent", backdropFilter: "none",
                    WebkitBackdropFilter: "none", transition: "opacity 0.25s",
                    pointerEvents: "none",
                },
                onclick: (e) => { if (e.target === overlay) hideOverlay(); }
            });
            overlay.setAttribute("data-anima-open", "0");
            const overlayContent = $el("div", {
                style: {
                    background: "rgba(26,26,46,0.92)", border: "1px solid var(--anima-line)",
                    borderRadius: "10px", padding: "16px", margin: "20px",
                    maxWidth: "90%", maxHeight: "70%", overflow: "auto",
                    color: "#e0e0e0", fontSize: "13px", lineHeight: "1.7",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                }
            });
            overlay.appendChild(overlayContent);
            if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(overlayContent);
            document.body.appendChild(overlay);
            // 🔍 搜索按钮事件委派（绑定在本节点 overlayContent 上，闭包引用本节点，随 DOM 销毁；修复"第一个节点删除后搜索失效"）
            overlayContent.onclick = (e) => {
                const srch = e.target.closest(".db-tag-srch");
                if (!srch) return;
                e.stopPropagation();
                const tag = srch.dataset.tag;
                searchInput.value = tag.replace(/ /g, '_');
                if (_clsPopup) { _clsPopup.remove(); _clsPopup = null; }
                if (_hotActive) { _hotActive = false; Object.assign(hotBtn.style, _DEF_STYLE); _currentForceTags = null; }
                doSearch(1);
            };
            const showOverlay = (html) => {
                overlayContent.classList.add("db-tag-overlay-content");
                overlayContent.innerHTML = html;
                overlay.setAttribute("data-anima-open", "1");
                overlay.style.pointerEvents = "auto";
                overlay.style.display = "flex";
                overlay.style.opacity = "1";
                // 同步缩略图 URL 到 overlay 上，供 ☆ 收藏用
                if (_lastThumbUrl) overlayContent.dataset.thumbUrl = _lastThumbUrl;
                // 大图区：查看原图 / 保存
                const _bigOpen = overlayContent.querySelector(".db-tag-big-open");
                if (_bigOpen) {
                    _bigOpen.onclick = () => { window.open(_lastPostUrl || "https://danbooru.donmai.us/", "_blank"); };
                }
                const _bigOrig = overlayContent.querySelector(".db-tag-big-orig");
                if (_bigOrig) {
                    const _bigImg = overlayContent.querySelector("#db-tag-bigimg");
                    // 大图点击放大/还原
                    if (_bigImg) {
                        _bigImg.onclick = () => {
                            _bigImg.style.maxHeight = _bigImg.style.maxHeight === "none" ? "320px" : "none";
                            _bigImg.style.cursor = _bigImg.style.maxHeight === "none" ? "zoom-out" : "zoom-in";
                        };
                    }
                    _bigOrig.onclick = () => {
                        if (_bigImg && _bigImg.dataset.orig === "1") { _bigImg.src = "/danbooru_anima/image_proxy?url=" + encodeURIComponent(_lastThumbUrl || ""); _bigImg.dataset.orig = "0"; _bigOrig.textContent = animaTxt("📥 查看原图"); }
                        else if (_bigImg) { _bigImg.dataset.orig = "1"; _bigImg.src = "/danbooru_anima/image_proxy?url=" + encodeURIComponent(_lastOrigUrl || _lastThumbUrl || ""); _bigOrig.textContent = animaTxt("↩ 返回预览"); }
                    };
                }
                const _bigSave = overlayContent.querySelector(".db-tag-big-save");
                if (_bigSave) {
                    _bigSave.onclick = async () => {
                        try {
                            const _u = (_lastIsVideo ? (_lastThumbUrl || "") : (_lastOrigUrl || _lastThumbUrl || ""));
                            const r = await fetch("/danbooru_anima/image_proxy?url=" + encodeURIComponent(_u));
                            const b = await r.blob();
                            const a = document.createElement("a");
                            a.href = URL.createObjectURL(b);
                            a.download = "danbooru_" + (_u.split("/").pop() || "image.jpg");
                            document.body.appendChild(a); a.click();
                            URL.revokeObjectURL(a.href);
                        } catch(ex) { alert("保存失败: " + ex.message); }
                    };
                }
            };
            const hideOverlay = () => {
                overlay.setAttribute("data-anima-open", "0");
                overlay.style.pointerEvents = "none";
                overlay.style.opacity = "0";
                overlay.style.display = "none";
            };
            const showTagOverlay = async (postId) => {
                if (!_favCache) _getFavs();  // 预加载收藏状态
                showOverlay("<div style='text-align:center;color:var(--anima-mute);'>⏳ 加载标签中...</div>");
                const cached = tagCache[postId];
                if (cached) {
                    tagTranslations = tagTranslationCache[postId] || {};
                    Object.assign(tagTranslations, _globalTagTranslations);
                    showOverlay(buildTagHtml(cached));
                    return;
                }
                try {
                    const resp = await fetch(`/danbooru_anima/post/${postId}`);
                    const data = await resp.json();
                    if (data.success && data.classified) {
                        tagCache[postId] = data.classified;
                        tagTranslations = data.translations || {};
                        if (data.translations) Object.assign(_globalTagTranslations, data.translations);
                        const tCount = Object.keys(tagTranslations).length;
                        const info = tCount > 0 ? `<div style="text-align:center;color:#34d399;font-size:12px;margin-top:6px;">✅ 已翻译 ${tCount} 个标签</div>` : '';
                        showOverlay(buildTagHtml(data.classified) + info);
                    } else {
                        showOverlay("<div style='text-align:center;color:#f87171;'>加载标签失败</div>");
                    }
                } catch {
                    showOverlay("<div style='text-align:center;color:#f87171;'>网络错误</div>");
                }
            };

            // ── 分序号按钮栏 ──
            const fusionBar = $el("div", { className: "db-fusionbar", style: { display: "none", padding: "8px 12px", borderBottom: "1px solid var(--anima-line)", flexShrink: 0, alignItems: "center", gap: "10px", flexWrap: "wrap" } });
            const fusionHdr = $el("span", { textContent: "分序号", style: { color: "#f87171", fontSize: "14px", fontWeight: "bold", marginRight: "4px" } });
            fusionBar.appendChild(fusionHdr);
            const fusionBtns = {};
            const slotInfo = { 1: { label: "质量·计数·通用", color: "#6ee7b7" }, 2: { label: "角色·系列", color: "#f87171" }, 3: { label: animaTxt("画师"), color: "var(--anima-accent-sky)" } };
            function mkSlotBtn(n) {
                const b = $el("button", {
                    textContent: n + " " + slotInfo[n].label,
                    style: { padding: "8px 18px", borderRadius: "6px", border: "2px solid " + slotInfo[n].color, cursor: "pointer", fontSize: "14px", fontWeight: "bold", background: n === _fusionActiveSlot ? slotInfo[n].color : "var(--anima-bg-deep)", color: n === _fusionActiveSlot ? "#fff" : slotInfo[n].color }
                });
                b.onclick = () => {
                    if (n === 2 && _sync12) _sync12 = false; // 手动点 2 号关闭同步
                    _fusionActiveSlot = n;
                    updateSlotBtnStyles();
                };
                return b;
            }
            function updateSlotBtnStyles() {
                for (const [k, v] of Object.entries(fusionBtns)) {
                    const n = Number(k);
                    const active = n === _fusionActiveSlot;
                    v.style.background = active ? slotInfo[n].color : "var(--anima-bg-deep)";
                    v.style.color = active ? "#fff" : slotInfo[n].color;
                }
                if (_syncBtn) _syncBtn.style.background = _sync12 ? "var(--anima-accent-soft)" : "transparent";
            }
            const b1 = mkSlotBtn(1); fusionBtns[1] = b1; fusionBar.appendChild(b1);
            const _syncBtn = $el("button", { textContent: "🔗", title: "2号同步1号", style: { padding: "8px 10px", borderRadius: "6px", border: "2px solid var(--anima-accent-soft)", cursor: "pointer", fontSize: "14px", background: "transparent", color: "var(--anima-accent-soft)" } });
            _syncBtn.onclick = () => {
                _sync12 = !_sync12;
                if (_sync12) {
                    // 2号清空，同步成1号
                    _fusionSlots[2].clear();
                    for (const id of _fusionSlots[1]) _fusionSlots[2].add(id);
                    // 只更新 1/2 号涉及的卡片角标，不碰 3 号和其他卡
                    const slotBg = { 1: "#6ee7b7", 2: "#f87171", 3: "var(--anima-accent-sky)" };
                    const affected = new Set();
                    for (const id of _fusionSlots[1]) affected.add(id);
                    for (const id of _fusionSlots[2]) affected.add(id);
                    for (const pid of affected) {
                        const card = gridContainer.querySelector(`[data-postid="${pid}"]`) || gridContainer.querySelector(`[data-postid="${Number(pid)}"]`);
                        if (!card) continue;
                        // 重建这张卡的角标
                        let badge = card.querySelector(".db-fusion-badge");
                        const has1 = _fusionSlots[1].has(pid);
                        const has2 = _fusionSlots[2].has(pid);
                        const slots = [];
                        if (has1) slots.push(1);
                        if (has2) slots.push(2);
                        // 检查3号
                        if (_fusionSlots[3].has(pid)) slots.push(3);
                        if (slots.length === 0) {
                            if (badge) badge.remove();
                            card.style.border = "2px solid transparent";
                            const ov = card.querySelector(".db-sel-overlay");
                            if (ov) ov.style.display = "none";
                        } else {
                            if (!badge) {
                                badge = $el("div", { className: "db-fusion-badge", style: { position: "absolute", bottom: "4px", left: "4px", zIndex: 6, display: "flex", gap: "3px" } });
                                card.appendChild(badge);
                            }
                            badge.style.display = "flex";
                            badge.innerHTML = slots.map(n => `<span style="display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;border-radius:50%;background:${slotBg[n]};color:var(--anima-bg-deep);font-size:11px;font-weight:bold;">${n}</span>`).join("");
                            const lastS = slots[slots.length - 1];
                            card.style.border = "2px solid " + (slotBg[lastS] || "var(--anima-accent-soft)");
                            let ov = card.querySelector(".db-sel-overlay");
                            if (!ov) { ov = $el("div", { className: "db-sel-overlay", style: { position: "absolute", inset: 0, pointerEvents: "none", borderRadius: "3px" } }); card.appendChild(ov); }
                            ov.style.display = "block";
                            if (slots.length === 1) {
                                const colors = { 1: "rgba(var(--anima-accent-rgb),0.15)", 2: "rgba(248,113,113,0.15)", 3: "rgba(var(--anima-sky-rgb),0.15)" };
                                ov.style.background = colors[slots[0]] || "rgba(255,255,255,0.06)";
                            } else {
                                ov.style.background = "rgba(255,255,255,0.06)";
                            }
                        }
                    }
                    _fusionActiveSlot = 1;
                }
                updateSlotBtnStyles();
                refreshFusionBar();
            };
            fusionBar.appendChild(_syncBtn);
            const b2 = mkSlotBtn(2); fusionBtns[2] = b2; fusionBar.appendChild(b2);
            const b3 = mkSlotBtn(3); fusionBtns[3] = b3; fusionBar.appendChild(b3);
            // 各序号计数
            const fusionClearBtn = $el("button", { textContent: "✕ 清空当前", style: { padding: "8px 14px", borderRadius: "6px", border: "1px solid var(--anima-accent)", background: "transparent", color: "var(--anima-mute)", cursor: "pointer", fontSize: "13px", marginLeft: "8px" } });
            const fusionClearAllBtn = $el("button", { textContent: "✕✕ 清空全部", style: { padding: "8px 14px", borderRadius: "6px", border: "1px solid #f87171", background: "transparent", color: "#f87171", cursor: "pointer", fontSize: "13px" } });
            fusionClearAllBtn.onclick = () => {
                for (const n of [1, 2, 3]) _fusionSlots[n].clear();
                gridContainer.querySelectorAll(".db-fusion-badge").forEach(b => b.remove());
                gridContainer.querySelectorAll(".db-sel-overlay").forEach(o => o.style.display = "none");
                gridContainer.querySelectorAll("[style*='border']").forEach(c => { if (c.style && c.style.border && c.style.border !== "none") c.style.border = ""; });
                refreshFusionBar();
            };
            fusionClearBtn.onclick = () => {
                const slot = _fusionActiveSlot;
                _fusionSlots[slot].clear();
                // 只清除当前序号的卡片标记，不影响其他序号
                const slotBg = { 1: "#6ee7b7", 2: "#f87171", 3: "var(--anima-accent-sky)" };
                const selOverlay = { 1: "rgba(var(--anima-accent-rgb),0.15)", 2: "rgba(248,113,113,0.15)", 3: "rgba(var(--anima-sky-rgb),0.15)" };
                gridContainer.querySelectorAll(".db-fusion-badge").forEach(badge => {
                    const spans = badge.querySelectorAll("span");
                    let found = false;
                    spans.forEach(sp => {
                        if (sp.textContent.trim() === String(slot)) {
                            sp.remove();
                            found = true;
                        }
                    });
                    if (found) {
                        const card = badge.parentElement;
                        // 还有别的序号吗？
                        const remaining = badge.querySelectorAll("span");
                        if (remaining.length === 0) {
                            badge.remove();
                            if (card) {
                                card.querySelectorAll(".db-sel-overlay").forEach(o => o.style.display = "none");
                                if (card.style) card.style.border = "2px solid transparent";
                            }
                        } else {
                            // 更新边框颜色为最后一个序号的颜色
                            const lastIdx = remaining[remaining.length - 1].textContent.trim();
                            if (card && card.style) {
                                card.style.border = "2px solid " + (slotBg[lastIdx] || "var(--anima-accent-soft)");
                                const ov = card.querySelector(".db-sel-overlay");
                                if (ov) { ov.style.background = selOverlay[lastIdx] || "rgba(255,255,255,0.06)"; ov.style.display = "block"; }
                            }
                        }
                    }
                });
                refreshFusionBar();
            };
            const fusionCnt = { 1: $el("span", { style: { color: "var(--anima-mute)", fontSize: "10px", marginLeft: "4px" } }), 2: null, 3: null };

            function writeFusionWidget() {
                if (!fusionWidget) return;
                const data = {};
                for (const n of [1, 2, 3]) {
                    if (_fusionSlots[n].size > 0) data[n] = [..._fusionSlots[n]].map(Number);
                }
                fusionWidget.value = JSON.stringify(data);
                node.isChanged = true;
            }

            function refreshFusionBar() {
                const show = _tagFusionEnabled;
                fusionBar.style.display = show ? "flex" : "none";
                if (!show) return;
                const slen1 = _fusionSlots[1].size;
                const slen2 = _fusionSlots[2].size;
                const slen3 = _fusionSlots[3].size;
                const _sc = { 1: "#6ee7b7", 2: "#f87171", 3: "var(--anima-accent-sky)" };
                fusionCnt[1].innerHTML = `<span style="color:${_sc[1]};font-size:14px;font-weight:bold;">1号:${slen1}</span> <span style="color:var(--anima-accent);">|</span> <span style="color:${_sc[2]};font-size:14px;font-weight:bold;">2号:${slen2}</span> <span style="color:var(--anima-accent);">|</span> <span style="color:${_sc[3]};font-size:14px;font-weight:bold;">3号:${slen3}</span>`;
                // 计数只append一次
                if (!fusionCnt[1].parentNode) fusionBar.appendChild(fusionCnt[1]);
                if (!fusionClearBtn.parentNode) fusionBar.appendChild(fusionClearBtn);
                if (!fusionClearAllBtn.parentNode) fusionBar.appendChild(fusionClearAllBtn);
                writeFusionWidget();
            }
            // 初始化工具栏按钮状态（融合工具栏已创建完毕）
            if (_tagFusionEnabled) { fusionToggle.textContent = animaTxt("🔀融合(开)"); fusionBar.style.display = "flex"; updateSlotBtnStyles(); }
            if (_multiEnabled) { multiToggle.textContent = animaTxt("☑多选(开)"); toggleMultiCbs(true); }
            try { if (typeof node._animaSyncPortsChrome === "function") node._animaSyncPortsChrome(); } catch (e) {}

            // ═══════════ 图片网格 ═══════════
            let _endReached = false;
            const _calcColWidth = () => {
                const w = gridContainer.clientWidth || 600;
                const cols = Math.max(2, Math.floor((w + 6) / (150 + 6)));
                return (w - 6 * (cols - 1)) / cols;
            };
            const gridContainer = $el("div", {
                style: { flex: "1 1 auto", overflowY: "auto", padding: "6px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(150px, 100%), 1fr))", gridAutoRows: "10px", gap: "6px", alignContent: "start", minHeight: "200px", minWidth: "0" }
            });
            // ── 无限加载：滚动接近底部自动加载下一页 ──
            // 采用地藏画廊的"前方缓冲张数"机制：ahead = 已加载总张数 - 已看张数 < 40 才加载
            // （不用像素判断：图片占位/加载中高度异常时像素法会疯狂触发）
            const _DB_BUFFER = 40;
            const _dbIO = new IntersectionObserver((entries) => {
                for (const _en of entries) {
                    if (!_en.isIntersecting) continue;
                    const _im = _en.target;
                    const _hd = _im && _im.dataset ? _im.dataset.hd : "";
                    if (window.__animaGalleryPtrDown) continue;
                    if (_hd && _im.getAttribute("src") !== _hd) { _im.src = _hd; }
                    _dbIO.unobserve(_im);
                }
            }, { root: gridContainer, rootMargin: "200px 0px", threshold: 0.01 });
            // ── DOM 滑动窗口回收（学 D站画廊成熟方案）──
            // 保留最近 ~100 页(4200张)，超出后从最老端回收，"浏览多少回收多少"。
            // 保护视口锚点 + 选中卡片，回收后补偿滚动位置，防止视口跳动。
            const _MAX_DB_KEPT = 4200; // ~105 页 @ 40/页
            const _recycleDbItems = () => {
                try {
                    if (window.__animaGalleryPtrDown) return;
                    const _children = gridContainer.children;
                    const _overflow = _children.length - _MAX_DB_KEPT;
                    if (_overflow <= 0) return;

                    // 记录回收前视口顶端的锚点元素，用于事后补偿滚动
                    const _gridTop = gridContainer.getBoundingClientRect().top;
                    let _anchorEl = null, _anchorOffset = 0;
                    for (const _c of _children) {
                        const _r = _c.getBoundingClientRect();
                        if (_r.bottom - _gridTop > 0) {
                            _anchorEl = _c;
                            _anchorOffset = _r.top - _gridTop;
                            break;
                        }
                    }

                    let _removed = 0;
                    // 从最老端逐个回收：遇到视口锚点或选中卡即停（保护视口内容与用户选择）
                    while (_removed < _overflow) {
                        const _el = gridContainer.firstElementChild;
                        if (!_el || _el === _anchorEl) break;
                        // 保护选中卡片（多选 _multiSelections / 单选 selectedPostId）
                        const _pid = _el._postId;
                        if (_pid !== undefined && ((_multiSelections && _multiSelections.has(_pid)) || selectedPostId === _pid)) break;
                        // 先 unobserve 图片，再移除
                        try {
                            _el.querySelectorAll("img").forEach(_im2 => { try { if (_dbIO) _dbIO.unobserve(_im2); } catch(e){} });
                        } catch(e) {}
                        gridContainer.removeChild(_el);
                        _removed++;
                    }
                    if (_removed <= 0) return;

                    // 补偿滚动位置：回收后用锚点重新定位，避免视口跳动
                    if (_anchorEl && _anchorEl.isConnected) {
                        const _newTop = _anchorEl.getBoundingClientRect().top - gridContainer.getBoundingClientRect().top;
                        gridContainer.scrollTop += (_newTop - _anchorOffset);
                    }
                } catch(e) {}
            };
            const _loadMore = () => {
                if (isLoading || _endReached) return;
                const _total = gridContainer.querySelectorAll(".db-img-card").length;
                if (_total === 0) return;
                const _sh = gridContainer.scrollHeight || 1;
                const _ratio = Math.min(1, (gridContainer.scrollTop + gridContainer.clientHeight) / _sh);
                const _viewed = Math.floor(_total * _ratio);
                const _ahead = _total - _viewed;
                if (_ahead < _DB_BUFFER) {
                    isLoading = true;
                    doSearch(currentPage + 1, null, true);
                }
            };
            gridContainer.addEventListener("scroll", () => {
                try { _loadMore(); } catch(e) {}
                clearTimeout(_pageScrollTimer);
                _pageScrollTimer = setTimeout(_updatePageIndicator, 150);
            });
            // 轮询兜底：内容不足或滚动过快时自动补货（地藏画廊机制）
            // 页面隐藏时暂停（对齐地藏画廊：后台不加载，切回不卡）
            let _dbPollTimer = null;
            const _dbStartPoll = () => {
                if (_dbPollTimer) return;
                _dbPollTimer = setInterval(() => {
                    if (document.hidden) return;
                    try { _loadMore(); } catch(e) {}
                }, 2000);
            };
            const _dbStopPoll = () => {
                if (_dbPollTimer) { clearInterval(_dbPollTimer); _dbPollTimer = null; }
            };
            _dbStartPoll();
            // 节点删除时清理轮询（防累积泄漏）
            if (!node._dbPollCleaned) {
                node._dbPollCleaned = true;
                node.onRemoved = node.onRemoved || function() {
                    if (typeof _dbStopPoll === "function") _dbStopPoll();
                    try { if (node._dbAdexTimer) clearInterval(node._dbAdexTimer); } catch(e) {}
                    // 从全局 visibilitychange 注册表移除（防累积）
                    try {
                        const _list = window._dbVisPollers || [];
                        const _ix = _list.indexOf(node._dbVisEntry);
                        if (_ix >= 0) _list.splice(_ix, 1);
                    } catch(e) {}
                    // 从全局 acList 关闭注册表移除（防累积）
                    try {
                        const _list2 = window._dbAcCloseFns || [];
                        const _ix2 = _list2.indexOf(node._dbAcCloseFn);
                        if (_ix2 >= 0) _list2.splice(_ix2, 1);
                    } catch(e) {}
                };
            }
            // visibilitychange 全局单例：页面隐藏/恢复时统一启停所有节点的轮询（只注册一次，防每节点累积）
            if (!window._dbVisPollers) window._dbVisPollers = [];
            if (!window._dbVisHandlerInstalled) {
                window._dbVisHandlerInstalled = true;
                document.addEventListener("visibilitychange", () => {
                    const _hidden = document.hidden;
                    (window._dbVisPollers || []).forEach(_en => {
                        try { _hidden ? _en.stop() : _en.start(); } catch(e) {}
                    });
                });
            }
            node._dbVisEntry = { start: _dbStartPoll, stop: _dbStopPoll };
            window._dbVisPollers.push(node._dbVisEntry);
            container.appendChild(fusionBar);
            container.appendChild(pageToolbar);
            container.appendChild(gridContainer);

            // ═══════════ 底栏 ═══════════
            const footer = $el("div", {
                style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: "linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)", borderTop: "1px solid var(--anima-line)", color: "#a0a0a0", fontSize: "11px", flexShrink: 0 }
            });
            const pageInfo = $el("span", { textContent: animaTxt("就绪"), style: { fontSize: "16px" } });
            const prevBtn = $el("button", { textContent: "◀", title: animaTxt("上一页"), style: { padding: "3px 9px", borderRadius: "6px", border: "none", background: "transparent", color: "var(--anima-mute)", cursor: "pointer", fontSize: "15px" }, disabled: true });
            prevBtn.onmouseenter = () => { prevBtn.style.color = "#e0e0e0"; prevBtn.style.background = "rgba(255,255,255,0.06)"; };
            prevBtn.onmouseleave = () => { prevBtn.style.color = "var(--anima-mute)"; prevBtn.style.background = "transparent"; };
            const nextBtn = $el("button", { textContent: "▶", title: animaTxt("下一页"), style: { padding: "3px 9px", borderRadius: "6px", border: "none", background: "transparent", color: "var(--anima-mute)", cursor: "pointer", fontSize: "15px" }, disabled: true });
            nextBtn.onmouseenter = () => { nextBtn.style.color = "#e0e0e0"; nextBtn.style.background = "rgba(255,255,255,0.06)"; };
            nextBtn.onmouseleave = () => { nextBtn.style.color = "var(--anima-mute)"; nextBtn.style.background = "transparent"; };
            // 把翻页按钮移入顶部工具条 + 页码跳转
            const jumpInput = $el("input", { type: "number", min: 1, placeholder: "页码", style: { width: "52px", padding: "5px 6px", borderRadius: "4px", border: "1px solid var(--anima-line)", background: "linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)", color: "#e0e0e0", fontSize: "12px", outline: "none" } });
            const jumpBtn = $el("button", { textContent: animaTxt("跳页"), style: { padding: "5px 10px", borderRadius: "4px", border: "1px solid rgba(var(--anima-accent-rgb),0.4)", background: "transparent", color: "var(--anima-accent-soft)", cursor: "pointer", fontSize: "12px" } });
            const lastBtn = $el("button", { textContent: animaTxt("尾页"), title: animaTxt("跳到最后一页"), style: { padding: "5px 10px", borderRadius: "4px", border: "1px solid rgba(var(--anima-accent-rgb),0.4)", background: "transparent", color: "var(--anima-accent-soft)", cursor: "pointer", fontSize: "12px" } });
            jumpInput.onkeydown = (e) => { if (e.key === "Enter") jumpBtn.onclick(); };
            pageToolbar.append(pageStatus, jumpInput, jumpBtn, lastBtn, prevBtn, nextBtn);
            // ── 过滤设置图标 ──
            let blacklistCurrent = "";
            let _excludeImgTags = localStorage.getItem("db_exclude_img_tags") || "";
            const settingsBtn = $el("button", {
                textContent: "⚙️", title: "过滤设置",
                style: { padding: "5px 10px", borderRadius: "4px", border: "none", background: "linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)", color: "var(--anima-mute)", cursor: "pointer", fontSize: "16px", lineHeight: "1.2" }
            });
            let _origResCheck = null;
            settingsBtn.onclick = () => {
                const overlay = $el("div", { style: { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 } });
                const dialog = $el("div", { style: { background: "linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)", borderRadius: "8px", padding: "28px", minWidth: "640px", maxWidth: "700px", border: "1px solid var(--anima-line)", boxShadow: "0 4px 20px rgba(0,0,0,0.5)" } });
                const title = $el("div", { textContent: "⚙️ 设置", style: { fontSize: "16px", fontWeight: "bold", color: "#e0e0e0", marginBottom: "14px" } });

                // 过滤标签
                const blLabel = $el("div", { textContent: "输出过滤标签", style: { fontSize: "12px", color: "var(--anima-mute)", marginBottom: "4px" } });
                const desc = $el("div", { textContent: "逗号/空格分隔，输出的 tag 中不会含这些标签，图片正常显示。", style: { fontSize: "11px", color: "var(--anima-accent)", marginBottom: "6px" } });
                const ta = $el("textarea", { style: { width: "100%", height: "80px", padding: "8px", borderRadius: "4px", border: "1px solid var(--anima-line)", background: "linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)", color: "#e0e0e0", fontSize: "13px", resize: "vertical", boxSizing: "border-box" } });
                // ── 黑名单模糊搜索辅助（文本框下方） ──
                const blInput = $el("input", {
                    type: "text", placeholder: "🔍 搜标签添加到过滤名单（中/英都行）",
                    style: { width: "100%", padding: "8px 10px", marginTop: "6px", borderRadius: "4px", border: "1px solid var(--anima-line)", background: "linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)", color: "#e0e0e0", fontSize: "13px", boxSizing: "border-box", outline: "none" }
                });
                const blList = $el("div", { style: { display: "none", position: "relative", maxHeight: "150px", overflow: "auto", background: "linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)", border: "1px solid var(--anima-line)", borderRadius: "4px", marginTop: "2px" } });
                let _blTimer = null;
                blInput.oninput = () => {
                    clearTimeout(_blTimer);
                    const q = blInput.value.trim();
                    if (!q || q.length < 1) { blList.style.display = "none"; return; }
                    _blTimer = setTimeout(async () => {
                        try {
                            const r = await fetch("/danbooru_anima/fuzzy_tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
                            const d = await r.json();
                            blList.innerHTML = "";
                            const items = d.tags || [];
                            if (!items.length) { blList.style.display = "none"; return; }
                            for (const item of items) {
                                const row = $el("div", {
                                    textContent: item.cn ? `${item.tag} (${item.cn})` : item.tag,
                                    style: { padding: "6px 10px", cursor: "pointer", color: "var(--anima-mute)", fontSize: "12px", borderBottom: "1px solid var(--anima-line)" },
                                    onmouseover: () => row.style.background = "var(--anima-bg)",
                                    onmouseout: () => row.style.background = "transparent",
                                    onclick: () => {
                                        const existing = ta.value.trim();
                                        ta.value = existing ? existing + ", " + item.tag : item.tag;
                                        blList.style.display = "none";
                                        blInput.value = "";
                                    }
                                });
                                blList.appendChild(row);
                            }
                            blList.style.display = "block";
                        } catch { blList.style.display = "none"; }
                    }, 200);
                };
                // 点击弹窗内其他位置关闭 blList（绑定到 dialog，随弹窗销毁，不再泄漏到 document）
                dialog.addEventListener("click", (e) => { if (blList.style.display !== "none" && !blInput.contains(e.target) && !blList.contains(e.target)) blList.style.display = "none"; });

                // 原图输出开关
                const orRow = $el("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginTop: "12px", padding: "8px 0", borderTop: "1px solid var(--anima-line)" } });
                const orCheck = $el("input", { type: "checkbox", style: { width: "16px", height: "16px", cursor: "pointer", accentColor: "var(--anima-accent-soft)" } });
                const orLabel = $el("label", { textContent: "原图输出（关闭则使用 sample 尺寸，加载更快）", style: { fontSize: "13px", color: "#e0e0e0", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" } });
                orLabel.prepend(orCheck);
                orRow.appendChild(orLabel);
                _origResCheck = orCheck;

                // ── 多选模式设置 ──
                const clearFusionWidget = () => {
                    if (fusionWidget) { fusionWidget.value = ""; node.isChanged = true; }
                };

                // 从 node_settings 加载节点独立设置（多选、原图输出）
                try {
                    const ns = JSON.parse(nodeSettingsWidget?.value || "{}");
                    // 恢复多选、原图
                    orCheck.checked = ns.original_resolution ?? false;
                } catch {}
                fetch('/danbooru_anima/settings').then(r => r.json()).then(d => {
                    if (d.success) {
                        ta.value = d.settings?.blacklist_tags || "";
                        blacklistCurrent = d.settings?.blacklist_tags || "";
// 深度翻译设置已移除
                    }
                }).catch(() => {});

                const btnRow = $el("div", { style: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" } });
                // ── 图片排除输入 ──
                const exclRow = $el("div", { style: { marginTop: "12px" } });
                exclRow.innerHTML = '<div style="color:#f87171;font-size:12px;font-weight:bold;margin-bottom:4px;">⊘ 排除图片（含这些 tag 的图片不显示）</div>';
                const exclInput = $el("input", { type: "text", placeholder: "furry, ugly, bad...", value: _excludeImgTags,
                    style: { width: "100%", padding: "6px 8px", border: "1px solid var(--anima-line)", borderRadius: "4px", background: "linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)", color: "#e0e0e0", fontSize: "13px", outline: "none", boxSizing: "border-box" }
                });
                exclRow.appendChild(exclInput);
                dialog.appendChild(exclRow);

                const cancelBtn = $el("button", { textContent: animaTxt("取消"), style: { padding: "6px 16px", borderRadius: "4px", border: "1px solid var(--anima-accent)", background: "linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)", color: "#c9c9d1", cursor: "pointer", fontSize: "13px" } });
                cancelBtn.onclick = () => overlay.remove();
                const saveBtn = $el("button", { textContent: animaTxt("保存"), style: { padding: "6px 16px", borderRadius: "4px", border: "none", background: "linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi))", color: "#ffffff", cursor: "pointer", fontSize: "13px", fontWeight: "bold" } });
                saveBtn.onclick = async () => {
                    // 先关弹窗
                    overlay.remove();
                    // 节点独立设置 → 写入 node_settings widget
                    const ri = () => { pageInfo.textContent = animaTxt("就绪"); infoBar.style.display = "none"; };
                    const rmFusionDOM = () => { gridContainer.querySelectorAll(".db-fusion-badge").forEach(b => b.remove()); };
                    const rmMultiDOM = () => { 
                        gridContainer.querySelectorAll(".db-multi-cb").forEach(cb => { cb.textContent = "☐"; cb.style.display = "none"; });
                        gridContainer.querySelectorAll(".db-sel-overlay").forEach(o => o.style.display = "none");
                        gridContainer.querySelectorAll("[style*='border']").forEach(c => { if (c.style && c.style.border && c.style.border !== "none") c.style.border = ""; });
                    };
                    // 三选一（先清所有残留框再设新模式；融合模式由排序栏 🔀 按钮控制）
                    rmMultiDOM(); rmFusionDOM();
                    if (_multiEnabled) {
                        _multiEnabled = true; _tagFusionEnabled = false;
                        _fusionSlots = { 1: new Set(), 2: new Set(), 3: new Set() };
                        clearFusionWidget();
                        toggleMultiCbs(true);
                        ri(); refreshFusionBar();
                    } else {
                        _multiEnabled = false; _tagFusionEnabled = false;
                        _multiSelections.clear(); _fusionSlots = { 1: new Set(), 2: new Set(), 3: new Set() };
                        if (selWidget) selWidget.value = "{}";
                        clearFusionWidget();
                        toggleMultiCbs(false);
                        ri(); refreshFusionBar();
                    }
                    saveNodeSettings();
                    // 全局设置 → POST 到后端（后台发，不影响关闭）
                    try {
                        const resp = await fetch('/danbooru_anima/settings', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                blacklist_tags: ta.value.trim(),
// 深度翻译设置已移除
                            })
                        });
                        const d = await resp.json();
                        if (d.success) {
                            blacklistCurrent = ta.value.trim();
                            _excludeImgTags = exclInput.value.trim();
                            localStorage.setItem("db_exclude_img_tags", _excludeImgTags);
                            toggleMultiCbs(_multiEnabled);
                            // 先刷新 widget 再清空（否则已选列表空了）
                            if (_multiEnabled && _multiSelections.size > 0) {
                                const sels = [..._multiSelections].map(id => {
                                    const p = postById(id);
                                    return p ? postSnap(p) : { post_id: Number(id) };
                                });
                                const pl = JSON.stringify({ selections: sels, merge: _multiMerge, image_connected: imageConnected() });
                                if (selWidget) selWidget.value = pl;
                                node.isChanged = true;
                            }
                            if (!_multiEnabled) _multiSelections.clear();
                            overlay.remove();
                        }
                    } catch {}
                };
                const buildTableBtn = $el("button", { textContent: "📊 生成完整分类表", title: "从 D 站 API 拉取全部 tag group，补充 tag_groups.json", style: { padding: "5px 10px", borderRadius: "4px", border: "1px solid #34d399", background: "linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)", color: "#34d399", cursor: "pointer", fontSize: "12px", marginRight: "4px" } });
                buildTableBtn.onclick = async () => {
                    buildTableBtn.textContent = animaTxt("⏳ 启动中...");
                    buildTableBtn.disabled = true;
                    await fetch("/danbooru_anima/build_tag_table");
                    const pi = setInterval(async () => {
                        try {
                            const pr = await fetch("/danbooru_anima/build_tag_table_progress");
                            const pd = await pr.json();
                            if (pd.result) {
                                clearInterval(pi);
                                const d = pd.result;
                                if (d.success) buildTableBtn.textContent = `✅ 新增 ${d['新增']} 条，共 ${d['总数']} 条`;
                                else buildTableBtn.textContent = "❌ " + (d.error || "失败");
                                buildTableBtn.disabled = false;
                            } else {
                                buildTableBtn.textContent = `⏳ ${pd.done_groups}/${pd.total_groups} ${pd.current}`;
                            }
                        } catch {}
                    }, 500);
                };
                const refreshBtn = $el("button", { textContent: animaTxt("🔄 更新中文索引"), title: animaTxt("从 D 站画廊同步最新中文数据"), style: { padding: "5px 10px", borderRadius: "4px", border: "1px solid var(--anima-line)", background: "linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)", color: "#e0e0e0", cursor: "pointer", fontSize: "12px", marginRight: "auto" } });
                refreshBtn.onclick = async () => {
                    refreshBtn.textContent = animaTxt("⏳ 更新中...");
                    refreshBtn.disabled = true;
                    try {
                        const r = await fetch('/danbooru_anima/refresh_index');
                        const d = await r.json();
                        if (d.success) refreshBtn.textContent = `✅ ${d.entries} 词条 · ${d.tags} 标签`;
                        else refreshBtn.textContent = animaTxt("❌ 更新失败");
                    } catch { refreshBtn.textContent = animaTxt("❌ 更新失败"); }
                    setTimeout(() => { refreshBtn.textContent = animaTxt("🔄 更新中文索引"); refreshBtn.disabled = false; }, 3000);
                };
                const btnBase = (bg, label, svg) => {
                    const a = document.createElement("a");
                    a.href = "#"; a.target = "_blank";
                    a.title = label;
                    a.style.cssText = `padding:5px 10px;border-radius:4px;border:none;background:${bg};color:#fff;cursor:pointer;font-size:13px;text-decoration:none;display:inline-flex;align-items:center;gap:4px;`;
                    a.innerHTML = svg + `<span>${label}</span>`;
                    return a;
                };
                const biliSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="white"><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M3 10h18"/><rect x="8" y="11" width="3" height="3" rx="1"/><rect x="13" y="11" width="3" height="3" rx="1"/><path d="M8 7L10 3h4l2 4"/></svg>`;
                const ytSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="white"><rect x="2" y="4" width="20" height="16" rx="4"/><path d="M10 8v8l6-4z" fill="#ff0000"/></svg>`;
                const caiSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="white"><circle cx="12" cy="12" r="10" fill="none" stroke="white" stroke-width="2"/><path d="M16 8A6 6 0 1 0 16 16" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round"/></svg>`;
                const rhSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="white"><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="white" stroke-width="2"/><text x="12" y="17" font-size="14" text-anchor="middle" fill="white" font-weight="bold" font-family="sans-serif">RH</text></svg>`;

                const biliBtn = btnBase("#fb7299", "B站", biliSvg);
                biliBtn.href = "https://space.bilibili.com/169318349"; biliBtn.title = "作者B站主页";

                const ytBtn = btnBase("#ff0000", "YouTube", ytSvg);
                ytBtn.href = "https://www.youtube.com/@Zove-try"; ytBtn.title = "作者YouTube主页";

                const caiBtn = btnBase("#0abf53", "CivitAI", caiSvg);
                caiBtn.href = "https://civitai.com/user/Zovetry"; caiBtn.title = "作者CivitAI主页";

                // ── RunningHub 合并按钮：点击弹出选 .ai 还是 .cn ──
                const rhBtn = btnBase("var(--anima-accent)", "RH", rhSvg);
                rhBtn.title = "选择RunningHub站点";
                const rhDropdown = $el("div", {
                    style: { position: "absolute", top: "100%", left: "0", zIndex: 10000,
                             background: "linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)", border: "1px solid var(--anima-line)", borderRadius: "4px",
                             display: "none", minWidth: "120px", marginTop: "2px" }
                });
                rhBtn.style.position = "relative";
                for (const { domain, url } of [
                    { domain: "国际站", url: "https://www.runninghub.ai/user-center/1898017693566418945/webapp?inviteCode=rh-v1315" },
                    { domain: "中国站", url: "https://www.runninghub.cn/user-center/1917534691380076545/webapp?inviteCode=rh-v1315" },
                ]) {
                    const item = $el("div", {
                        textContent: domain,
                        style: { padding: "6px 12px", cursor: "pointer", color: "#e0e0e0", fontSize: "12px" },
                        onmouseover: () => { item.style.background = "var(--anima-line)"; },
                        onmouseout: () => { item.style.background = "transparent"; },
                        onclick: (e) => { e.stopPropagation(); window.open(url, "_blank"); rhDropdown.style.display = "none"; }
                    });
                    rhDropdown.appendChild(item);
                }
                rhBtn.onclick = (e) => { e.preventDefault(); rhDropdown.style.display = rhDropdown.style.display === "none" ? "block" : "none"; };
                // 点击弹窗内其他位置关闭 rhDropdown（绑定到 dialog，随弹窗销毁，不再泄漏到 document）
                dialog.addEventListener("click", (e) => { if (!rhBtn.contains(e.target)) rhDropdown.style.display = "none"; });
                rhBtn.appendChild(rhDropdown);

                const socBar = $el("div", { style: { display: "flex", gap: "4px", marginRight: "auto" } });
                socBar.append(biliBtn, ytBtn, caiBtn, rhBtn);
                btnRow.append(socBar, buildTableBtn, refreshBtn, cancelBtn, saveBtn);
                const _favBackfillHost = $el("div", { style: { margin: "10px 0" } });
                dialog.append(title, blLabel, desc, ta, blInput, blList, orRow, _favBackfillHost, btnRow);
                if (typeof window.animaMountFavBackfillBtn === "function") window.animaMountFavBackfillBtn(_favBackfillHost, "danbooru");
                if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(dialog); overlay.append(dialog);
                // 点遮罩不关闭，避免误触丢失未保存的设置
                // overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
                document.body.appendChild(overlay);
            };
            searchBar.appendChild(settingsBtn);
            footer.appendChild(pageInfo);
            container.appendChild(footer);

            // ──── 搜索 ────
            const clearMultiSel = () => {
                _multiSelections.clear();
                selectedPostId = null;  // 清单选状态（真实变量名）
                if (selWidget) selWidget.value = "{}";
                document.querySelectorAll(".db-multi-cb").forEach(cb => { cb.textContent = "☐"; });
                document.querySelectorAll(".db-sel-overlay").forEach(o => { o.style.display = "none"; });
                // 清融合模式标号（1/2/3 序号角标）
                document.querySelectorAll(".db-fusion-badge").forEach(b => b.remove());
                // 清卡片框（完整 border 简写，融合/单选都会残留）+ 发光
                document.querySelectorAll(".db-img-card").forEach(cd => {
                    cd.style.border = "2px solid transparent";
                    cd.style.borderColor = "transparent";
                    cd.style.boxShadow = "none";
                });
            };
            let _currentForceTags = null;
            node.__dbSearch = (q) => { try { searchInput.value = q; _currentForceTags = null; doSearch(1); } catch(e){} };
                const doSearch = async (page = 1, forceTags = null, append = false, force = false, tail = false) => {
                const _gen = append ? _searchGen : (++_searchGen);
                if (!append) { doSearch._scoreRetry = 0; doSearch._scoreRetrying = false; }
                isLoading = true;
                if (_multiEnabled) clearMultiSel();
                if (!append) { _lastBeforeId = null; _lastBeforeScore = null; _seenIds = new Set(); _onTail = !!tail; }
                if (forceTags !== null) _currentForceTags = forceTags;
                else if (!page || page === 1) {
                    if (!_hotActive) _currentForceTags = null;  // 非热门模式才清空
                }
                let query = _currentForceTags !== null ? _currentForceTags : searchInput.value.trim();
                // 排序栏始终可见（含多选/融合切换按钮）
                sortBar.style.display = "flex";
                const ratingStr = _ratAll.checked ? "" : [..._activeRatings].join(",");
                if (!append) gridContainer.innerHTML = '<div style="grid-column:1/-1;display:flex;align-items:center;justify-content:center;padding:60px 0;color:#e0e0e0;font-size:18px;">⏳ 搜索中...</div>';
                else if (!document.getElementById("db-loading")) {
                    const _ld = document.createElement("div");
                    _ld.id = "db-loading";
                    _ld.textContent = animaTxt("⏳ 正在加载下一页...");
                    _ld.style.cssText = "grid-column:1/-1;text-align:center;padding:18px 0;color:var(--anima-accent-soft);font-size:13px;";
                    gridContainer.appendChild(_ld);
                }
                var _cfStop = false;
                var _cfTimer = setInterval(function () {
                    if (_cfStop || _gen !== _searchGen) return;
                    fetch("/danbooru_anima/cf_status").then(function (r) { return r.json(); }).then(function (d) {
                        if (_cfStop || _gen !== _searchGen || !d || !d.active) return;
                        var note = document.getElementById("db-cf-note");
                        if (!note) {
                            gridContainer.innerHTML = "";
                            note = document.createElement("div");
                            note.id = "db-cf-note";
                            note.style.cssText = "grid-column:1/-1;max-width:640px;margin:28px auto;padding:16px 18px;white-space:pre-wrap;text-align:left;line-height:1.65;font-size:15px;color:#f3f3f3;background:rgba(0,0,0,.28);border:1px solid rgba(251,191,36,.45);border-radius:12px;";
                            gridContainer.appendChild(note);
                        }
                        note.textContent = animaTxt("会弹出一个 Chrome 窗口。里面如果是勾选或者「请稍候」，就在那个窗口里做完，不要关掉。做完以后窗口里会出现图，这里会自己继续。如果窗口里已经是一排图，不用点。");
                    }).catch(function () {});
                }, 700);
                searchBtn.textContent = "⏳";
                try {
                    // 时间排序用 id 游标；评分排序用数字 page（score:<= 会把后续页卡成空）
                    const _isScore = String(_sortOrder || "").indexOf("score") === 0;
                    let _bid = (append && !_isScore && !tail && _lastBeforeId) ? _lastBeforeId : undefined;
                    if (!append && _bookmarkBeforeId) { _bid = _bookmarkBeforeId; _bookmarkBeforeId = 0; }
                    const resp = await fetch("/danbooru_anima/search", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ tags: query, page: tail ? 1 : page, limit: 40, rating: ratingStr, order: _sortOrder || undefined, force: force || false, before_id: _bid, tail: !!tail }),
                    });
                    const data = await resp.json();
                    if (_gen !== _searchGen) return;
                    if (data.success && data.posts) {
                        if (data.pages) _totalPages = Number(data.pages) || 0;
                        else if (data.total) _totalPages = Math.max(1, Math.ceil(Number(data.total) / 40));
                        if (tail && data.posts.length) data.posts = data.posts.slice().reverse();
                        currentPage = tail && _totalPages ? _totalPages : page;
                        _onTail = !!tail;
                        if (_totalPages > 0) { jumpInput.max = String(_totalPages); jumpInput.placeholder = "1-" + _totalPages; }
                        lastBtn.disabled = !_totalPages || currentPage >= _totalPages;
                        // 时间排序：下一页 page=b<本页最小 id>
                        // 评分排序：下一页用数字 page+1（不要 score:<= / id 游标）
                        if (data.posts.length) {
                            var _rawIds = [];
                            var _rawScores = [];
                            for (var _ri = 0; _ri < data.posts.length; _ri++) {
                                var _rid = Number(data.posts[_ri].id);
                                if (_rid > 0) _rawIds.push(_rid);
                                var _rsc = Number(data.posts[_ri].score);
                                if (!isNaN(_rsc)) _rawScores.push(_rsc);
                            }
                            if (_rawIds.length) _lastBeforeId = Math.min.apply(null, _rawIds);
                            if (_rawScores.length) _lastBeforeScore = Math.min.apply(null, _rawScores);
                        }
                        // ── 保存过滤前原始条数（翻页判断用） ──
                        var _originalCount = data.posts.length;
                        // ── 客户端过滤（排除含特定 tag 的图片） ──
                        if (_excludeImgTags) {
                            var _excludeList = _excludeImgTags.split(/[,，]+/).filter(Boolean).map(function(s){return s.trim().toLowerCase();});
                            if (_excludeList.length) {
                                data.posts = data.posts.filter(function(p){
                                    var _pt = (p.tags||p.tag_string||'').toLowerCase();
                                    for (var _ei = 0; _ei < _excludeList.length; _ei++) {
                                        if (_pt.indexOf(_excludeList[_ei]) >= 0) return false;
                                    }
                                    return true;
                                });
                            }
                        }
                        if (append) {
                            data.posts = data.posts.filter(function(p){ return p && p.id != null && !_seenIds.has(String(p.id)); });
                            currentPosts = currentPosts.concat(data.posts);
                        } else {
                            currentPosts = data.posts;
                        }
                        doSearch._scoreRetry = 0;
                        if (!data.posts.length && !append && !tail && !force && (_totalPages > 0 || Number(data.total) > 0)) {
                            return doSearch(page, forceTags, false, true, false);
                        }
                        if (!data.posts.length) {
                            if (!append) {
                                var _emptyMsg = _totalPages > 0
                                    ? "没有结果（接口空返回，可点🔄强制刷新）"
                                    : "没有结果";
                                gridContainer.innerHTML = '<div style="color:#a0a0a0;padding:30px;text-align:center;grid-column:1/-1;">' + _emptyMsg + '</div>';
                            }
                        } else {
                            renderGrid(data.posts, append);
                        }
                        for (var _i = 0; _i < data.posts.length; _i++) {
                            var _p = data.posts[_i];
                            if (_p.classified) tagCache[_p.id] = _p.classified;
                            if (_p.translations) {
                                tagTranslationCache[_p.id] = _p.translations;
                                Object.assign(_globalTagTranslations, _p.translations);
                            }
                        }
                        // 翻页判断：用过滤前的原始 API 条数
                        prevBtn.disabled = currentPage <= 1 || _onTail;
                        _endReached = _onTail || _originalCount < 40;
                        nextBtn.disabled = _endReached;
                        lastBtn.disabled = !_totalPages || currentPage >= _totalPages;
                        console.log("[D站浏览器]", "page=" + currentPage, "API返回=" + _originalCount, "过滤后=" + data.posts.length, "next禁用=" + nextBtn.disabled, "排除标签=" + (_excludeImgTags || "(无)"));
                        _setPageStatus(currentPage);
                        if (_bookmarkMark) { pageStatus.textContent = animaTxt("书签"); _bookmarkMark = false; }
                        setTimeout(_updatePageIndicator, 60);
                    } else {
                        if (!append) {
                            const _fail = document.createElement("div");
                            _fail.style.cssText = "color:#f87171;padding:30px;text-align:center;grid-column:1/-1;white-space:pre-wrap;";
                            _fail.textContent = animaTxt((data && data.error) ? String(data.error) : "搜索失败");
                            gridContainer.innerHTML = "";
                            gridContainer.appendChild(_fail);
                        }
                    }
                } catch (err) {
                    if (append) {
                        const _le = document.createElement("div");
                        _le.textContent = animaTxt("⚠️ 加载失败：") + (err.message || err);
                        _le.style.cssText = "grid-column:1/-1;text-align:center;padding:12px 0;color:#f87171;font-size:12px;";
                        gridContainer.appendChild(_le);
                    } else {
                        gridContainer.innerHTML = `<div style="color:#f87171;padding:30px;text-align:center;grid-column:1/-1;">${err.message}</div>`;
                    }
                } finally {
                    _cfStop = true;
                    clearInterval(_cfTimer);
                    if (_gen === _searchGen && !doSearch._scoreRetrying) {
                        isLoading = false;
                        searchBtn.textContent = "🔍";
                        const _ld2 = document.getElementById("db-loading");
                        if (_ld2) _ld2.remove();
                    }
                    doSearch._scoreRetrying = false;
                }
            };

            // ── 分类搜索弹窗（搜角色/系列/画师，带中文翻译） ──
            let _clsPopup = null;
            const _cnTag = (tag) => {
                const cn = tagTranslations[tag] || _globalTagTranslations[tag];
                return cn ? `${tag} (${cn})` : tag;
            };
            const _favCatMap = { character: "characters", series: "series", artist: "artists" };
            const showClassSearch = (postId, cdata, anchor, translations) => {
                if (_clsPopup) { _clsPopup.remove(); _clsPopup = null; }
                if (!_favCache) _getFavs();
                // 更新 tagTranslations
                if (translations) {
                    Object.assign(tagTranslations, translations);
                    Object.assign(_globalTagTranslations, translations);
                    if (!tagTranslationCache[postId]) tagTranslationCache[postId] = {};
                    Object.assign(tagTranslationCache[postId], translations);
                }
                const doSearchTag = (tag) => {
                    searchInput.value = tag.replace(/ /g, '_');
                    if (_clsPopup) _clsPopup.remove();
                    _clsPopup = null;
                    if (_hotActive) { _hotActive = false; Object.assign(hotBtn.style, _DEF_STYLE); _currentForceTags = null; }
                    doSearch(1);
                };
                const _makeStar = (tag, favCat) => {
                    const isFav = _favCache?.[favCat]?.[tag];
                    const star = $el("span", {
                        textContent: isFav ? "★" : "☆",
                        title: isFav ? "取消收藏" : "收藏",
                        style: { cursor: "pointer", fontSize: "14px", marginLeft: "4px", color: isFav ? "#fbbf24" : "var(--anima-accent)" },
                        onclick: async (ev) => {
                            ev.stopPropagation();
                            star.textContent = "⏳";
                            const cn = tagTranslations[tag] || _globalTagTranslations[tag] || "";
                            const result = await _toggleFav(tag, favCat, _lastThumbUrl || "", cn);
                            star.textContent = result === "added" ? "★" : "☆";
                            star.title = result === "added" ? "取消收藏" : "收藏";
                            star.style.color = result === "added" ? "#fbbf24" : "var(--anima-accent)";
                        }
                    });
                    return star;
                };
                const buildSubList = (tags, favCat) => {
                    const box = $el("div", { style: { borderTop: "1px solid var(--anima-line)" } });
                    for (const tag of tags) {
                        const row = $el("div", {
                            style: { padding: "6px 14px 6px 24px", cursor: "pointer", color: "var(--anima-mute)", fontSize: "12px", display: "flex", alignItems: "center" },
                            onmouseover: () => { row.style.background = "var(--anima-bg)"; },
                            onmouseout: () => { row.style.background = "transparent"; },
                            onclick: (ev) => { ev.stopPropagation(); doSearchTag(tag); }
                        });
                        row.innerHTML = `<span style="flex:1">${_cnTag(tag)}</span>`;
                        row.appendChild(_makeStar(tag, favCat));
                        box.appendChild(row);
                    }
                    return box;
                };

                // 计算弹窗位置：在卡片正上方
                const rect = anchor.getBoundingClientRect();
                const topPos = rect.top - 10;  // 卡片上方 10px
                const leftPos = Math.max(8, Math.min(rect.left + rect.width / 2 - 90, window.innerWidth - 188));

                const popup = $el("div", {
                    style: { position: "fixed", top: `${topPos}px`, left: `${leftPos}px`,
                             background: "linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)", border: "1px solid var(--anima-line)", borderRadius: "8px",
                             minWidth: "180px", zIndex: 10000, boxShadow: "0 6px 24px rgba(0,0,0,0.7)", overflow: "hidden" }
                });

                const cats = [
                    { key: "character", label: "搜角色", icon: "👤", color: "#f48fb1" },
                    { key: "series",    label: "搜系列", icon: "📺", color: "#ce93d8" },
                    { key: "artist",    label: "搜画师", icon: "🎨", color: "#81d4fa" },
                ];
                for (const { key, label, icon, color } of cats) {
                    const tags = (cdata[key] || []).slice(0, 8);
                    if (tags.length === 0) continue;
                    const favCat = _favCatMap[key] || "general";
                    if (tags.length === 1) {
                        const row = $el("div", {
                            style: { display: "flex", alignItems: "center", gap: "8px", padding: "9px 14px", cursor: "pointer", borderBottom: "1px solid var(--anima-line)" },
                            onmouseover: () => { row.style.background = "var(--anima-bg)"; },
                            onmouseout: () => { row.style.background = "transparent"; },
                            onclick: (ev) => { ev.stopPropagation(); doSearchTag(tags[0]); }
                        });
                        row.innerHTML = `<span style="font-size:15px">${icon}</span><span style="color:#e0e0e0;font-size:13px">${label}</span><span style="margin-left:auto;color:${color};font-size:12px">${_cnTag(tags[0])}</span>`;
                        row.appendChild(_makeStar(tags[0], favCat));
                        popup.appendChild(row);
                    } else {
                        const row = $el("div", {
                            style: { display: "flex", alignItems: "center", gap: "8px", padding: "9px 14px", cursor: "pointer", borderBottom: "1px solid var(--anima-line)" },
                            onmouseover: () => { row.style.background = "var(--anima-bg)"; },
                            onmouseout: () => { row.style.background = "transparent"; },
                            onclick: (ev) => {
                                ev.stopPropagation();
                                const existing = row.nextElementSibling;
                                if (existing && existing._subList) { existing.remove(); }
                                else {
                                    const sub = buildSubList(tags, favCat);
                                    sub._subList = true;
                                    row.after(sub);
                                }
                            }
                        });
                        row.innerHTML = `<span style="font-size:15px">${icon}</span><span style="color:#e0e0e0;font-size:13px">${label}</span><span style="margin-left:auto;color:${color};font-size:12px">${tags.length}个 ▾</span>`;
                        popup.appendChild(row);
                    }
                }

                document.body.appendChild(popup);
                _clsPopup = popup;
                setTimeout(() => {
                    const closer = (ev) => {
                        if (!popup.contains(ev.target)) {
                            popup.remove(); _clsPopup = null; document.removeEventListener('click', closer);
                        }
                    };
                    document.addEventListener('click', closer);
                }, 10);
            };

            // ──── 渲染网格 ────
            let _lastGridPosts = null;
            let _lastOrigUrl = "";
            let _lastIsVideo = false;
            let _lastPostUrl = "";
            const renderGrid = (posts, append = false) => {
                if (!append) {
                    gridContainer.innerHTML = "";
                    _seenIds = new Set();
                    _lastGridPosts = [];
                }
                if (!posts || posts.length === 0) {
                    // 空数据时显示"加载中"（初始空白期/恢复期）；真正的"没有结果"由 doSearch 完成时显示
                    if (!append && !gridContainer.querySelector(".db-img-card")) {
                        gridContainer.innerHTML = '<div style="grid-column:1/-1;display:flex;align-items:center;justify-content:center;padding:60px 0;color:var(--anima-mute);font-size:16px;">⏳ 正在加载...</div>';
                    }
                    return;
                }
                if (append) _lastGridPosts = (_lastGridPosts || []).concat(posts);
                else _lastGridPosts = posts.slice();
                const _colW = _calcColWidth();
                for (const post of posts) {
                    const _sid = String(post.id);
                    if (post.id == null || _sid === "" || _seenIds.has(_sid)) continue;
                    _seenIds.add(_sid);
                    // 跳过已被下架/无图片的帖子（仿地藏画廊：渲染层直接不显示）
                    if (!(post.preview_url || post.sample_url || post.large_url)) continue;
                    // 瀑布流占位：按宽高比算 span 行数
                    let _spans = 2;
                    if (post.width && post.height) {
                        const _h = _colW * (post.height / post.width);
                        _spans = Math.max(1, Math.ceil((_h + 6) / 16));
                    }
                    const card = $el("div", {
                        className: "db-img-card",
                        style: {
                            position: "relative", borderRadius: "8px", overflow: "hidden",
                            cursor: "pointer",
                            border: "none",
                            gridRowEnd: "span " + _spans,
                            background: "linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)",
                        }
                    });
                    card.dataset.galleryPage = currentPage;
                    card._postId = post.id;
                    card.dataset.postid = post.id;

                    const _hdUrl = post.sample_url || post.large_url || post.preview_url || "";
                    const img = $el("img", {
                        loading: "lazy",
                        src: `/danbooru_anima/image_proxy?url=${encodeURIComponent(post.preview_url || post.sample_url || "")}`,
                        "data-large-url": post.large_url || "",
                        "data-hd": `/danbooru_anima/image_proxy?url=${encodeURIComponent(_hdUrl)}`,
                        draggable: false,
                        style: { display: "block", width: "100%", height: "auto", background: "transparent" },
                        onerror: function() {
                            // 图片失效（已被下架/404）→ 隐藏整卡，不显示破图
                            try { const _pc = this.closest(".db-img-card"); if (_pc) _pc.style.display = "none"; } catch(e) {}
                        },
                        onload: function() {
                            // 图加载后按实际渲染高度重算 span（与图完全贴合，无黑边）
                            const _ih = this.clientHeight || 0;
                            if (_ih > 0) {
                                const _sp2 = Math.max(1, Math.ceil((_ih + 6) / 16));
                                if (card.style.gridRowEnd !== "span " + _sp2) {
                                    card.style.gridRowEnd = "span " + _sp2;
                                }
                            }
                        }
                    });
                    // 缩略图起步：进视口（±200px）才换高清（地藏画廊机制，省内存/渲染）
                    if (window.IntersectionObserver && _dbIO) _dbIO.observe(img);

                    // 视频标记
                    const videoBadge = post.is_video ? $el("span", {
                        textContent: "🎬 VIDEO",
                        style: { position: "absolute", top: "3px", left: "3px", background: "rgba(0,0,0,0.8)", color: "#ff6b6b", padding: "2px 6px", borderRadius: "3px", fontSize: "12px", fontWeight: "bold", zIndex: 2 }
                    }) : null;
                    const scoreBadge = $el("span", { className: "db-hover-badge",
                        textContent: `★${post.score ?? 0}`,
                        style: { position: "absolute", top: "3px", right: "3px", background: "rgba(0,0,0,0.8)", color: "#fbbf24", padding: "2px 6px", borderRadius: "3px", fontSize: "16px", fontWeight: "bold" }
                    });
                    const rc = { s: "#4caf50", q: "#fbbf24", e: "#f87171" };
                    const rb = $el("span", { className: "db-hover-badge",
                        textContent: (post.rating || "?").toUpperCase(),
                        style: { position: "absolute", top: "3px", right: "52px", background: rc[post.rating] || "var(--anima-mute)", color: "#fff", padding: "1px 5px", borderRadius: "3px", fontSize: "12px", fontWeight: "bold" }
                    });
                    const tagBtn = $el("span", {
                        className: "db-act",
                        textContent: "📋",
                        title: "查看图片信息"
                    });
                    tagBtn.onclick = (e) => {
                        e.stopPropagation();
                        // 优先用 post.sample_url（视频帖为 720 档图；large_url 对视频帖是 mp4，不能当图）
                        let url = (post.sample_url || post.preview_url || '').trim();
                        // 如果 post 没有，再从 DOM img 元素提取
                        if (!url) {
                            const cardImg = e.currentTarget.closest(".db-img-card").querySelector("img");
                            if (cardImg) {
                                try {
                                    const raw = cardImg.getAttribute('src') || cardImg.src || '';
                                    url = decodeURIComponent(new URL(raw, location.origin).searchParams.get('url') || '');
                                } catch {}
                            }
                        }
                        _lastThumbUrl = url;
                        _lastOrigUrl = post.file_url || post.large_url || url;
                        _lastIsVideo = !!post.is_video;
                        _lastPostUrl = "https://danbooru.donmai.us/posts/" + post.id;
                        showTagOverlay(post.id);
                    };

                    // ── 分类搜索按钮（🔍 搜角色/系列/画师） ──
                    const clsBtn = $el("span", {
                        className: "db-act",
                        textContent: "🔍",
                        title: "搜角色/系列/画师"
                    });
                    clsBtn.onclick = (e) => {
                        e.stopPropagation();
                        // 记录缩略图供 ☆ 收藏用
                        let url = (post.large_url || post.preview_url || '').trim();
                        if (!url) {
                            const ci = e.currentTarget.closest(".db-img-card").querySelector("img");
                            if (ci) {
                                try { url = decodeURIComponent(new URL(ci.getAttribute('src') || ci.src || '', location.origin).searchParams.get('url') || ''); } catch {}
                            }
                        }
                        _lastThumbUrl = url;
                        const cdata = tagCache[post.id];
                        if (cdata) {
                            const trans = tagTranslationCache[post.id] || {};
                            showClassSearch(post.id, cdata, card, trans);
                        } else {
                            // 从预加载队列中抢走这个 post，避免重复请求
                            if (_preloadQueue) _preloadQueue.delete(post.id);
                            clsBtn.textContent = "⏳";
                            fetch(`/danbooru_anima/post/${post.id}`).then(r => r.json()).then(d => {
                                clsBtn.textContent = "🔍";
                                if (d.success && d.classified) {
                                    tagCache[post.id] = d.classified;
                                    showClassSearch(post.id, d.classified, card, d.translations || {});
                                }
                            }).catch(() => { clsBtn.textContent = "🔍"; });
                        }
                    };

                    const _isMultiSel = _multiSelections.has(post.id);
                    // 多选勾选框（始终显示，切换模式时可见）
                    const multiCb = $el("span", {
                        className: "db-multi-cb",
                        textContent: _isMultiSel ? "☑" : "☐",
                        style: { position: "absolute", top: "24px", left: "3px", background: "rgba(0,0,0,0.7)", color: _isMultiSel ? "#fbbf24" : "var(--anima-accent-soft)", padding: "1px 6px", borderRadius: "4px", fontSize: "14px", fontWeight: "bold", zIndex: 4, cursor: "pointer", display: _multiEnabled ? "block" : "none" }
                    });
                    // ── ❤️ 图片收藏按钮（左下角） ──
                    const _imgIsFav = _favCache?.images?.[String(post.id)];
                    const favImgBtn = $el("span", {
                        className: "db-act",
                        "data-role": "img-fav",
                        textContent: _imgIsFav ? "❤️" : "🤍",
                        title: _imgIsFav ? "取消收藏图片" : "收藏图片",
                        onclick: async (e) => {
                            e.stopPropagation();
                            const key = String(post.id);
                            const isFav = _favCache?.images?.[key];
                            // 立即显示加载动画，提示用户已响应
                            favImgBtn.textContent = "⏳";
                            if (isFav) {
                                await fetch('/danbooru_anima/favorites/remove', {
                                    method: 'POST', headers: {'Content-Type':'application/json'},
                                    body: JSON.stringify({ tag: key, category: 'images' })
                                });
                                if (_favCache?.images) {
                                    delete _favCache.images[key];
                                    const _o = _favCache.images._order;
                                    if (_o) { const _ix = _o.indexOf(key); if (_ix >= 0) _o.splice(_ix, 1); }
                                }
                                favImgBtn.textContent = "🤍";
                                favImgBtn.title = animaTxt("收藏图片");
                            } else {
                                const tagsStr = post.tags || post.tag_string || '';
                                const metaObj = { tags: tagsStr, large_url: post.large_url || post.file_url || '' };
                                const _autoCls = typeof window.animaFavAutoCacheOn === "function" && window.animaFavAutoCacheOn("danbooru");
                                const _cls = _autoCls ? (post.classified || tagCache[post.id]) : null;
                                if (_cls) {
                                    if (Array.isArray(_cls.series)) metaObj.series = _cls.series;
                                    if (Array.isArray(_cls.character)) metaObj.character = _cls.character;
                                    if (Array.isArray(_cls.artist)) metaObj.artist = _cls.artist;
                                    const want = [].concat(metaObj.series || [], metaObj.character || [], metaObj.artist || []);
                                    const trans = {};
                                    const tsrc = Object.assign({}, _globalTagTranslations, tagTranslationCache[post.id] || {}, post.translations || {});
                                    want.forEach(function(t) {
                                        if (!t) return;
                                        const u = String(t).replace(/ /g, '_');
                                        const cn = tsrc[t] || tsrc[u] || tsrc[String(t).replace(/_/g, ' ')];
                                        if (cn) trans[t] = cn;
                                    });
                                    if (Object.keys(trans).length) metaObj.translations = trans;
                                }
                                const meta = JSON.stringify(metaObj);
                                const addR = await fetch('/danbooru_anima/favorites/add', {
                                    method: 'POST', headers: {'Content-Type':'application/json'},
                                    body: JSON.stringify({ tag: key, category: 'images', thumb_url: post.preview_url || '', cn: meta, cache_classified: !!_autoCls })
                                });
                                let savedCn = meta;
                                try { const addD = await addR.json(); if (addD && addD.cn) savedCn = addD.cn; } catch (eAdd) {}
                                if (!_favCache.images) _favCache.images = { _order: [] };
                                _favCache.images[key] = { thumb: post.preview_url || '', cn: savedCn };
                                if (_favCache.images._order) { if (!_favCache.images._order.includes(key)) _favCache.images._order.push(key); }
                                else _favCache.images._order = [key];
                                favImgBtn.textContent = "❤️";
                                favImgBtn.title = animaTxt("取消收藏图片");
                            }
                        }
                    });
                    // 🖼️ 大图按钮

                    multiCb.onclick = (e) => { e.stopPropagation(); selectPost(post, card); };

                    const actRow = $el("div", { className: "db-act-row" });
                    actRow.append(favImgBtn, tagBtn, clsBtn);
                    card.append(img, scoreBadge, multiCb, rb, actRow);
                    if (videoBadge) card.append(videoBadge);
                    // 恢复融合角标（翻页/无限加载后保持选中显示）
                    if (_tagFusionEnabled) {
                        const _inSlots2 = [];
                        for (const _sn of [1, 2, 3]) { if (_fusionSlots[_sn].has(post.id)) _inSlots2.push(_sn); }
                        if (_inSlots2.length) {
                            const _sb2 = { 1: "#6ee7b7", 2: "#f87171", 3: "var(--anima-accent-sky)" };
                            const _badge2 = $el("div", { className: "db-fusion-badge", style: { position: "absolute", bottom: "4px", left: "4px", zIndex: 6, display: "flex", gap: "3px" } });
                            _badge2.innerHTML = _inSlots2.map(_n => `<span style="display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;border-radius:50%;background:${_sb2[_n]};color:var(--anima-bg-deep);font-size:11px;font-weight:bold;">${_n}</span>`).join("");
                            card.appendChild(_badge2);
                            const _last2 = _inSlots2[_inSlots2.length - 1];
                            card.style.border = "2px solid " + (_sb2[_last2] || "var(--anima-accent-soft)");
                            const _ov2 = $el("div", { className: "db-sel-overlay", style: { position: "absolute", inset: 0, pointerEvents: "none", borderRadius: "3px" } });
                            _ov2.style.background = _inSlots2.length === 1 ? ({ 1: "rgba(var(--anima-accent-rgb),0.15)", 2: "rgba(248,113,113,0.15)", 3: "rgba(var(--anima-sky-rgb),0.15)" })[_inSlots2[0]] : "rgba(255,255,255,0.06)";
                            _ov2.style.display = "block";
                            card.appendChild(_ov2);
                        }
                    }
                    // 如果图片已在多选列表，应用选中样式
                    if (_isMultiSel) {
                        card.style.border = "2px solid var(--anima-accent-soft)";
                        const ov = $el("div", { className: "db-sel-overlay", style: { position: "absolute", inset: 0, background: "rgba(var(--anima-accent-rgb),0.12)", pointerEvents: "none", borderRadius: "3px" } });
                        card.appendChild(ov);
                    }
                    card.onclick = () => selectPost(post, card);
                    card.addEventListener("contextmenu", (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        const _saveDbBm = () => {
                            if (!window.animaBm || !post || post.id == null) return;
                            window.animaBm.promptAdd("danbooru", {
                                postId: post.id,
                                tags: String(searchInput.value || "").trim().replace(/\s+/g, " "),
                                rating: _ratAll.checked ? "" : Array.from(_activeRatings).join(","),
                                thumb: post.preview_url || post.sample_url || post.large_url || post.file_url || ""
                            }, function() {
                                try { pageStatus.textContent = animaTxt("已添加书签"); } catch (eBm) {}
                            });
                        };
                        const groups = post.classified || tagCache[post.id] || null;
                        const trans = Object.assign({}, post.translations || {}, tagTranslationCache[post.id] || {});
                        if (groups) {
                            _animaOpenSiteJump(ev.clientX, ev.clientY, "danbooru", groups, trans, _saveDbBm);
                            return;
                        }
                        const token = _animaOpenSiteJump(ev.clientX, ev.clientY, "danbooru", null, trans, _saveDbBm);
                        fetch("/danbooru_anima/post/" + post.id).then(r => r.json()).then(d => {
                            if (window._animaSiteJumpToken !== token) return;
                            if (d && d.success && d.classified) {
                                tagCache[post.id] = d.classified;
                                if (d.translations) tagTranslationCache[post.id] = Object.assign(tagTranslationCache[post.id] || {}, d.translations);
                                _animaOpenSiteJump(ev.clientX, ev.clientY, "danbooru", d.classified, Object.assign(trans, d.translations || {}), _saveDbBm);
                            } else {
                                _animaOpenSiteJump(ev.clientX, ev.clientY, "danbooru", {}, trans, _saveDbBm);
                            }
                        }).catch(() => {
                            if (window._animaSiteJumpToken === token) _animaOpenSiteJump(ev.clientX, ev.clientY, "danbooru", {}, trans, _saveDbBm);
                        });
                    });
                    gridContainer.appendChild(card);
                }
                // ── DOM 滑动窗口回收（学 D站画廊）：渲染完一批后调用，上限 4200 张，
                //    从最老端回收，保护视口锚点与选中卡，并补偿滚动位置防跳动 ──
                _recycleDbItems();
                // 渲染完后主动预加载高分图的 tag
                setTimeout(() => prefetchTags(posts), 100);
                // 布局稳定后按实际图片高度重算瀑布流 span（修正首次加载列宽不准确导致的图片比例问题）
                setTimeout(() => {
                    try {
                        gridContainer.querySelectorAll(".db-img-card").forEach(_cd => {
                            const _im = _cd.querySelector("img");
                            if (_im && _im.clientHeight > 0) {
                                const _sp = Math.max(1, Math.ceil((_im.clientHeight + 6) / 16));
                                if (_cd.style.gridRowEnd !== "span " + _sp) _cd.style.gridRowEnd = "span " + _sp;
                            }
                        });
                    } catch(e) {}
                }, 180);
            };

            // ──── 预加载：只提前载前 3 张高分图的 tag，避免阻塞 Run ────
            const prefetchTags = (posts) => {
                // 搜索结果已带 classified；再打 /post/{id} 会后台下原图，把代理打满导致连续 Run 超时
            };

            // ── 多选：切换所有卡片勾选框的显示 ──
            const toggleMultiCbs = (show) => {
                document.querySelectorAll(".db-multi-cb").forEach(cb => { cb.style.display = show ? "block" : "none"; });
            };

            // ── 检测 IMAGE 端口（index=0）是否接线 ──
            const imageConnected = () => node?.outputs?.[0]?.links?.length > 0;

            // ──── 选中帖子（点击瞬间写 widget，不等 API） ────
            const selectPost = async (post, card) => {
                if (_tagFusionEnabled) {
                    // ── 分序号模式 ──
                    const slot = _fusionActiveSlot;
                    const s = _fusionSlots[slot];
                    // 检查所有序号
                    const inSlots = [];
                    for (const n of [1, 2, 3]) {
                        if (_fusionSlots[n].has(post.id)) inSlots.push(n);
                    }
                    if (s.has(post.id)) {
                        s.delete(post.id);
                        if (_sync12 && slot === 1) _fusionSlots[2].delete(post.id);
                    } else {
                        s.add(post.id);
                        inSlots.push(slot);
                        if (_sync12 && slot === 1) { _fusionSlots[2].add(post.id); inSlots.push(2); }
                    }
                    // 刷新角标
                    let badge = card.querySelector(".db-fusion-badge");
                    if (!badge) {
                        badge = $el("div", { className: "db-fusion-badge", style: { position: "absolute", bottom: "4px", left: "4px", zIndex: 6, display: "flex", gap: "3px" } });
                        card.appendChild(badge);
                    }
                    const slotLabels = { 1: "1", 2: "2", 3: "3" };
                    const slotBg = { 1: "#6ee7b7", 2: "#f87171", 3: "var(--anima-accent-sky)" };
                    const nowInSlots = [];
                    for (const n of [1, 2, 3]) {
                        if (_fusionSlots[n].has(post.id)) nowInSlots.push(n);
                    }
                    if (nowInSlots.length === 0) {
                        badge.style.display = "none";
                        card.style.border = "2px solid transparent";
                        const ov = card.querySelector(".db-sel-overlay");
                        if (ov) ov.style.display = "none";
                    } else {
                        badge.style.display = "flex";
                        badge.innerHTML = nowInSlots.map(n => `<span style="display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;border-radius:50%;background:${slotBg[n]};color:var(--anima-bg-deep);font-size:11px;font-weight:bold;">${slotLabels[n]}</span>`).join("");
                        // 边框用最新添加的序号颜色
                        const lastSlot = nowInSlots[nowInSlots.length - 1];
                        card.style.border = "2px solid " + (slotBg[lastSlot] || "var(--anima-accent-soft)");
                        let ov = card.querySelector(".db-sel-overlay");
                        if (!ov) {
                            ov = $el("div", { className: "db-sel-overlay", style: { position: "absolute", inset: 0, pointerEvents: "none", borderRadius: "3px" } });
                            card.appendChild(ov);
                        }
                        ov.style.display = "block";
                        // 多序号时用渐变色背景
                        if (nowInSlots.length === 1) {
                            const colors = { 1: "rgba(var(--anima-accent-rgb),0.15)", 2: "rgba(248,113,113,0.15)", 3: "rgba(var(--anima-sky-rgb),0.15)" };
                            ov.style.background = colors[nowInSlots[0]] || "rgba(var(--anima-accent-rgb),0.12)";
                        } else {
                            ov.style.background = "rgba(255,255,255,0.06)";
                        }
                    }
                    refreshFusionBar();
                    return;
                }
                if (_multiEnabled) {
                    // ── 多选模式：切换勾选 ──
                    if (_multiSelections.has(post.id)) {
                        _multiSelections.delete(post.id);
                        card.style.border = "2px solid transparent";
                        const ov = card.querySelector(".db-sel-overlay");
                        if (ov) ov.style.display = "none";
                        const cb = card.querySelector(".db-multi-cb");
                        if (cb) cb.textContent = "☐";
                    } else {
                        _multiSelections.add(post.id);
                        card.style.border = "2px solid var(--anima-accent-soft)";
                        let ov = card.querySelector(".db-sel-overlay");
                        if (!ov) {
                            ov = $el("div", { className: "db-sel-overlay", style: { position: "absolute", inset: 0, background: "rgba(var(--anima-accent-rgb),0.12)", pointerEvents: "none", borderRadius: "3px" } });
                            card.appendChild(ov);
                        }
                        ov.style.display = "block";
                        const cb = card.querySelector(".db-multi-cb");
                        if (cb) cb.textContent = "☑";
                    }
                    // 写出多选格式到 widget
                    const selections = [..._multiSelections].map(id => {
                        const p = postById(id);
                        return p ? postSnap(p) : { post_id: Number(id) };
                    });
                    const payload = JSON.stringify({ selections, merge: _multiMerge, image_connected: imageConnected() });
                    if (selWidget) selWidget.value = payload;
                    node.isChanged = true;

                    const cnt = _multiSelections.size;
                    pageInfo.textContent = cnt ? `📦 已选 ${cnt} 张` : "就绪";
                    if (cnt) {
                        infoBar.style.display = "block";
                        infoBar.innerHTML = `已选 ${cnt} 张，Run 后输出 <span class="db-clear-multi" style="color:#f87171;cursor:pointer;font-weight:bold;margin-left:10px;">✕ 清空</span>`;
                        infoBar.querySelector(".db-clear-multi").onclick = () => {
                            _multiSelections.clear();
                            if (selWidget) selWidget.value = "{}";
                            node.isChanged = true;
                            document.querySelectorAll(".db-multi-cb").forEach(cb => { cb.textContent = "☐"; });
                            document.querySelectorAll(".db-sel-overlay").forEach(o => o.style.display = "none");
                            infoBar.style.display = "none";
                            pageInfo.textContent = animaTxt("就绪");
                        };
                    } else { infoBar.style.display = "none"; }
                    return;
                }

                // ── 单选模式 ──
                if (selectedPostId === post.id) {
                    // 已选中 → 取消选择
                    selectedPostId = null;
                    const payload = JSON.stringify({ post_id: null, image_connected: imageConnected(), deselected: true });
                    if (selWidget) selWidget.value = payload;
                    node.isChanged = true;
                    card.style.border = "2px solid transparent";
                    const ov = card.querySelector(".db-sel-overlay");
                    if (ov) ov.style.display = "none";
                    pageInfo.textContent = animaTxt("就绪");
                    return;
                }
                selectedPostId = post.id;
                const payload = JSON.stringify(Object.assign(postSnap(post), { image_connected: imageConnected() }));
                if (selWidget) selWidget.value = payload;
                node.isChanged = true;

                for (const ch of gridContainer.children) {
                    ch.style.border = "2px solid transparent";
                    const ov = ch.querySelector(".db-sel-overlay");
                    if (ov) ov.style.display = "none";
                    const cb = ch.querySelector(".db-multi-cb");
                    if (cb) cb.textContent = "☐";
                }
                card.style.border = "3px solid #f87171";
                let ov2 = card.querySelector(".db-sel-overlay");
                if (!ov2) {
                    ov2 = $el("div", { className: "db-sel-overlay", style: { position: "absolute", inset: 0, background: "rgba(248,113,113,0.15)", pointerEvents: "none", borderRadius: "3px" } });
                    card.appendChild(ov2);
                }
                ov2.style.display = "block";
                infoBar.style.display = "block";

                const cached = tagCache[post.id] || post.classified;
                if (cached) {
                    tagCache[post.id] = cached;
                    renderInfoBar(cached);
                    pageInfo.textContent = `✅ 已选 #${post.id} | ${cached.all?.length || 0} tags`;
                    return;
                }

                /* overlay now triggered by tagBtn only */
                pageInfo.textContent = `⏳ 加载 #${post.id} 标签...`;

                try {
                    const resp = await fetch(`/danbooru_anima/post/${post.id}`);
                    const data = await resp.json();
                    if (data.success && data.classified) {
                        tagCache[post.id] = data.classified;
                        pageInfo.textContent = `✅ 已选 #${post.id} | ${data.classified.all?.length || 0} tags`;
                    }
                } catch (err) {
                    infoBar.textContent = `错误: ${err.message}`;
                }
            };

            // ──── 渲染信息栏 ────
            let tagTranslations = {}; let tagTranslationCache = {};
            // ── 语言检测 ──
            const _Lzh = { QUALITY: "质量/元", COUNT: "数量", CHAR: "角色", SERIES: "系列", ARTIST: "画师", GENERAL: "常规" };
            const ll = (key) => animaTxt(_Lzh[key] || key);
            const _catKeyForFav = { character: 'characters', artist: 'artists', series: 'series' };
            const _SearchBtn = (tag) => {
                return '<span class="db-tag-srch" data-tag="' + tag + '" style="cursor:pointer;font-size:15px;margin-left:3px;color:var(--anima-accent-soft);text-shadow:0 0 4px rgba(0,0,0,0.5);" title="搜索此标签">🔍</span>';
            };
            const _FavStar = (tag, cat) => {
                const isFav = _favCache?.[cat]?.[tag];
                const color = isFav ? '#fbbf24' : 'var(--anima-mute)';
                return '<span class="db-fav-star" data-tag="' + tag + '" data-cat="' + cat + '" style="cursor:pointer;font-size:18px;margin-left:3px;color:' + color + ';text-shadow:0 0 4px rgba(0,0,0,0.5);" title="' + (isFav ? '取消收藏' : '收藏') + '">' + (isFav ? '★' : '☆') + '</span>';
            };
            const buildTagHtml = (c) => {
                // 大图区：与标签同窗（查看大图功能并入）
                const _bigUrl = _lastThumbUrl || "";
                let html = '';
                if (_bigUrl) {
                    html += '<div style="text-align:center;margin-bottom:10px;">';
                    if (_lastIsVideo) {
                        // 视频/动态图帖：只显示大图（选中输出的是图），看视频请打开原帖
                        html += '<img id="db-tag-bigimg" src="/danbooru_anima/image_proxy?url=' + encodeURIComponent(_bigUrl) + '" style="max-width:100%;max-height:320px;border-radius:8px;object-fit:contain;cursor:zoom-in;border:1px solid var(--anima-line);" '
                            + 'onclick="void(0);" title="点击放大/还原">'
                            + '<div style="font-size:10px;color:var(--anima-mute);margin-top:4px;">🎬 视频/动态图帖 · 观看完整内容请打开原帖</div>'
                            + '<div style="display:flex;gap:8px;justify-content:center;margin-top:6px;">'
                            + '<span class="db-tag-big-open" style="padding:3px 12px;border-radius:6px;background:var(--anima-accent-sky);color:#fff;cursor:pointer;font-size:11px;font-weight:bold;">📄 打开原帖</span>'
                            + '<span class="db-tag-big-save" style="padding:3px 12px;border-radius:6px;background:linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi));color:#ffffff;cursor:pointer;font-size:11px;font-weight:bold;">⏬ 保存</span>'
                            + '</div>';
                    } else {
                        html += '<img id="db-tag-bigimg" src="/danbooru_anima/image_proxy?url=' + encodeURIComponent(_bigUrl) + '" style="max-width:100%;max-height:320px;border-radius:8px;object-fit:contain;cursor:zoom-in;border:1px solid var(--anima-line);" '
                            + 'onclick="void(0);" title="点击放大/还原">'
                            + '<div style="display:flex;gap:8px;justify-content:center;margin-top:6px;">'
                            + '<span class="db-tag-big-orig" style="padding:3px 12px;border-radius:6px;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);color:var(--anima-accent-soft);cursor:pointer;font-size:11px;border:1px solid var(--anima-line);">📥 查看原图</span>'
                            + '<span class="db-tag-big-save" style="padding:3px 12px;border-radius:6px;background:linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi));color:#ffffff;cursor:pointer;font-size:11px;font-weight:bold;">⏬ 保存</span>'
                            + '<span class="db-tag-big-open" style="padding:3px 12px;border-radius:6px;background:var(--anima-accent-sky);color:#fff;cursor:pointer;font-size:11px;font-weight:bold;">📄 打开原帖</span>'
                            + '</div>';
                    }
                    html += '</div>';
                }
                html += '<div style="font-size:13px;line-height:2.2;">';
                const L = (label, tags, color, catKey) => {
                    if (tags?.length) {
                        html += '<span style="display:inline-block;background:' + color + '22;color:' + color + ';padding:0 8px;border-radius:4px;margin:3px 0;font-weight:bold;font-size:12px;">' + label + '</span> ';
                        for (const t of tags) {
                            const cn = tagTranslations[t] || _globalTagTranslations[t];
                            const display = cn ? (t + ' <span style="color:var(--anima-mute);">(' + cn + ')</span>') : t;
                            const favCat = _catKeyForFav[catKey] || 'general';
                            html += '<span class="db-tag" style="font-size:13px;display:inline-block;margin:2px 0;">' + display + _SearchBtn(t) + _FavStar(t, favCat) + ' </span>';
                        }
                        html += '<br>';
                    }
                };
                L(ll("QUALITY"), c.quality_meta, "#ff6b6b", 'general');
                L(ll("COUNT"), c.count, "#fbbf24", 'general');
                L(ll("CHAR"), c.character, "#34d399", 'character');
                L(ll("SERIES"), c.series, "var(--anima-accent-range)", 'series');
                L(ll("ARTIST"), c.artist, "#ff6ec7", 'artist');
                L(ll("GENERAL"), c.general, "#a0a0a0", 'general');
                html += '</div>';
                return html || '<span style="color:var(--anima-mute);">（无标签）</span>';
            };
            const renderInfoBar = (c) => {
                infoBar.innerHTML = ""; // just clear, HTML not shown here anymore
            };

            // ──── 事件绑定 ────
            searchBtn.onclick = () => { if (_hotActive) { _hotActive = false; Object.assign(hotBtn.style, _DEF_STYLE); _currentForceTags = null; } doSearch(1); };


            const goToLastPage = () => {
                const tp = _totalPages || 0;
                if (tp <= 1) return;
                const isScore = String(_sortOrder || "").indexOf("score") === 0;
                const cap = isScore ? 1000 : 60;
                if (tp <= cap) doSearch(tp);
                else doSearch(1, null, false, false, true);
            };
            const goToPage = (p) => {
                p = parseInt(p, 10);
                if (!(p > 0)) return;
                if (_totalPages > 0 && p >= _totalPages) { goToLastPage(); return; }
                doSearch(p);
            };
            jumpBtn.onclick = () => { const p = parseInt(jumpInput.value, 10); if (p > 0) { jumpInput.value = ""; goToPage(p); } };
            lastBtn.onclick = () => goToLastPage();
            prevBtn.onclick = () => { if (_onTail) { doSearch(1); return; } doSearch(currentPage - 1); };
            nextBtn.onclick = () => doSearch(currentPage + 1);

            // ──── 注册 DOM Widget ────
            this.addDOMWidget("danbooru_browser_ui", "div", container, { onDraw: () => {} });

            // 右侧「参数/信息」栏打开时，ComfyUI 会按 DOM 实测宽度回写节点。
            // 这个大界面没有下限，宽度会被收成两百多像素并记住，图库就只剩一两列。
            var _dbGoodW = 800;
            function _dbReflowSpans() {
                try {
                    gridContainer.querySelectorAll(".db-img-card").forEach(function(_cd) {
                        var _im = _cd.querySelector("img");
                        if (_im && _im.clientHeight > 0) {
                            var _sp = Math.max(1, Math.ceil((_im.clientHeight + 6) / 16));
                            if (_cd.style.gridRowEnd !== "span " + _sp) _cd.style.gridRowEnd = "span " + _sp;
                        }
                    });
                } catch (e) {}
            }
            function _dbReadWidth() {
                var host = container.closest("[data-node-id]");
                var cssW = host ? (parseFloat(host.style.getPropertyValue("--node-width")) || 0) : 0;
                var boxW = host ? (host.offsetWidth || 0) : 0;
                var nodeW = (node.size && node.size[0]) || 0;
                var boxC = container.clientWidth || 0;
                var vals = [cssW, boxW, nodeW, boxC].filter(function(v) { return v > 40; });
                if (!vals.length) return 0;
                return Math.min.apply(null, vals);
            }
            function _dbApplyWidth(next) {
                if (node.size) node.size[0] = next;
                var host = container.closest("[data-node-id]");
                if (host) host.style.setProperty("--node-width", next + "px");
                var el = container.parentElement;
                if (el && el.style) {
                    var pw = parseFloat(el.style.width);
                    if (pw > 0 && pw < 420) el.style.width = next + "px";
                }
                try { node.setDirtyCanvas(true, true); } catch (e) {}
            }
            function _dbGuardWidth() {
                var host0 = container.closest("[data-node-id]");
                if (host0 && host0.getAttribute("data-collapsed") != null) return;
                var w = _dbReadWidth();
                if (w >= 640) { _dbGoodW = Math.round(w); return; }
                if (w >= 420 || !(w > 0)) return;
                _dbApplyWidth(_dbGoodW >= 640 ? _dbGoodW : 800);
                setTimeout(_dbReflowSpans, 80);
            }
            var _dbPrevResize = node.onResize;
            node.onResize = function(size) {
                var host = container.closest("[data-node-id]");
                var collapsed = host && host.getAttribute("data-collapsed") != null;
                if (size && size[0] >= 640) _dbGoodW = size[0];
                else if (!collapsed && size && size[0] > 0 && size[0] < 420) {
                    var next = _dbGoodW >= 640 ? _dbGoodW : 800;
                    size[0] = next;
                    this.size[0] = next;
                    if (host) host.style.setProperty("--node-width", next + "px");
                }
                if (typeof _dbPrevResize === "function") return _dbPrevResize.apply(this, arguments);
            };
            if (window.ResizeObserver) {
                var _dbRO = new ResizeObserver(function() { _dbGuardWidth(); });
                _dbRO.observe(container);
            }
            setTimeout(_dbGuardWidth, 250);
            setTimeout(_dbGuardWidth, 900);

            // 等 widget 值恢复后再读取
            // 预加载收藏数据，让 ⭐ 弹窗秒开
            _getFavs();
            setTimeout(() => {
                loadRatingState();
                loadNodeSettings();
                refreshFusionBar();
                doSearch(1);
                node.onResize?.();
            }, 100);
        };
    }
});
