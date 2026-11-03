import { app } from "/scripts/app.js";
import "./00_anima_i18n.js";
import { $el } from "/scripts/ui.js";
import "./00_anima_queue_snapshot.js?v=3";
import "./00_anima_theme.js";
import "./00_anima_fav_grid.js";
import "./anima_collapse_outputs.js";

console.log("=== GELBOORU_FULL_V3 ===");

let _favCache = null;
let _favPopupOpen = false;
let _tagCache = {};
let _tagTransCache = {};

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

let _globalTrans = {};
let _blacklist = new Set((localStorage.getItem("gel_blacklist")||"").split(/[,，\s]+/).filter(Boolean));
let _settingsCache = null;
async function _getSettings() { if(_settingsCache)return _settingsCache; try{const r=await fetch("/gelbooru_anima/settings");const d=await r.json();_settingsCache=d.settings||{};}catch{_settingsCache={};} return _settingsCache; }
_getSettings();
let _useOriginal = localStorage.getItem("gel_original") === "1";
let _storedSort = localStorage.getItem("gel_sort") || "";
let _storedRatings = JSON.parse(localStorage.getItem("gel_ratings") || "[]");
let _settingsOpen = false;
let _excludeImgTags = localStorage.getItem("gel_exclude_img_tags") || "";
function _filterBlacklist(tagsStr) { return tagsStr.split(/[ ,]+/).filter(t => t && !_blacklist.has(t.toLowerCase())).join(', '); }

// ── 关闭页面时主动释放大引用，加快卸载（防关闭卡死） ──
window.addEventListener("pagehide", () => {
    try {
        // 清空各浏览器节点的全局注册表
        window._dbVisPollers = [];
        window._dbAcCloseFns = [];
        // 清空模块级大缓存
        _favCache = null;
        _tagCache = {};
        _tagTransCache = {};
        _globalTrans = {};
        _settingsCache = null;
    } catch(e) {}
});

async function _getFavs(force) {
    if (!force && _favCache) return _favCache;
    try {
        const r = await fetch("/gelbooru_anima/favorites");
        const d = await r.json();
        _favCache = d.favorites || {};
    } catch { _favCache = {}; }
    return _favCache;
}

function _gelFavClassifiedExtra(post) {
    const extra = {};
    extra.cache_classified = typeof window.animaFavAutoCacheOn === "function" && window.animaFavAutoCacheOn("gel");
    if (!post || !extra.cache_classified) return extra;
    const cls = post.classified || (post.id != null ? _tagCache[post.id] : null);
    if (cls && typeof cls === "object") {
        if (Array.isArray(cls.series)) extra.series = cls.series;
        if (Array.isArray(cls.character)) extra.character = cls.character;
        if (Array.isArray(cls.artist)) extra.artist = cls.artist;
    }
    const tr = post.translations || (post.id != null ? _tagTransCache[post.id] : null);
    if (tr && typeof tr === "object") extra.translations = tr;
    return extra;
}

(async () => {
    try {
        if (typeof window.animaSyncUiLang === "function") window.animaSyncUiLang();
    } catch {}
    // 预加载收藏夹数据
    _getFavs();
})();

app.registerExtension({
    name: "Comfy.GelbooruBrowser",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "GelbooruBrowser") return;
        window.hookAnimaNodeChrome(nodeType);
        console.log("[Gelbooru] MATCHED - building UI");

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            const node = this;
            window.applyAnimaNodeChrome(this);
            this.setSize([800, 1150]);  // 默认尺寸：与 D 站浏览器一致（9 个输出端口占顶部空间）
            try {
                this.title = (typeof animaTxt === "function") ? animaTxt("G站浏览器 (Gelbooru Browser)") : "G站浏览器 (Gelbooru Browser)";
            } catch {}
            // 清除残留融合数据
            const tfw = node.widgets?.find(w => w.name === "_tag_fusion");
            const adQWidget = node.widgets?.find(w => w.name === "来自AnimaDex");
            if (adQWidget) { adQWidget.computeSize = () => [0, 0]; adQWidget.serialize = true; try { adQWidget.hidden = true; } catch(e){} }
            if (tfw && tfw.value !== "{}") tfw.value = "{}";
            // 延迟再清一次：ComfyUI 在 onNodeCreated 之后异步恢复工作流的 widget 值（会覆盖上面的清理）
            setTimeout(() => {
// clampPopup：把弹窗限制在视口内（拖拽/恢复位置时调用，防止拖出页面卡死）
if (typeof window.clampPopup !== "function") {
    window.clampPopup = function(el) {
        try {
            const w = el.offsetWidth || 400, h = el.offsetHeight || 300;
            const m = 10;
            let L = parseInt(el.style.left) || 0, T = parseInt(el.style.top) || 0;
            const maxL = window.innerWidth - w - m, maxT = window.innerHeight - h - m;
            if (L < m) L = m;
            if (T < m) T = m;
            if (L > maxL) L = Math.max(m, maxL);
            if (T > maxT) T = Math.max(m, maxT);
            el.style.left = L + "px";
            el.style.top = T + "px";
        } catch(e) {}
    };
}
 try { const _tfw2 = node.widgets?.find(w => w.name === "_tag_fusion"); if (_tfw2 && _tfw2.value !== "{}") _tfw2.value = "{}"; } catch(e){} }, 400);
            console.log("[Gelbooru] onNodeCreated called, node id=", node.id);

            try {
                // Hide native widgets
                ["selection_data","search_tags","rating_filter","page","page_size","blacklist","_tag_fusion","node_settings"].forEach(name => {
                    const w = node.widgets?.find(x => x.name === name);
                    if (w) { w.computeSize = () => [0,0]; w.serialize = true; try { w.hidden = true; } catch(e){} }
                });

                let _page = 1, _results = [], _selectedPost = null, _totalPages = 0, _usePid = false;
                let _activeRatings = new Set(_storedRatings), _sortOrder = _storedSort;
                let _multiEnabled = false, _multiSelected = new Set();
                let _tagFusionEnabled = false, _fusionActiveSlot = 1;
                let _fusionSlots = { 1: new Set(), 2: new Set(), 3: new Set() };
                let _sync12 = false;
                let _nextDisabled = false;
                function _savePortsCollapsed() {
                    try {
                        if (!node.properties) node.properties = {};
                        node.properties.anima_ports_collapsed = !!node._animaPortsCollapsed;
                    } catch(e) {}
                    try {
                        const w = node.widgets?.find(x => x.name === "node_settings");
                        if (w) {
                            let s = {};
                            try { s = JSON.parse(w.value || "{}") || {}; } catch(e2) { s = {}; }
                            s.ports_collapsed = !!node._animaPortsCollapsed;
                            w.value = JSON.stringify(s);
                        }
                    } catch(e3) {}
                    node.isChanged = true;
                }
                function _readPortsCollapsed() {
                    try {
                        const w = node.widgets?.find(x => x.name === "node_settings");
                        if (w && w.value) {
                            const s = JSON.parse(w.value || "{}");
                            if (s.ports_collapsed !== undefined) return !!s.ports_collapsed;
                        }
                    } catch(e) {}
                    try { return !!(node.properties && node.properties.anima_ports_collapsed); } catch(e2) { return false; }
                }
                if (typeof window.hookAnimaCollapseOutputs === "function") {
                    window.hookAnimaCollapseOutputs(node, {
                        onChange: function(c) {
                            _savePortsCollapsed();
                        },
                        readStored: _readPortsCollapsed
                    });
                }

                const container = $el("div", { className: "gel-browser-root", style: { width:"100%",height:"100%",display:"flex",flexDirection:"column",background:"linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)" } });
                if (typeof window.animaShieldDomWidget === "function") window.animaShieldDomWidget(container);
                if (typeof window.applyAnimaPanelGlow === "function") window.applyAnimaPanelGlow(container);
                if (typeof window.animaMakePortsChromeToggle === "function") container.appendChild(window.animaMakePortsChromeToggle(node));
            // ── 卡片 hover 交互样式（默认隐藏，悬停浮现；隐藏时不可点击） ──
            try {
                if (!document.getElementById("gel-hover-style")) {
                    const _st = document.createElement("style");
                    _st.id = "gel-hover-style";
                    _st.textContent = ".gel-img-card .gel-hover,.gel-fav-card .gel-hover{opacity:0;pointer-events:none;transition:opacity .15s ease;}.gel-img-card:hover .gel-hover,.gel-fav-card:hover .gel-hover{opacity:1;pointer-events:auto;}"
                        + ".gel-img-card,.gel-fav-card{user-select:none;-webkit-user-drag:none;}"
                        + ".gel-img-card:active,.gel-fav-card:active{transform:none!important;}"
                        + ".gel-browser-root button:hover{filter:brightness(1.3);transform:translateY(-1px);transition:all .12s ease;}"
                        + ".gel-browser-root span[style*=\"cursor: pointer\"]:hover,.gel-browser-root span[style*=\"cursor:pointer\"]:hover{filter:brightness(1.3);transform:translateY(-1px);transition:all .12s ease;}"
                        + ".gel-img-card:hover{filter:brightness(1.12);transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,0.5);}"
                        + ".gel-img-card .gel-hover:hover,.gel-fav-card .gel-hover:hover{background:rgba(var(--anima-accent-rgb),0.25);border-radius:4px;}"
                        + ".gel-act-row{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:space-evenly;padding:16px 2px 7px;z-index:5;opacity:0;pointer-events:none;transition:opacity .15s ease;background:linear-gradient(transparent,rgba(0,0,0,0.55));}"
                        + ".gel-img-card:hover .gel-act-row{opacity:1;pointer-events:auto;}"
                        + ".gel-act{flex:1;text-align:center;cursor:pointer;font-size:20px;line-height:1;user-select:none;filter:drop-shadow(0 0 3px rgba(0,0,0,.8));}"
                        + ".gel-act:hover{transform:translateY(-1px);filter:drop-shadow(0 0 4px rgba(0,0,0,.95)) brightness(1.3);}";
                    document.head.appendChild(_st);
                }
            } catch(e) {}
            let _gelLoading = false;
            let _gelSearchGen = 0;
            // Gelbooru 翻页用 id:<N 标签游标（D站画廊同款）：每页记录起始游标（向前翻页用），_lastPageId 为当前页最后一张 id
            let _pageCursors = {1: ""};
            let _lastPageId = 0;
            let _seenIds = new Set();  // 已渲染帖子 id（前端去重兜底）
            let _imgHCache = {};       // postId -> 图片实际渲染高度（onload 记录，重画时同步恢复避免闪烁）

                // Search bar
                const searchBar = $el("div", { style: { display:"flex",gap:"6px",padding:"6px 8px",borderBottom:"1px solid var(--anima-line)",flexShrink:0 } });
                const searchInput = $el("input", { type:"text",placeholder:animaTxt("搜索标签（空格分隔，中英文均可）"), style: { flex:1,padding:"8px 12px",border:"none",background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",color:"#e0e0e0",fontSize:"16px",outline:"none",borderRadius:"4px" } });
                const searchBtn = $el("button", { textContent:"🔍", style: { padding:"9px 16px",border:"none",background:"var(--anima-line)",color:"var(--anima-accent-soft)",cursor:"pointer",borderRadius:"4px",fontSize:"18px" }, onclick: () => { _page = 1; _nextDisabled = false; _usePid = false; doSearch(); } });
                searchBar.appendChild(searchInput);
                searchBar.appendChild(searchBtn);
                // ── 语义搜索（🧠，共用后端 vec_search）──
                const _SEM_STYLE = { border: "2px solid var(--anima-accent-soft)", boxShadow: "0 0 12px color-mix(in srgb, var(--anima-accent-soft) 40%, transparent)" };
                const _SEM_DEF_STYLE = { border: "none", boxShadow: "none" };
                let _semanticActive = false, _vecReady = false, _vecInitPromise = null;
                const _showInitDialog = (msg) => new Promise(resolve => {
                    const mask = $el("div", { style: { position:"fixed",inset:0,zIndex:99999,background:"transparent",display:"flex",alignItems:"center",justifyContent:"center" } });
                    const box = $el("div", { style: { background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",border:"1px solid var(--anima-line)",borderRadius:"12px",padding:"24px 28px",maxWidth:"400px",textAlign:"center",boxShadow:"0 8px 32px rgba(0,0,0,0.5)" } });
                    const pp = $el("p", { textContent: msg, style: { color:"var(--anima-mute)",fontSize:"13px",lineHeight:1.8,whiteSpace:"pre-wrap",marginBottom:"16px" } });
                    const btnRow = $el("div", { style: { display:"flex",gap:"10px",justifyContent:"center" } });
                    const noBtn = $el("button", { textContent:animaTxt("取消"), style: { padding:"6px 18px",borderRadius:"6px",border:"none",background:"var(--anima-line)",color:"var(--anima-mute)",cursor:"pointer",fontSize:"13px" }, onclick: () => { mask.remove(); resolve(false); } });
                    const yesBtn = $el("button", { textContent:"开始", style: { padding:"6px 18px",borderRadius:"6px",border:"none",background:"linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi))",color:"#ffffff",cursor:"pointer",fontSize:"13px",fontWeight:"bold" }, onclick: () => { mask.remove(); resolve(true); } });
                    btnRow.appendChild(noBtn); btnRow.appendChild(yesBtn);
                    box.appendChild(pp); box.appendChild(btnRow); if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(box); mask.appendChild(box);
                    document.body.appendChild(mask);
                });
                const _ensureVecReady = async () => {
                    if (_vecReady) return true;
                    const stR = await fetch("/danbooru_anima/vec_status");
                    const stD = await stR.json();
                    if (stD.ready) { _vecReady = true; return true; }
                    if (stD.error) return false;
                    if (stD.deps_ok === false) {
                        const depsTxt = (stD.deps_required || ["sentence-transformers", "torch"]).join(" ");
                        await _showInitDialog(
                            "⚠️ 语义搜索缺少依赖\n\n检测到未安装: " + depsTxt + "\n\n" +
                            "请先在 ComfyUI 的 python 环境中安装：\n" +
                            "pip install sentence-transformers torch\n\n" +
                            "安装完成后重启 ComfyUI，再点 🧠 使用语义搜索。"
                        );
                        return false;
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
                const semBtn = $el("button", {
                    textContent: "🧠", title: animaTxt("语义搜索（E5-Small）"),
                    style: { padding: "9px 14px", borderRadius: "6px", border: "none", background: "transparent", color: "var(--anima-accent-soft)", cursor: "pointer", fontSize: "16px" }
                });
                semBtn.onclick = async () => {
                    if (!_semanticActive) {
                        // 首次开启语义搜索 → 检查引擎（加载中给视觉反馈，避免误以为坏了）
                        semBtn.textContent = "⏳";
                        semBtn.disabled = true;
                        semBtn.title = "语义搜索加载中...";
                        try {
                            const ready = await _ensureVecReady();
                            if (!ready) { semBtn.textContent = "🧠"; semBtn.title = animaTxt("语义搜索（E5-Small）"); return; }
                        } finally {
                            semBtn.disabled = false;
                            if (!_semanticActive) { semBtn.textContent = "🧠"; semBtn.title = animaTxt("语义搜索（E5-Small）"); }
                        }
                    }
                    _semanticActive = !_semanticActive;
                    Object.assign(semBtn.style, _semanticActive ? _SEM_STYLE : _SEM_DEF_STYLE);
                    searchInput.placeholder = _semanticActive ? "🔮 输入中文/英文，语义匹配标签..." : "搜索标签（空格分隔，中英文均可）";
                    if (!_semanticActive) { acList.style.display = "none"; }
                };
                searchBar.appendChild(semBtn);
                // 强制刷新（加载最新图片）：清空搜索框 + 重置到第 1 页（G 站后端无缓存，真实请求）
                const refreshBtn = $el("button", { textContent: "🔄", title: "强制刷新（加载最新图片）", style: { padding: "9px 14px", border: "none", background: "transparent", color: "var(--anima-accent-soft)", cursor: "pointer", fontSize: "16px" } });
                refreshBtn.onclick = async () => {
                    searchInput.value = "";
                    _page = 1; _nextDisabled = false; _pageCursors = {}; _lastPageId = 0; _seenIds = new Set();
                    refreshBtn.textContent = "⟳"; refreshBtn.style.pointerEvents = "none";
                    try { await doSearch(); } catch(e) {}
                    refreshBtn.textContent = "🔄"; refreshBtn.style.pointerEvents = "";
                };
                const bmBtn = $el("button", { textContent: "🔖", title: animaTxt("书签"), style: { padding: "9px 12px", border: "none", background: "transparent", color: "var(--anima-accent-soft)", cursor: "pointer", fontSize: "16px" } });
                bmBtn.onclick = function() { if (window.animaBm) window.animaBm.show("gelbooru", _openGelBookmark); };
                searchBar.appendChild(bmBtn);
                searchBar.appendChild(refreshBtn);
                container.appendChild(searchBar);

                // Auto-complete dropdown
                const acList = $el("div", { style: { display:"none",maxHeight:"180px",overflowY:"auto",background:"linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)",borderBottom:"1px solid var(--anima-line)",flexShrink:0 } });
                container.appendChild(acList);

                // Filter bar
                const _ratingChips = {};
                const filterBar = $el("div", { style: { display:"flex",gap:"8px",padding:"4px 10px",borderBottom:"1px solid var(--anima-line)",background:"linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)",flexShrink:0,flexWrap:"wrap",alignItems:"center" } });
                [{v:"general",l:"🟢普通",c:"#6ee7b7"},{v:"sensitive",l:"🟡敏感",c:"#fbbf24"},{v:"questionable",l:"🟠擦边",c:"#f87171"},{v:"explicit",l:"🔴R18",c:"#f87171"}].forEach(r => {
                    const chip = $el("span", { textContent:r.l, style: { padding:"2px 8px",borderRadius:"3px",cursor:"pointer",fontSize:"12px",background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",color:r.c,border:"1px solid transparent",userSelect:"none" },
                        onclick: () => {
                            if (_activeRatings.has(r.v)) { _activeRatings.delete(r.v); chip.style.background="linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)"; chip.style.border="1px solid transparent"; }
                            else { _activeRatings.add(r.v); chip.style.background=r.c+"33"; chip.style.border="1px solid "+r.c; }
                            localStorage.setItem("gel_ratings",JSON.stringify([..._activeRatings]));
                            _page = 1; _nextDisabled = false; doSearch();
                        }
                    });
                    _ratingChips[r.v] = chip;
                    // 恢复存储的分级状态
                    if (_activeRatings.has(r.v)) { chip.style.background=r.c+"33"; chip.style.border="1px solid "+r.c; }
                    filterBar.appendChild(chip);
                });
                [{v:"",l:"🕐时间"},{v:"score:desc",l:"⭐评分"}].forEach(s => {
                    const btn = $el("span", { textContent:s.l, style: { padding:"2px 10px",borderRadius:"3px",cursor:"pointer",fontSize:"12px",background:s.v===_sortOrder?"var(--anima-line)":"var(--anima-bg-deep)",color:s.v===_sortOrder?"var(--anima-accent-soft)":"#aaa",userSelect:"none" },
                        onclick: () => { _sortOrder = s.v; localStorage.setItem("gel_sort",_sortOrder); filterBar.querySelectorAll(".sort-btn").forEach(b=>{b.style.background="linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)";b.style.color="#aaa"}); btn.style.background="var(--anima-line)"; btn.style.color="var(--anima-accent-soft)"; btn.classList.add("sort-btn"); _page=1; _nextDisabled=false; _usePid=false; _pageCursors={1:""}; _lastPageId=0; doSearch(); }
                    });
                    btn.classList.add("sort-btn");
                    filterBar.appendChild(btn);
                });
                const multiBtn = $el("span", { textContent:animaTxt("☐多选"), style: { padding:"2px 10px",borderRadius:"3px",cursor:"pointer",fontSize:"12px",background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",color:"#aaa",userSelect:"none",marginLeft:"auto" },
                    onclick: () => { _multiEnabled=!_multiEnabled; multiBtn.textContent=_multiEnabled?animaTxt("☑多选(开)"):animaTxt("☐多选"); _multiSelected.clear(); if(_multiEnabled){_tagFusionEnabled=false;fusionBtn.textContent=animaTxt("🔀分序号");fusionBar.style.display="none";_fusionSlots={1:new Set(),2:new Set(),3:new Set()};writeFusionWidget();} _selectedPost=null; updateSelectedBar(); renderGrid(); } });
                // 分序号融合按钮
                const fusionBtn = $el("span", { textContent:animaTxt("🔀分序号"), style: { padding:"2px 10px",borderRadius:"3px",cursor:"pointer",fontSize:"12px",background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",color:"#aaa",userSelect:"none",marginLeft:"4px" },
                    onclick: () => { _tagFusionEnabled=!_tagFusionEnabled; fusionBtn.textContent=_tagFusionEnabled?animaTxt("🔀融合(开)"):animaTxt("🔀分序号"); if(_tagFusionEnabled){_multiEnabled=false;multiBtn.textContent=animaTxt("☐多选");_multiSelected.clear();_selectedPost=null;_fusionSlots={1:new Set(),2:new Set(),3:new Set()};_fusionActiveSlot=1;const sw=node.widgets?.find(w=>w.name==="selection_data");if(sw)sw.value="";writeFusionWidget();} else { const fw=node.widgets?.find(w=>w.name==="_tag_fusion"); if(fw)fw.value="{}"; } fusionBar.style.display=_tagFusionEnabled?"flex":"none"; updateSelectedBar(); updateSlotBtnStyles(); renderGrid(); } });
                filterBar.appendChild(fusionBtn);
                const favBtn = $el("span", { textContent:"⭐收藏", style: { padding:"2px 10px",borderRadius:"3px",cursor:"pointer",fontSize:"12px",background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",color:"#fbbf24",userSelect:"none" }, onclick:showFavPopup });
                const setBtn = $el("span", { textContent:"⚙️", style: { padding:"2px 10px",borderRadius:"3px",cursor:"pointer",fontSize:"12px",background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",color:"#aaa",userSelect:"none" }, onclick:showSettingsPopup });
                filterBar.appendChild(multiBtn);
                filterBar.appendChild(favBtn);
                filterBar.appendChild(setBtn);
                // ⊘ 排除图片开关
                let _excludeEnabled = !!_excludeImgTags;
                const exclToggle = $el("span", { textContent:"⊘", title:"排除图片过滤:"+(_excludeEnabled?"开":"未设置"), style: { padding:"2px 8px",borderRadius:"3px",cursor:"pointer",fontSize:"12px",background:_excludeEnabled?"#f8717133":"var(--anima-bg-deep)",color:_excludeEnabled?"#f87171":"#aaa",userSelect:"none" },
                    onclick: () => { if(!_excludeImgTags){showSettingsPopup();return;} _excludeEnabled=!_excludeEnabled; exclToggle.style.background=_excludeEnabled?"#f8717133":"var(--anima-bg-deep)"; exclToggle.style.color=_excludeEnabled?"#f87171":"#aaa"; exclToggle.title="排除图片过滤:"+(_excludeEnabled?"开":"关"); if(!_excludeEnabled){localStorage.setItem("gel_exclude_disabled","1");}else{localStorage.removeItem("gel_exclude_disabled");} _page=1;doSearch();} });
                filterBar.appendChild(exclToggle);
                // 恢复排除开关状态
                if (localStorage.getItem("gel_exclude_disabled")==="1") _excludeEnabled = false;
                container.appendChild(filterBar);

                // Page bar
                const pageBar = $el("div", { style: { display:"flex",gap:"6px",padding:"4px 10px",borderBottom:"1px solid var(--anima-line)",background:"linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)",flexShrink:0,justifyContent:"center",alignItems:"center" } });
                const prevBtn = $el("span", { textContent:"◀上一页", style: { padding:"3px 10px",borderRadius:"3px",cursor:"pointer",fontSize:"12px",background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",color:"#aaa",userSelect:"none" }, onclick:()=>{if(_page>1){_page--;doSearch();}} });
                const pageLabel = $el("span", { textContent:"第1页", style: { fontSize:"12px",color:"#aaa",minWidth:"88px",textAlign:"center" } });
                const nextBtn = $el("span", { textContent:"下一页▶", style: { padding:"3px 10px",borderRadius:"3px",cursor:"pointer",fontSize:"12px",background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",color:"#aaa",userSelect:"none" }, onclick:()=>{ if(!_nextDisabled){_page++;_pageCursors[_page]=_lastPageId;doSearch();} } });
                const jumpInput = $el("input", { type:"number", min:"1", placeholder:"页码", style: { width:"52px",padding:"3px 6px",borderRadius:"3px",border:"1px solid var(--anima-line)",background:"linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)",color:"#e0e0e0",fontSize:"12px",outline:"none" } });
                const jumpBtn = $el("span", { textContent:animaTxt("跳页"), style: { padding:"3px 10px",borderRadius:"3px",cursor:"pointer",fontSize:"12px",background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",color:"var(--anima-accent-soft)",userSelect:"none" } });
                const lastBtn = $el("span", { textContent:animaTxt("尾页"), title:animaTxt("跳到最后一页"), style: { padding:"3px 10px",borderRadius:"3px",cursor:"pointer",fontSize:"12px",background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",color:"var(--anima-accent-soft)",userSelect:"none" } });
                pageBar.appendChild(prevBtn); pageBar.appendChild(pageLabel); pageBar.appendChild(nextBtn); pageBar.appendChild(jumpInput); pageBar.appendChild(jumpBtn); pageBar.appendChild(lastBtn);
                container.appendChild(pageBar);


                // Fusion toolbar
                const fusionBar = $el("div", { style: { display:"none",flexWrap:"wrap",gap:"4px",padding:"4px 0",alignItems:"center",borderBottom:"1px solid var(--anima-line)",marginBottom:"4px" } });
                fusionBar.appendChild($el("span",{textContent:"分序号:",style:{color:"#f87171",fontSize:"12px",fontWeight:"bold",marginRight:"4px"}}));
                const slotBtns = {};
                const slotColors = {1:"var(--anima-accent-soft)",2:"#f87171",3:"#6ee7b7"};
                [1,2,3].forEach(s => {
                    const sb = $el("span",{textContent:s,style:{width:"28px",height:"28px",display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:"50%",cursor:"pointer",fontSize:"14px",fontWeight:"bold",border:"2px solid "+slotColors[s],color:slotColors[s],background:"transparent",userSelect:"none"},
                        onclick:()=>{_fusionActiveSlot=s;updateSlotBtnStyles();}});
                    slotBtns[s] = sb; fusionBar.appendChild(sb);
                });
                const syncBtn = $el("span",{textContent:"🔗",title:"2号同步1号",style:{cursor:"pointer",fontSize:"14px",userSelect:"none",opacity:"0.5"},onclick:()=>{_sync12=!_sync12;syncBtn.style.opacity=_sync12?"1":"0.5";if(_sync12){_fusionSlots[2]=new Set(_fusionSlots[1]);updateSlotBtnStyles();renderGrid();}}});
                fusionBar.appendChild(syncBtn);
                fusionBar.appendChild($el("span",{textContent:"✕清空",style:{padding:"2px 6px",cursor:"pointer",fontSize:"11px",color:"#f87171",userSelect:"none"},onclick:()=>{_fusionSlots[_fusionActiveSlot].clear();updateSlotBtnStyles();writeFusionWidget();renderGrid();}}));
                fusionBar.appendChild($el("span",{textContent:"✕✕全部",style:{padding:"2px 6px",cursor:"pointer",fontSize:"11px",color:"#f87171",userSelect:"none"},onclick:()=>{_fusionSlots={1:new Set(),2:new Set(),3:new Set()};updateSlotBtnStyles();writeFusionWidget();renderGrid();}}));
                const slotCounter = $el("span",{style:{color:"#aaa",fontSize:"11px",marginLeft:"4px"}});
                fusionBar.appendChild(slotCounter);
                // 稍后在 gridContainer 定义后插入
                function _insertFusionBar() { container.insertBefore(fusionBar, gridContainer); }
                
                function updateSlotBtnStyles() {
                    [1,2,3].forEach(s => {
                        const active = _fusionActiveSlot===s;
                        slotBtns[s].style.background = active ? slotColors[s] : "transparent";
                        slotBtns[s].style.color = active ? "#fff" : slotColors[s];
                    });
                    slotCounter.textContent = animaTxt("1号:")+_fusionSlots[1].size+" | 2号:"+_fusionSlots[2].size+" | 3号:"+_fusionSlots[3].size;
                }
                function writeFusionWidget() {
                    const fw = node.widgets?.find(w=>w.name==="_tag_fusion");
                    if (!fw) return;
                    const postMap = {};
                    _results.forEach(p => { postMap[String(p.id)] = p; });
                    const slotsData = {};
                    [1,2,3].forEach(s => {
                        slotsData[String(s)] = [..._fusionSlots[s]].map(pid => {
                            const p = postMap[pid];
                            return p ? {
                                id: p.id,
                                tags: p.tags||"",
                                file_url: p.file_url||"",
                                sample_url: p.sample_url||"",
                                preview_url: p.preview_url||"",
                                classified: _tagCache[p.id]||p.classified||{},
                            } : {id: parseInt(pid), tags:"", file_url:"", sample_url:"", preview_url:"", classified:{}};
                        });
                    });
                    const _allEmpty = [1,2,3].every(s => _fusionSlots[s].size === 0);
                    fw.value = _allEmpty ? "{}" : JSON.stringify(slotsData);
                }

                // Grid
                const gridContainer = $el("div", { style: { flex:1,overflowY:"auto",display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))",gridAutoRows:"10px",gap:"6px",padding:"6px",alignContent:"start" } });
                // ── 无限加载：滚动接近底部自动加载下一页（与 D 站浏览器一致） ──
                const _gelIO = new IntersectionObserver((entries) => {
                    for (const _en of entries) {
                        if (!_en.isIntersecting) continue;
                            const _im = _en.target;
                            const _hd = _im && _im.dataset ? _im.dataset.hd : "";
                            if (window.__animaGalleryPtrDown) continue;
                            if (_hd && _im.getAttribute("src") !== _hd) { _im.src = _hd; }
                            _gelIO.unobserve(_im);
                    }
                }, { root: gridContainer, rootMargin: "200px 0px", threshold: 0.01 });

                // ── DOM 滑动窗口回收（学 D站画廊成熟方案）──
                // 保留最近 ~100 页(4200张)，超出后从最老端回收，"浏览多少回收多少"。
                // 保护视口锚点 + 选中卡片，同步裁剪 _results 前缀，回收后补偿滚动位置防跳动。
                const _MAX_GEL_KEPT = 4200; // ~100 页 @ 42/页
                const _recycleGelItems = () => {
                    try {
                        if (window.__animaGalleryPtrDown) return;
                        const _children = gridContainer.children;
                        const _overflow = _children.length - _MAX_GEL_KEPT;
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
                            // 保护选中卡片（多选 / 单选 _selectedPost）
                            const _gpid = _el.dataset ? _el.dataset.postid : "";
                            if (_gpid && _selectedPost && String(_selectedPost.id) === _gpid) break;
                            // 先 unobserve 图片，再移除
                            try {
                                _el.querySelectorAll("img").forEach(_im2 => { try { if (_gelIO) _gelIO.unobserve(_im2); } catch(e){} });
                            } catch(e) {}
                            gridContainer.removeChild(_el);
                            _removed++;
                        }
                        if (_removed <= 0) return;

                        // 同步缩短 _results 前缀，保持与 DOM 一一对应（recycle 不变式）
                        if (Array.isArray(_results) && _results.length >= _removed) {
                            const _dropped = _results.slice(0, _removed);
                            _results.splice(0, _removed);
                            // 同步清理去重 Set 与高度/标签缓存，释放内存（防关闭页面卡死）
                            _dropped.forEach(p => {
                                if (!p) return;
                                // 不从 _seenIds 删除：回收只是卸 DOM，若 API 再把旧 id 送回来仍应跳过，否则收藏红心图会在下方重复出现
                                if (typeof _imgHCache !== "undefined") delete _imgHCache[p.id];
                            });
                        }

                        // 补偿滚动位置：回收后用锚点重新定位，避免视口跳动
                        if (_anchorEl && _anchorEl.isConnected) {
                            const _newTop = _anchorEl.getBoundingClientRect().top - gridContainer.getBoundingClientRect().top;
                            gridContainer.scrollTop += (_newTop - _anchorOffset);
                        }
                    } catch(e) {}
                };

                const _gelLoadMore = () => {
                    if (_gelLoading || _nextDisabled) return;
                    // 张数比例法（地藏画廊同款）：前方缓冲不足才加载，不依赖像素高度
                    const _total = gridContainer.querySelectorAll(".gel-img-card").length;
                    if (_total === 0) return;
                    const _sh = gridContainer.scrollHeight || 1;
                    const _ratio = Math.min(1, (gridContainer.scrollTop + gridContainer.clientHeight) / _sh);
                    const _viewed = Math.floor(_total * _ratio);
                    const _ahead = _total - _viewed;
                    if (_ahead >= 40) return;
                    _gelLoading = true;
                    _page++;
                    doSearch(true);
                };
                let _gelPageTimer = null;
                const _gelUpdatePage = () => {
                    try {
                        const _gr = gridContainer.getBoundingClientRect();
                        const _first = Array.from(gridContainer.querySelectorAll(".gel-img-card")).find(ch => {
                            const _r = ch.getBoundingClientRect();
                            return _r.bottom > _gr.top && _r.top < _gr.bottom;
                        });
                        if (_first && _first.dataset.galleryPage) pageLabel.textContent = _totalPages ? (animaTxt("第") + _first.dataset.galleryPage + " / " + _totalPages + animaTxt("页")) : (animaTxt("第") + _first.dataset.galleryPage + animaTxt("页"));
                    } catch(e) {}
                };
                gridContainer.addEventListener("scroll", () => {
                    try {
                        if (gridContainer.scrollHeight - (gridContainer.scrollTop + gridContainer.clientHeight) < 800) _gelLoadMore();
                    } catch(e) {}
                    clearTimeout(_gelPageTimer);
                    _gelPageTimer = setTimeout(_gelUpdatePage, 150);
                });
                // 轮询兜底：内容不足一屏或滚动过快时自动补货
                // 页面隐藏时暂停（对齐地藏画廊：后台不加载，切回不卡）
                let _gelPollTimer = null;
                const _gelStartPoll = () => {
                    if (_gelPollTimer) return;
                    _gelPollTimer = setInterval(() => {
                        if (document.hidden) return;
                        try {
                            if (gridContainer.scrollHeight - (gridContainer.scrollTop + gridContainer.clientHeight) < 800) _gelLoadMore();
                        } catch(e) {}
                    }, 2000);
                };
                const _gelStopPoll = () => {
                    if (_gelPollTimer) { clearInterval(_gelPollTimer); _gelPollTimer = null; }
                };
                _gelStartPoll();
                // 节点删除时清理轮询（防累积泄漏）
                if (!node._gelPollCleaned) {
                    node._gelPollCleaned = true;
                    node.onRemoved = node.onRemoved || function() {
                        if (typeof _gelStopPoll === "function") _gelStopPoll();
                        try { if (node._gelAdTimer) clearInterval(node._gelAdTimer); } catch(e) {}
                        try { if (node._gelAdexTimer) clearInterval(node._gelAdexTimer); } catch(e) {}
                        // 从全局 visibilitychange 注册表移除（防累积）
                        try {
                            const _list = window._dbVisPollers || [];
                            const _ix = _list.indexOf(node._gelVisEntry);
                            if (_ix >= 0) _list.splice(_ix, 1);
                        } catch(e) {}
                        // 从全局 acList 关闭注册表移除（防累积）
                        try {
                            const _list2 = window._dbAcCloseFns || [];
                            const _ix2 = _list2.indexOf(node._gelAcCloseFn);
                            if (_ix2 >= 0) _list2.splice(_ix2, 1);
                        } catch(e) {}
                    };
                }
                // visibilitychange 全局单例（与 D站共用注册表，防每节点累积）
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
                node._gelVisEntry = { start: _gelStartPoll, stop: _gelStopPoll };
                window._dbVisPollers.push(node._gelVisEntry);
            // ── 来自AnimaDex 监听 ──
            let _prevAdQ = "";
            node._gelAdTimer = setInterval(() => {
                if (!adQWidget || !searchInput) return;
                const q = (adQWidget.value || "").trim();
                if (q && q !== _prevAdQ) {
                    _prevAdQ = q;
                    searchInput.value = q;
                    if (typeof doSearch === "function") doSearch();
                    adQWidget.value = "";
                }
            }, 500);

                container.appendChild(gridContainer);
                _insertFusionBar();

                // Selected bar
                const selectedBar = $el("div", { style: { display:"none",padding:"6px 10px",borderTop:"1px solid var(--anima-line)",background:"linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)",flexShrink:0,alignItems:"center",gap:"8px" } });
                const selectedLabel = $el("span", { style: { fontSize:"12px",color:"var(--anima-accent-soft)" } });
                const clearBtn = $el("span", { textContent:"✕清除", style: { padding:"2px 10px",borderRadius:"3px",cursor:"pointer",fontSize:"12px",background:"#f87171",color:"#fff",userSelect:"none" }, onclick: ()=>{_selectedPost=null;_multiSelected.clear();_fusionSlots={1:new Set(),2:new Set(),3:new Set()};const sw=node.widgets?.find(w=>w.name==="selection_data");if(sw)sw.value="";updateSlotBtnStyles();writeFusionWidget();updateSelectedBar();renderGrid();} });
                selectedBar.appendChild(selectedLabel); selectedBar.appendChild(clearBtn);
                container.appendChild(selectedBar);

                node.addDOMWidget("gelbooru_browser_ui", "div", container, { onDraw: () => {} });
                console.log("[Gelbooru] UI widget added");
                setTimeout(function(){
                    try {
                        if (typeof node._animaApplyPortsFromStore === "function") node._animaApplyPortsFromStore();
                        try { if (typeof node._animaSyncPortsChrome === "function") node._animaSyncPortsChrome(); } catch(e2) {}
                    } catch(e) {}
                }, 150);
                setTimeout(function(){
                    try {
                        if (typeof node._animaApplyPortsFromStore === "function") node._animaApplyPortsFromStore();
                        try { if (typeof node._animaSyncPortsChrome === "function") node._animaSyncPortsChrome(); } catch(e2) {}
                    } catch(e) {}
                }, 280);

                // Search function
                const goToGelPage = (p) => {
                    p = parseInt(p, 10);
                    if (!(p > 0)) return;
                    if (_totalPages > 0) p = Math.min(p, _totalPages);
                    _page = Math.max(1, p);
                    _usePid = true;
                    _nextDisabled = false;
                    doSearch();
                };
                jumpBtn.onclick = () => { const p = parseInt(jumpInput.value, 10); if (p > 0) { jumpInput.value = ""; goToGelPage(p); } };
                jumpInput.onkeydown = (e) => { if (e.key === "Enter") jumpBtn.onclick(); };
                lastBtn.onclick = () => { if (_totalPages > 1) goToGelPage(_totalPages); };
                node.__gelSearch = (q) => { try { searchInput.value = q; _page = 1; _nextDisabled = false; _usePid = false; doSearch(); } catch(e){} };
                let _bookmarkBefore = "";
                let _bookmarkMark = false;
                const _ratingColor = { general: "#6ee7b7", sensitive: "#fbbf24", questionable: "#f87171", explicit: "#f87171" };
                const _applyGelRating = (ratingStr) => {
                    _activeRatings.clear();
                    String(ratingStr || "").split(",").map(function(s){ return s.trim(); }).filter(Boolean).forEach(function(p){ _activeRatings.add(p); });
                    Object.keys(_ratingChips).forEach(function(v) {
                        var chip = _ratingChips[v];
                        var on = _activeRatings.has(v);
                        var c = _ratingColor[v] || "#aaa";
                        chip.style.background = on ? (c + "33") : "linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)";
                        chip.style.border = on ? ("1px solid " + c) : "1px solid transparent";
                    });
                    try { localStorage.setItem("gel_ratings", JSON.stringify(Array.from(_activeRatings))); } catch (eR) {}
                };
                const _openGelBookmark = (bm) => {
                    searchInput.value = String((bm && bm.tags) || "");
                    _applyGelRating(bm && bm.rating);
                    _sortOrder = "";
                    try { localStorage.setItem("gel_sort", ""); } catch (eSort) {}
                    filterBar.querySelectorAll("span").forEach(function(b) {
                        var t = b.textContent || "";
                        if (t.indexOf("时间") >= 0) { b.style.background = "var(--anima-line)"; b.style.color = "var(--anima-accent-soft)"; }
                        else if (t.indexOf("评分") >= 0) { b.style.background = "linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)"; b.style.color = "#aaa"; }
                    });
                    _page = 1;
                    _usePid = false;
                    _nextDisabled = false;
                    _pageCursors = {1: ""};
                    _lastPageId = 0;
                    _seenIds = new Set();
                    var pid = Number(bm && bm.postId);
                    _bookmarkBefore = pid > 0 ? String(pid + 1) : "";
                    _bookmarkMark = true;
                    doSearch();
                };
                    async function doSearch(append) {
                    const _gen = (append === true) ? _gelSearchGen : (++_gelSearchGen);
                    _gelLoading = true;
                    if (append !== true && _page === 1) { _pageCursors = {1: ""}; _lastPageId = 0; _seenIds = new Set(); _imgHCache = {}; }
                    if (append !== true && _bookmarkBefore) { _pageCursors[1] = _bookmarkBefore; _usePid = false; _bookmarkBefore = ""; }
                    const _isScore = String(_sortOrder || "").indexOf("score") >= 0;
                    const _useNumeric = _isScore || _usePid;
                    const _rawBefore = (append === true) ? _lastPageId : (_pageCursors[_page] || "");
                    const _reqBeforeId = (!_useNumeric && _rawBefore && Number(_rawBefore) > 0) ? String(_rawBefore) : "";
                    const _reqPage = _useNumeric ? Math.max((_page || 1) - 1, 0) : 0;
                    // 匿名模式提示：未填 API Key/User ID 时提示
                    try {
                        const _st2 = await _getSettings();
                        const _anon2 = !(_st2.gelbooru_api_key && _st2.gelbooru_user_id);
                        let _tip = document.getElementById("gel-anon-tip");
                        if (_anon2) {
                            if (!_tip && !sessionStorage.getItem("gel_anon_tip_closed")) {
                                _tip = $el("div", { id: "gel-anon-tip", style: { display:"flex",alignItems:"center",gap:"8px",padding:"5px 10px",fontSize:"11px",color:"#fbbf24",background:"rgba(251,191,36,0.08)",borderBottom:"1px solid rgba(251,191,36,0.2)",flexShrink:0 } });
                                _tip.appendChild($el("span", { textContent: "🔑 匿名模式（响应较慢）· 建议在 ⚙️ 设置填写 Gelbooru API Key 提升体验" }));
                                const _tipClose = $el("span", { textContent: "✕", title: "本次运行不再提示", style: { cursor:"pointer",color:"#fbbf24",fontSize:"12px",fontWeight:"bold",padding:"0 4px",userSelect:"none" }, onclick: () => { try { sessionStorage.setItem("gel_anon_tip_closed","1"); } catch(e){} const _t = document.getElementById("gel-anon-tip"); if (_t) _t.remove(); } });
                                _tip.appendChild(_tipClose);
                                container.insertBefore(_tip, searchBar.nextSibling);
                            }
                        } else if (_tip) { _tip.remove(); }
                    } catch(e) {}
                    const query = searchInput.value.trim();
                    if (append !== true) gridContainer.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#aaa;padding:40px;">搜索中...</div>';
                    searchBtn.textContent = "⏳";
                    try {
                        const resp = await fetch("/gelbooru_anima/search", {
                            method:"POST", headers:{"Content-Type":"application/json"},
                            body: JSON.stringify({ tags: query||"", page: _reqPage, before_id: _reqBeforeId, limit: 42, rating: _activeRatings.size>0&&_activeRatings.size<4?[..._activeRatings]:null, order: _sortOrder||undefined })
                        });
                        const data = await resp.json();
                        if (_gen !== _gelSearchGen) return;
                        if (data.success && data.posts) {
                            // 客户端过滤：排除含指定 tag 的图片
                            let rawCount = data.posts.length;
                            if (data.posts.length) {
                                var _gids = [];
                                for (var _gi = 0; _gi < data.posts.length; _gi++) {
                                    var _gn = Number(data.posts[_gi].id);
                                    if (_gn > 0) _gids.push(_gn);
                                }
                                if (_gids.length) _lastPageId = Math.min.apply(null, _gids);
                            }
                            if (_excludeEnabled && _excludeImgTags) {
                                const excl = _excludeImgTags.split(/[,，]+/).filter(Boolean).map(s => s.trim().toLowerCase());
                                if (excl.length) {
                                    data.posts = data.posts.filter(p => {
                                        const pt = (p.tags || '').toLowerCase();
                                        return !excl.some(e => pt.includes(e));
                                    });
                                }
                            }
                            if (append === true) {
                                data.posts = data.posts.filter(function(p){ return p && p.id != null && !_seenIds.has(String(p.id)); });
                            }
                            _results = (append === true) ? _results.concat(data.posts) : data.posts;
                            _pageCursors[_page] = _reqBeforeId;
                            // 缓存搜索响应内嵌的分类标签（仿 D站）
                            _results.forEach(p => {
                                if (p.classified) _tagCache[p.id] = p.classified;
                                if (p.translations) { _tagTransCache[p.id] = p.translations; Object.assign(_globalTrans || {}, p.translations); }
                            });
                            renderGrid(append === true);
                            if (data.pages) _totalPages = Number(data.pages) || 0;
                            else if (data.total) _totalPages = Math.max(1, Math.ceil(Number(data.total) / 42));
                            if (_totalPages > 0) { jumpInput.max = String(_totalPages); jumpInput.placeholder = "1-" + _totalPages; }
                            pageLabel.textContent = _totalPages ? (animaTxt("第")+_page+" / "+_totalPages+animaTxt("页")) : (animaTxt("第")+_page+animaTxt("页"));
                            if (_bookmarkMark) { pageLabel.textContent = animaTxt("书签"); _bookmarkMark = false; }
                            setTimeout(_gelUpdatePage, 60);
                            const hasMore = (!_totalPages || _page < _totalPages) && rawCount >= 12 && (append !== true || data.posts.length > 0);
                            _nextDisabled = !hasMore || (_totalPages > 0 && _page >= _totalPages);
                            lastBtn.style.opacity = (!_totalPages || _page >= _totalPages) ? "0.4" : "1";
                            nextBtn.style.opacity = hasMore?"1":"0.4";
                            nextBtn.style.cursor = hasMore?"pointer":"not-allowed";
                            prevBtn.style.opacity = _page<=1?"0.4":"1";
                        } else {
                            if (append !== true) gridContainer.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#f87171;padding:40px;">搜索失败: '+(data.error||'无结果')+'</div>';
                        }
                    } catch(e) {
                        if (append !== true) gridContainer.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#f87171;padding:40px;">网络错误: '+e.message+'</div>';
                    } finally {
                        if (_gen === _gelSearchGen) { searchBtn.textContent = "🔍"; _gelLoading = false; }
                    }
                }

                function renderGrid(append) {
                    if (append !== true) { gridContainer.innerHTML = ""; _seenIds = new Set(); }
                    if (!_results.length) { gridContainer.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#aaa;padding:40px;">没有结果</div>'; return; }
                    _results.forEach(post => {
                        // 前端去重兜底：跳过已渲染过的帖子（D站画廊同款机制）
                        if (_seenIds.has(String(post.id))) return;
                        _seenIds.add(String(post.id));
                        const isSelected = !_multiEnabled && _selectedPost && _selectedPost.id === post.id;
                        const isMultiSelected = _multiEnabled && _multiSelected.has(String(post.id));
                        const borderColor = isMultiSelected?"var(--anima-accent-soft)":(isSelected?"var(--anima-accent-soft)":"transparent");
                        // 瀑布流占位：有宽高比用比例；有缓存高度用缓存（重画不闪）；否则默认 12（约120px，避免细窄条）
                        let _spans = 12;
                        if (post.width && post.height) {
                            const _h = 150 * (post.height / post.width);
                            _spans = Math.max(1, Math.ceil((_h + 6) / 16));
                        } else if (_imgHCache[post.id]) {
                            _spans = Math.max(1, Math.ceil((_imgHCache[post.id] + 6) / 16));
                        }
                        const card = $el("div", { className: "gel-img-card", style: { position:"relative",borderRadius:"8px",overflow:"hidden",cursor:"pointer",border:"2px solid "+borderColor,background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",gridRowEnd:"span "+_spans } });
                        card.dataset.postid = String(post.id);
                        card.dataset.galleryPage = _page;

                        const imgBox = $el("div", { style: { width:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)" } });
                        const _hdUrl = post.sample_url || post.preview_url || "";
                        const img = $el("img", { loading: "lazy", draggable: false, src: post.preview_url?"/gelbooru_anima/image_proxy?url="+encodeURIComponent(post.preview_url):"", alt:"", "data-hd": _hdUrl?"/gelbooru_anima/image_proxy?url="+encodeURIComponent(_hdUrl):"", style: { display:"block",width:"100%",height:"auto" } });
                        img.onerror = () => { try { const _pc = img.closest?.(".gel-img-card"); if (_pc) _pc.style.display = "none"; } catch(e) {} };
                        img.onload = () => {
                            const _ih = img.clientHeight || 0;
                            if (_ih > 0) {
                                _imgHCache[post.id] = _ih;
                                const _sp2 = Math.max(1, Math.ceil((_ih + 6) / 16));
                                if (card.style.gridRowEnd !== "span " + _sp2) card.style.gridRowEnd = "span " + _sp2;
                            }
                        };
                        imgBox.appendChild(img);
                        card.appendChild(imgBox);
                        // 缩略图起步：进视口（±200px）才换高清（地藏画廊机制）
                        if (window.IntersectionObserver && _gelIO) _gelIO.observe(img);

                        // Heart button
                        const favImgBtn = $el("span", { className:"gel-act", textContent:"🤍", title:animaTxt("收藏图片"),
                            onclick: (e) => {
                                e.stopPropagation();
                                const pid = String(post.id);
                                // 先更新 UI（乐观更新），再发请求
                                if (_favCache?.images?.[pid]) {
                                    favImgBtn.textContent = "🤍";
                                    delete _favCache.images[pid];
                                    fetch("/gelbooru_anima/favorites/remove", { method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag:pid,category:"images"}) }).catch(()=>{});
                                } else {
                                    favImgBtn.textContent = "❤️";
                                    if (!_favCache) _favCache = {};
                                    if (!_favCache.images) _favCache.images = {_order:[]};
                                    const _extra = _gelFavClassifiedExtra(post);
                                    if (!_favCache.images._order) _favCache.images._order = [];
                                    if (_favCache.images._order.indexOf(pid) < 0) _favCache.images._order.push(pid);
                                    _favCache.images[pid] = Object.assign({thumb:post.preview_url||"",cn:post.tags||"",file_url:post.file_url||"",sample_url:post.sample_url||"",source:post.source||""}, _extra);
                                    fetch("/gelbooru_anima/favorites/add", { method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.assign({tag:pid,category:"images",thumb:post.preview_url||post.sample_url||"",cn:post.tags||"",file_url:post.file_url||"",sample_url:post.sample_url||"",source:post.source||"",width:post.width||0,height:post.height||0}, _extra)) }).then(r=>r.json()).then(d=>{if(!d||!_favCache||!_favCache.images||!_favCache.images[pid])return;["series","character","artist"].forEach(k=>{if(Array.isArray(d[k]))_favCache.images[pid][k]=d[k];});if(d.translations&&typeof d.translations==="object")_favCache.images[pid].translations=d.translations;}).catch(()=>{});
                                }
                            }
                        });
                        _getFavs().then(() => { if (_favCache?.images?.[String(post.id)]) favImgBtn.textContent = "❤️"; });

                        if (post.score && !_multiEnabled) {
                            card.appendChild($el("span", { className:"gel-hover", textContent:"★"+post.score, style: { position:"absolute",top:"3px",right:"3px",background:"rgba(0,0,0,0.8)",color:"#fbbf24",padding:"1px 5px",borderRadius:"3px",fontSize:"11px",fontWeight:"bold" } }));
                        }
                        const rc = { general:"var(--anima-accent-soft)",sensitive:"#fbbf24",questionable:"#f87171",explicit:"#f87171" };
                        card.appendChild($el("span", { className:"gel-hover", textContent:(post.rating||"?").toUpperCase(), style: { position:"absolute",top:"3px",right:"52px",background:rc[post.rating]||"#888",color:"#fff",padding:"1px 4px",borderRadius:"3px",fontSize:"10px",fontWeight:"bold" } }));
                        const tagBtn = $el("span", { className:"gel-act", textContent:"📋", title:"查看图片信息", onclick: (e) => { e.stopPropagation(); showTagOverlay(post); } });
                        const clsBtn = $el("span", { className:"gel-act", textContent:"🔍", title:"搜角色/系列/画师", onclick: (e) => { e.stopPropagation();
                            const cached = _tagCache[post.id];
                            const rect = e.currentTarget.getBoundingClientRect();
                            if (cached) { showClassSearch(post, cached, rect, _tagTransCache[post.id]||{}); }
                            else { clsBtn.textContent = "⏳"; fetch("/gelbooru_anima/post/"+post.id).then(r=>r.json()).then(d=>{ clsBtn.textContent = "🔍"; if(d.success&&d.groups){_tagCache[post.id]=d.groups;if(d.translations)_tagTransCache[post.id]=d.translations;showClassSearch(post,d.groups,rect,d.translations||{});} }).catch(()=>{ clsBtn.textContent = "🔍"; }); }
                        } });
                        const actRow = $el("div", { className:"gel-act-row" });
                        actRow.append(favImgBtn, tagBtn, clsBtn);
                        card.appendChild(actRow);

                        if (_multiEnabled) {
                            const pid = String(post.id);
                            const cb = $el("input", { type:"checkbox",checked:isMultiSelected, style: { position:"absolute",top:"26px",left:"3px",width:"16px",height:"16px",cursor:"pointer",zIndex:3 }, onclick: (e) => { e.stopPropagation(); if(_multiSelected.has(pid))_multiSelected.delete(pid); else _multiSelected.add(pid); updateSelectedBar(); renderGrid(); } });
                            card.appendChild(cb);
                        }

                        card.onclick = () => {
                            if (_tagFusionEnabled) {
                                const pid = String(post.id);
                                if (_fusionSlots[_fusionActiveSlot].has(pid)) _fusionSlots[_fusionActiveSlot].delete(pid);
                                else _fusionSlots[_fusionActiveSlot].add(pid);
                                if (_sync12 && _fusionActiveSlot===1) { _fusionSlots[2] = new Set(_fusionSlots[1]); }
                                updateSlotBtnStyles(); writeFusionWidget(); renderGrid();
                            } else if (_multiEnabled) { const pid=String(post.id); if(_multiSelected.has(pid))_multiSelected.delete(pid); else _multiSelected.add(pid); updateSelectedBar(); renderGrid(); }
                            else {
                                if(_selectedPost&&_selectedPost.id===post.id)_selectedPost=null; else _selectedPost=post;
                                updateSelectedBar();
                                // 轻量选中：只更新边框颜色，不重画整网格（避免瀑布流抖动）
                                const _cards = gridContainer.querySelectorAll(".gel-img-card");
                                for (const _cd of _cards) {
                                    const _sel = _selectedPost && String(_selectedPost.id) === _cd.dataset.postid;
                                    _cd.style.borderColor = _sel ? "var(--anima-accent-soft)" : "transparent";
                                    _cd.style.boxShadow = _sel ? "0 0 10px rgba(var(--anima-accent-soft-rgb),0.55)" : "none";
                                }
                            }
                        };
                        // Fusion mode slot dots
                        if (_tagFusionEnabled) {
                            const fpid = String(post.id);
                            const sc = {1:"var(--anima-accent-soft)",2:"#f87171",3:"var(--anima-accent-soft)"};
                            const fbdg = $el("div",{className:"gel-fusion-badge",style:{position:"absolute",bottom:"4px",left:"4px",display:"flex",gap:"3px",zIndex:4}});
                            [1,2,3].forEach(s => { if(_fusionSlots[s].has(fpid)){ const dot=$el("span",{textContent:s,style:{width:"20px",height:"20px",borderRadius:"50%",background:sc[s],color:"#fff",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:"bold"}}); fbdg.appendChild(dot); } });
                            if (fbdg.children.length) card.appendChild(fbdg);
                        }
                        card.addEventListener("contextmenu", (ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            const _saveGelBm = () => {
                                if (!window.animaBm || !post || post.id == null) return;
                                var rating = (_activeRatings && _activeRatings.size > 0 && _activeRatings.size < 4) ? Array.from(_activeRatings).join(",") : "";
                                window.animaBm.promptAdd("gelbooru", {
                                    postId: post.id,
                                    tags: String(searchInput.value || "").trim().replace(/\s+/g, " "),
                                    rating: rating,
                                    thumb: post.preview_url || post.sample_url || post.file_url || ""
                                }, function() {
                                    try { pageLabel.textContent = animaTxt("已添加书签"); } catch (eBm) {}
                                });
                            };
                            const groups = post.classified || _tagCache[post.id] || null;
                            const trans = Object.assign({}, post.translations || {}, _tagTransCache[post.id] || {});
                            if (groups) {
                                _animaOpenSiteJump(ev.clientX, ev.clientY, "gelbooru", groups, trans, _saveGelBm);
                                return;
                            }
                            const token = _animaOpenSiteJump(ev.clientX, ev.clientY, "gelbooru", null, trans, _saveGelBm);
                            fetch("/gelbooru_anima/post/" + post.id).then(r => r.json()).then(d => {
                                if (window._animaSiteJumpToken !== token) return;
                                if (d && d.success && d.groups) {
                                    _tagCache[post.id] = d.groups;
                                    if (d.translations) _tagTransCache[post.id] = Object.assign(_tagTransCache[post.id] || {}, d.translations);
                                    window.animaSiteJumpMenu({ onBookmark: _saveGelBm, x: ev.clientX, y: ev.clientY, site: "gelbooru", groups: d.groups, translations: Object.assign(trans, d.translations || {}), token: token });
                                } else {
                                    window.animaSiteJumpMenu({ onBookmark: _saveGelBm, x: ev.clientX, y: ev.clientY, site: "gelbooru", groups: {}, translations: trans, token: token });
                                }
                            }).catch(() => {
                                if (window._animaSiteJumpToken === token) window.animaSiteJumpMenu({ onBookmark: _saveGelBm, x: ev.clientX, y: ev.clientY, site: "gelbooru", groups: {}, translations: trans, token: token });
                            });
                        });
                        gridContainer.appendChild(card);
                    });
                    // ── DOM 滑动窗口回收（学 D站画廊）：渲染完一批后调用，上限 4200 张，
                    //    从最老端回收，保护视口锚点与选中卡，同步裁剪 _results，补偿滚动防跳动 ──
                    _recycleGelItems();
                    // 后台逐张预加载所有可见图片的分类标签（每200ms加载一张，不阻塞渲染）
                    
                }

                function updateSelectedBar() {
                    if (_multiEnabled && _multiSelected.size > 0) {
                        selectedBar.style.display = "flex";
                        selectedLabel.textContent = animaTxt("已选")+_multiSelected.size+"张";
                        const sw = node.widgets?.find(w => w.name === "selection_data");
                        if (sw) {
                            const allTags=[]; const _urls=[];
                            _results.forEach(p=>{ if(_multiSelected.has(String(p.id))) { allTags.push(...(p.tags||'').split(' ').filter(Boolean)); const _u = p.sample_url || p.file_url || p.preview_url || ""; if (_u) _urls.push(_u); } });
                            sw.value=JSON.stringify({mode:"multi",ids:[..._multiSelected],merged_tags:_filterBlacklist([...new Set(allTags)].join(', ')),urls:_urls});
                        }
                    } else if (_selectedPost) {
                        selectedBar.style.display = "flex";
                        selectedLabel.textContent = animaTxt("已选: #")+_selectedPost.id;
                        const sw = node.widgets?.find(w => w.name === "selection_data");
                        if (sw) sw.value = JSON.stringify({id:_selectedPost.id,tags:_filterBlacklist(_selectedPost.tags||''),groups:_tagCache[_selectedPost.id]||{},file_url:_selectedPost.file_url||'',sample_url:_selectedPost.sample_url||'',preview_url:_selectedPost.preview_url||'',use_original:_useOriginal});
                    } else { selectedBar.style.display = "none"; }
                }

                async function showTagOverlay(post) {
                    const allTags = (post.tags||'').split(' ').filter(Boolean);
                    const overlay = $el("div", { style: { position:"fixed",top:0,left:0,width:"100vw",height:"100vh",zIndex:99999,background:"rgba(0,0,0,0.85)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center" } });
                    // 图片：缩略图起步（匿名原图 4MB 加载慢），点击切换原图
                    const imgUrl = post.preview_url||post.file_url||post.sample_url||"";
                    const _bigUrl = post.file_url||post.sample_url||post.preview_url||"";
                    if (imgUrl) {
                        const _ovImg = $el("img", { src:"/gelbooru_anima/image_proxy?url="+encodeURIComponent(imgUrl), style: { maxWidth:"90vw",maxHeight:"50vh",objectFit:"contain",borderRadius:"4px",cursor: (_bigUrl && _bigUrl !== imgUrl) ? "zoom-in" : "default" }, title: (_bigUrl && _bigUrl !== imgUrl) ? "点击加载原图" : "" });
                        if (_bigUrl && _bigUrl !== imgUrl) {
                            _ovImg.onclick = () => { _ovImg.src = "/gelbooru_anima/image_proxy?url="+encodeURIComponent(_bigUrl); _ovImg.style.cursor = "default"; _ovImg.title = ""; };
                        }
                        overlay.appendChild(_ovImg);
                    }
                    const actBar = $el("div", { style: { display:"flex",gap:"8px",margin:"10px 0" } });
                    actBar.appendChild($el("button", { textContent:"✕关闭", style:{padding:"6px 16px",border:"none",background:"#f87171",color:"#fff",cursor:"pointer",borderRadius:"3px"}, onclick:()=>overlay.remove() }));
                    actBar.appendChild($el("button", { textContent:"📥原图", style:{padding:"6px 16px",border:"none",background:"var(--anima-line)",color:"var(--anima-accent-soft)",cursor:"pointer",borderRadius:"3px"}, onclick:()=>{const url=post.file_url||post.sample_url||post.preview_url;if(url)window.open(url,'_blank');} }));
                    if (post.source) actBar.appendChild($el("button", { textContent:"🔗来源", style:{padding:"6px 16px",border:"none",background:"var(--anima-line)",color:"#fbbf24",cursor:"pointer",borderRadius:"3px"}, onclick:()=>{window.open(post.source,'_blank');} }));
                    overlay.appendChild(actBar);
                    const tagArea = $el("div", { style: { maxWidth:"90vw",maxHeight:"35vh",overflowY:"auto",padding:"8px",background:"rgba(255,255,255,0.05)",borderRadius:"4px" } });
                    tagArea.innerHTML = '<span style="color:#aaa;font-size:12px;">加载分类中...</span>';
                    overlay.appendChild(tagArea);
                    overlay.addEventListener("click",(e)=>{if(e.target===overlay)overlay.remove();});
                    document.body.appendChild(overlay);

                    let groups = {};
                    try {
                        if (_tagCache[post.id]) { groups = _tagCache[post.id]; }
                        else { const r=await fetch("/gelbooru_anima/post/"+post.id); const d=await r.json(); if(d.success){groups=d.groups||{};_tagCache[post.id]=groups;if(d.translations)_tagTransCache[post.id]=d.translations;} }
                    } catch {}
                    const trans = _tagTransCache[post.id] || {};
                    tagArea.innerHTML = "";
                    const catColors = { quality_meta:"#f87171",count:"#fbbf24",character:"var(--anima-accent-soft)",series:"var(--anima-accent-soft)",artist:"#f472b6",general:"#8aa39a" };
                    const catNames = { quality_meta:"QUALITY",count:"COUNT",character:"CHAR",series:"SERIES",artist:"ARTIST",general:"GENERAL" };
                    Object.keys(catColors).forEach(cat => {
                        const tags = groups[cat]||[];
                        if (!tags.length) return;
                        const row = $el("div",{style:{marginBottom:"4px"}});
                        row.appendChild($el("span",{textContent:"["+catNames[cat]+"] ",style:{fontSize:"13px",color:catColors[cat],fontWeight:"bold"}}));
                        tags.forEach(tag => {
                            const tagRow = $el("span",{style:{display:"inline-block",margin:"1px 3px",position:"relative"}});
                            tagRow.appendChild($el("span",{textContent:trans[tag] ? trans[tag]+' · '+tag : tag,style:{padding:"3px 8px",borderRadius:"4px",fontSize:"14px",fontWeight:"bold",background:catColors[cat]+"33",color:catColors[cat],cursor:"pointer"},onclick:()=>{searchInput.value=tag;overlay.remove();_page=1;doSearch();}}));
                            const favCat = {quality_meta:"general",count:"general",character:"characters",series:"series",artist:"artists",general:"general"}[cat]||"general";
                            const starEl = $el("span",{textContent:" ☆",style:{cursor:"pointer",fontSize:"13px",color:"#888"},title:"收藏标签",onclick:async(e)=>{e.stopPropagation();await _getFavs();const favs=_favCache;const tc=favs[favCat]||{};if(tc[tag]){await fetch("/gelbooru_anima/favorites/remove",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag,category:favCat})});delete tc[tag];starEl.textContent=" ☆";starEl.style.color="#888";}else{await fetch("/gelbooru_anima/favorites/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag,category:favCat,thumb:post.preview_url||post.sample_url||"",cn:""})});if(!favs[favCat])favs[favCat]={_order:[]};favs[favCat][tag]={thumb:post.preview_url||"",cn:""};starEl.textContent=" ★";starEl.style.color="#fbbf24";}}});
                            _getFavs().then(()=>{if(_favCache?.[favCat]?.[tag]){starEl.textContent=" ★";starEl.style.color="#fbbf24";}});
                            tagRow.appendChild(starEl);
                            row.appendChild(tagRow);
                        });
                        tagArea.appendChild(row);
                    });
                    if (!Object.values(groups).some(a=>a&&a.length)) tagArea.innerHTML = '<span style="color:#aaa;">'+allTags.join(', ')+'</span>';
                }

                async function showClassSearch(post, cachedGroups, cardRect, translations) {
                    const panel = $el("div",{style:{position:"fixed",top:(cardRect?cardRect.top:60)+"px",left:(cardRect?cardRect.right+10:300)+"px",width:"280px",maxHeight:"60vh",overflowY:"auto",background:"linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)",borderRadius:"8px",padding:"12px",zIndex:100005,boxShadow:"0 4px 20px rgba(0,0,0,0.6)",cursor:"default",userSelect:"none"}});

                    if (cachedGroups) {
                        renderClassPopup(panel, post, cachedGroups, translations||{});
                        document.body.appendChild(panel);
                        // 点击外部关闭
                        const closer = (ev) => { if(!panel.contains(ev.target)){panel.remove();document.removeEventListener("click",closer);} };
                        setTimeout(()=>document.addEventListener("click",closer), 10);
                        return;
                    }

                    panel.innerHTML = '<span style="color:#aaa;font-size:13px;padding:10px;">加载中...</span>';
                    document.body.appendChild(panel);
                    const closer2 = (ev) => { if(!panel.contains(ev.target)){panel.remove();document.removeEventListener("click",closer2);} };
                    setTimeout(()=>document.addEventListener("click",closer2), 10);

                    let groups = {};
                    try { const r=await fetch("/gelbooru_anima/post/"+post.id); const d=await r.json(); if(d.success){groups=d.groups||{}; _tagCache[post.id] = groups; if(d.translations){translations=d.translations;_tagTransCache[post.id]=d.translations;} } } catch {}
                    renderClassPopup(panel, post, groups, translations||{});
                }

                function renderClassPopup(panel, post, groups, translations) {
                    const _cnTag = (tag) => { const cn = (translations||{})[tag] || ''; return cn ? cn + ' · ' + tag : tag; };
                    panel.innerHTML="";
                    if (!groups || !Object.keys(groups).some(k=>groups[k]&&groups[k].length)) { panel.innerHTML='<span style="color:#aaa;font-size:13px;padding:10px;">暂无分类数据</span>'; return; }
                    // 拖拽标题栏
                    const titleBar = $el("div",{textContent:"🔍 分类 — #"+post.id,style:{cursor:"move",padding:"4px 0 8px 0",fontSize:"12px",color:"var(--anima-accent-soft)",borderBottom:"1px solid var(--anima-line)",marginBottom:"8px"},onmousedown:(e)=>{e.preventDefault();const sx=e.clientX,sy=e.clientY;const r=panel.getBoundingClientRect();const ox=sx-r.left,oy=sy-r.top;const mv=(ev)=>{panel.style.left=(ev.clientX-ox)+"px";panel.style.top=(ev.clientY-oy)+"px";panel.style.right="auto"};const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}});
                    panel.appendChild(titleBar);
                    const cats=[{k:"character",l:animaTxt("👤 角色"),c:"#6ee7b7"},{k:"series",l:animaTxt("📺 系列"),c:"var(--anima-accent-soft)"},{k:"artist",l:animaTxt("🎨 画师"),c:"#f472b6"}];
                    cats.forEach(({k,l,c})=>{const tags=groups[k]||[];if(!tags.length)return;const sec=$el("div",{style:{marginBottom:"8px"}});sec.appendChild($el("div",{textContent:l,style:{fontSize:"12px",fontWeight:"bold",color:c,marginBottom:"4px"}}));tags.forEach(tag=>{const row=$el("div",{style:{display:"inline-flex",alignItems:"center",margin:"1px 3px",padding:"2px 6px",borderRadius:"3px",background:c+"22",gap:"4px"}});row.appendChild($el("span",{textContent:_cnTag(tag),style:{fontSize:"11px",color:c,cursor:"pointer"},onclick:()=>{searchInput.value=tag;panel.remove();_page=1;doSearch();}}));const favCat={character:"characters",series:"series",artist:"artists"}[k]||"general";const star=$el("span",{textContent:" ☆",style:{cursor:"pointer",fontSize:"10px",color:"#888"},onclick:async(ev)=>{ev.stopPropagation();await _getFavs();const tc=_favCache[favCat]||{};if(tc[tag]){await fetch("/gelbooru_anima/favorites/remove",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag,category:favCat})});delete tc[tag];star.textContent=" ☆";star.style.color="#888";}else{await fetch("/gelbooru_anima/favorites/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag,category:favCat,thumb:post.preview_url||"",cn:""})});if(!_favCache[favCat])_favCache[favCat]={_order:[]};_favCache[favCat][tag]={thumb:post.preview_url||"",cn:""};star.textContent=" ★";star.style.color="#fbbf24";}}});_getFavs().then(()=>{if(_favCache?.[favCat]?.[tag]){star.textContent=" ★";star.style.color="#fbbf24";}});row.appendChild(star);row.appendChild($el("span",{textContent:"🔍",style:{cursor:"pointer",fontSize:"10px"},onclick:(ev)=>{ev.stopPropagation();searchInput.value=tag;panel.remove();_page=1;doSearch();}}));sec.appendChild(row);});panel.appendChild(sec);});
                    const closeBtn=$el("button",{textContent:animaTxt("✕ 关闭"),style:{display:"block",margin:"8px auto 0",padding:"6px 16px",border:"none",background:"#f87171",color:"#fff",cursor:"pointer",borderRadius:"3px",fontSize:"12px"},onclick:()=>panel.remove()});
                    panel.appendChild(closeBtn);
                }

                // Auto-complete：空格后的当前词，前面的标签保留
                let _acTimer = null;
                let _gelAcPick = null;
                let _gelAcSeq = 0;
                const _gelTokenAt = (input) => {
                    const val = input.value || "";
                    let caret = input.selectionStart;
                    if (caret == null || caret < 0 || caret > val.length) caret = val.length;
                    let start = caret;
                    while (start > 0 && val.charAt(start - 1) !== " ") start--;
                    let end = caret;
                    while (end < val.length && val.charAt(end) !== " ") end++;
                    return { q: val.slice(start, end), start: start, end: end };
                };
                const _gelApplyAc = (name) => {
                    const tag = String(name || "").replace(/ /g, "_").trim();
                    acList.style.display = "none";
                    if (!tag || tag.charAt(0) === "\u23f3") return;
                    const val = searchInput.value || "";
                    const saved = _gelAcPick;
                    let start, end;
                    if (saved && saved.q && val.slice(saved.start, saved.start + saved.q.length) === saved.q) {
                        start = saved.start;
                        end = saved.start + saved.q.length;
                        while (end < val.length && val.charAt(end) !== " ") end++;
                    } else {
                        const live = _gelTokenAt(searchInput);
                        start = live.start;
                        end = live.end;
                    }
                    const before = val.slice(0, start);
                    const after = val.slice(end);
                    let next, pos;
                    if (!after) { next = before + tag + " "; pos = before.length + tag.length + 1; }
                    else { next = before + tag + after; pos = before.length + tag.length; }
                    searchInput.value = next;
                    try { searchInput.focus(); searchInput.setSelectionRange(pos, pos); } catch (eAc) {}
                    _page = 1; _usePid = false; _nextDisabled = false; _pageCursors = {1: ""}; _lastPageId = 0;
                    doSearch();
                };
                const _gelFillAc = (rows, labelOf) => {
                    acList.innerHTML = "";
                    if (!rows.length) { acList.style.display = "none"; return; }
                    rows.forEach(function(t) {
                        const row = $el("div", {
                            textContent: labelOf(t),
                            style: { padding:"5px 10px", cursor:"pointer", fontSize:"13px", color:"#e0e0e0", borderBottom:"1px solid var(--anima-line)" },
                            onmouseover: function() { this.style.background = "var(--anima-line)"; },
                            onmouseout: function() { this.style.background = "transparent"; }
                        });
                        row.onclick = function() { _gelApplyAc(t.tag || t.name); };
                        acList.appendChild(row);
                    });
                    acList.style.display = "block";
                };
                searchInput.oninput = () => {
                    const tok = _gelTokenAt(searchInput);
                    if (!tok.q) { clearTimeout(_acTimer); acList.style.display = "none"; return; }
                    const seq = ++_gelAcSeq;
                    clearTimeout(_acTimer);
                    _acTimer = setTimeout(async () => {
                        const now = _gelTokenAt(searchInput);
                        if (seq !== _gelAcSeq || !now.q || now.q !== tok.q || now.start !== tok.start) return;
                        _gelAcPick = now;
                        const q = now.q;
                        try {
                            if (_semanticActive) {
                                const vr = await fetch("/danbooru_anima/vec_search", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ query:q, top_k:15 }) });
                                const vd = await vr.json();
                                if (seq !== _gelAcSeq) return;
                                const vitems = (vd.tags || []).map(function(t){ return { name: t.name, cn_name: t.cn_name, score: t.score, tag: t.name }; });
                                _gelFillAc(vitems, function(t) {
                                    const pct = t.score != null ? (" 🧠 " + Math.round(t.score * 100) + "%") : "";
                                    return (t.cn_name ? t.cn_name + " (" + t.name + ")" : t.name) + pct;
                                });
                                return;
                            }
                            const r = await fetch("/gelbooru_anima/local_tags", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ query:q }) });
                            const d = await r.json();
                            if (seq !== _gelAcSeq) return;
                            _gelFillAc(d.tags || [], function(t) { return t.cn ? t.cn + " (" + t.tag + ")" : t.tag; });
                        } catch (eAc) { if (seq === _gelAcSeq) acList.style.display = "none"; }
                    }, 200);
                };
                searchInput.onkeydown = (e) => { if (e.key === "Enter") { acList.style.display = "none"; _page = 1; doSearch(); } };
            // ── 远程搜索通道（AnimaDex 一键发送，全局变量队列，不依赖端口） ──
            node._gelAdexTimer = setInterval(() => {
                try {
                    let q = (window._adexGelSearch || "").trim();
                    if (q && searchInput) {
                        window._adexGelSearch = "";
                        searchInput.value = q;
                        if (typeof doSearch === "function") doSearch();
                        return;
                    }
                    const raw = localStorage.getItem("anima_opv_site_search");
                    if (!raw || !searchInput) return;
                    const msg = JSON.parse(raw);
                    if (!msg || msg.site !== "gelbooru" || !msg.q || !msg.t || node._opvSearchT === msg.t) return;
                    if (Date.now() - Number(msg.t) > 12000) return;
                    node._opvSearchT = msg.t;
                    searchInput.value = msg.q;
                    if (typeof doSearch === "function") doSearch();
                } catch(e) {}
            }, 400);
                // 点击其他地方关闭下拉（全局单例，与 D站共用注册表，防每节点累积）
                if (!window._dbAcCloseInstalled) {
                    window._dbAcCloseInstalled = true;
                    document.addEventListener("click", (e) => {
                        (window._dbAcCloseFns || []).forEach(_fn => { try { _fn(e); } catch(err) {} });
                    });
                }
                if (!window._dbAcCloseFns) window._dbAcCloseFns = [];
                const _gelAcCloseFn = (e) => { if (!container.contains(e.target)) acList.style.display = "none"; };
                window._dbAcCloseFns.push(_gelAcCloseFn);
                node._gelAcCloseFn = _gelAcCloseFn;
                // 底部留白，防止最后一排图片被裁剪
                gridContainer.style.paddingBottom = "200px";

                // Simple favorites
                function showFavPopup() {
                    if (_favPopupOpen) return;
                    _favPopupOpen = true;
                    (function(){
                        if (!document.getElementById("gel-fav-folder-sort-css")) {
                            var st = document.createElement("style");
                            st.id = "gel-fav-folder-sort-css";
                            st.textContent = ".gel-fav-folder-ghost{opacity:.45;} .gel-fav-folder-handle{cursor:grab;flex-shrink:0;padding:0 4px;color:var(--anima-ink-soft);user-select:none;} .gel-fav-folder-handle:active{cursor:grabbing;}";
                            document.head.appendChild(st);
                        }
                        if (window.Sortable) return;
                        if (document.getElementById("db-fav-sortable-js")) return;
                        var s = document.createElement("script");
                        s.id = "db-fav-sortable-js";
                        s.src = "/extensions/ComfyUI-Danbooru-Anima-Prompt/js/sortable.min.js";
                        document.head.appendChild(s);
                    })();
                    _getFavs().then(favs => {
                        const saved = JSON.parse(localStorage.getItem("gel_fav_size")||"{}");
                        const _w = saved.w || 900, _h = saved.h || 650, _sw = saved.sw || 180;
                        let sidebarW = _sw;
                        let _gFavZoom = parseFloat(localStorage.getItem("gel_fav_zoom") || "1");
                        let _mainTab = "images", _tagTab = "characters", _imgFolder = null, _imgPage = 0, _tagPage = 0, _sel = new Set(), _folders = favs._folders?.images || {};
                    let _favSortAsc = localStorage.getItem("gel_fav_sort_asc") !== "0";  // true=旧在前(默认), false=新在前（持久化）
                    let _tagFavSort = "rate";
                    try {
                        var _gts = localStorage.getItem("gel_tag_fav_sort") || "";
                        if (_gts === "rate" || _gts === "desc" || _gts === "asc") _tagFavSort = _gts;
                        else if (localStorage.getItem("gel_tag_fav_sort_asc") === "1") _tagFavSort = "asc";
                    } catch (eGts) {}
                        const _tagCats = ["characters","series","artists","general"];
                        const _tagLabels = { characters:"👤 角色", series:"📺 系列", artists:"🎨 画师", general:"🏷 常规" };
                        let _favFilter = null;
                        let _favFilterOpen = false;
                        let _favFilterQSeries = "";
                        let _favFilterQChar = "";
                        let _favShowArtist = false;
                        let _favViewKeys = [];
                        let _favPageKeys = [];
                        let _favFacetCache = null;
                        let _favPanelItems = null;
                        let _favPanelKeys = [];
                        let _favFolderDragging = false;
                        let _favSortables = [];
                        function _favEsc(s) {
                            return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
                        }
                        function _favNormTag(s) { return String(s || "").replace(/ /g, "_").toLowerCase(); }
                        function _favActiveSeries() {
                            if (!_favFilter) return "";
                            if (_favFilter.kind === "series") return _favNormTag(_favFilter.tag);
                            if (_favFilter.series) return _favNormTag(_favFilter.series);
                            return "";
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
                                const k = String(x || "");
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
                        function _favCharacterTitle() { return _favActiveSeries() ? "本系列角色" : "角色"; }
                        function _favCharacterFacets(facets) {
                            const ser = _favActiveSeries();
                            if (ser) return (facets && facets.seriesChars && facets.seriesChars[ser]) || [];
                            return (facets && facets.character) || [];
                        }
                        function _parseFavMeta(it) {
                            const out = { tags: "", large_url: "", series: null, character: null, artist: null, translations: {} };
                            function absorb(obj) {
                                if (!obj || typeof obj !== "object") return;
                                if (obj.tags) out.tags = obj.tags;
                                if (obj.large_url) out.large_url = obj.large_url;
                                out.series = _favMergeArr(out.series, obj.series);
                                out.character = _favMergeArr(out.character, obj.character);
                                out.artist = _favMergeArr(out.artist, obj.artist);
                                if (obj.translations && typeof obj.translations === "object") {
                                    Object.keys(obj.translations).forEach(function(tk) {
                                        if (obj.translations[tk] && !out.translations[tk]) out.translations[tk] = obj.translations[tk];
                                    });
                                }
                                if (obj.classified && typeof obj.classified === "object") absorb(obj.classified);
                            }
                            if (!it) return out;
                            absorb(it);
                            const cn = it.cn;
                            if (typeof cn === "object" && cn) {
                                absorb(cn);
                                if (!out.large_url) out.large_url = it.file_url || it.sample_url || "";
                                return out;
                            }
                            const raw = String(cn || "");
                            if (raw.charAt(0) === "{") {
                                try {
                                    absorb(JSON.parse(raw));
                                    if (!out.large_url) out.large_url = it.file_url || it.sample_url || "";
                                    return out;
                                } catch (e) {}
                            }
                            if (!out.tags) out.tags = raw;
                            if (!out.large_url) out.large_url = it.file_url || it.sample_url || "";
                            return out;
                        }
                        function _favCollectFacets(items, folderKeys) {
                            const sig = (folderKeys || []).join("\0");
                            if (_favFacetCache && _favFacetCache.sig === sig) return _favFacetCache.data;
                            const counts = { series: {}, character: {}, artist: {} };
                            const seriesChars = {};
                            const trans = {};
                            (folderKeys || []).forEach(function(k) {
                                const it = items[k];
                                if (!it) return;
                                const m = _parseFavMeta(it);
                                const tr = m.translations || {};
                                Object.keys(tr).forEach(function(tk) { if (tr[tk] && !trans[tk]) trans[tk] = tr[tk]; });
                                const serKeys = [];
                                const chaKeys = [];
                                ["series", "character", "artist"].forEach(function(kind) {
                                    const arr = m[kind];
                                    if (!Array.isArray(arr)) return;
                                    arr.forEach(function(t) {
                                        if (!t) return;
                                        const key = _favNormTag(t);
                                        if (!key) return;
                                        counts[kind][key] = (counts[kind][key] || 0) + 1;
                                        if (!trans[key]) {
                                            const cn = tr[t] || tr[key] || tr[String(t).replace(/_/g, " ")];
                                            if (cn) trans[key] = cn;
                                        }
                                        if (kind === "series") _favPushUnique(serKeys, key);
                                        else if (kind === "character") _favPushUnique(chaKeys, key);
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
                                    return { tag: t, count: counts[kind][t], cn: trans[t] || trans[String(t).replace(/_/g, " ")] || "" };
                                }).sort(function(a, b) { return b.count - a.count || a.tag.localeCompare(b.tag); });
                            }
                            function rankedMap(obj) {
                                return Object.keys(obj).map(function(t) {
                                    return { tag: t, count: obj[t], cn: trans[t] || trans[String(t).replace(/_/g, " ")] || "" };
                                }).sort(function(a, b) { return b.count - a.count || a.tag.localeCompare(b.tag); });
                            }
                            const seriesCharLists = {};
                            Object.keys(seriesChars).forEach(function(st) { seriesCharLists[st] = rankedMap(seriesChars[st]); });
                            const data = { series: ranked("series"), character: ranked("character"), artist: ranked("artist"), seriesChars: seriesCharLists };
                            _favFacetCache = { sig: sig, data: data };
                            return data;
                        }
                        function _favKindQuery(kind) {
                            if (kind === "series") return (_favFilterQSeries || "").trim().toLowerCase();
                            return (_favFilterQChar || "").trim().toLowerCase();
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
                            if (kind === "series") {
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
                                    const en = String(list[i].tag || "").toLowerCase();
                                    const cn = String(list[i].cn || "").toLowerCase();
                                    const note = (kind === "series" || kind === "character") && typeof window.animaFacetNoteGet === "function"
                                        ? String(window.animaFacetNoteGet(kind, list[i].tag) || "").toLowerCase()
                                        : "";
                                    if (en.indexOf(q) >= 0 || cn.indexOf(q) >= 0 || (note && note.indexOf(q) >= 0)) push(list[i]);
                                }
                            }
                            return out;
                        }
                        function _favChipRowHtml(kind, title, list) {
                            if (kind === "artist") {
                                const force = !!(_favFilter && _favFilter.kind === "artist") || _favShowArtist;
                                if (!force) return "";
                            }
                            const vis = _favVisibleList(list, kind);
                            if (!vis.length) return "";
                            let h = '<div class="db-fav-filter-sec" data-kind="' + kind + '" style="margin-top:6px;">';
                            h += '<div style="color:var(--anima-ink-soft);font-size:11px;margin-bottom:4px;">' + title + "</div>";
                            h += '<div class="db-fav-chip-row" style="display:flex;flex-wrap:wrap;gap:6px;">';
                            vis.forEach(function(it) {
                                let sel = false;
                                if (kind === "series") sel = _favActiveSeries() === _favNormTag(it.tag);
                                else if (kind === "character") sel = !!(_favFilter && _favFilter.kind === "character" && _favNormTag(_favFilter.tag) === _favNormTag(it.tag));
                                else sel = !!(_favFilter && _favFilter.kind === kind && _favNormTag(_favFilter.tag) === _favNormTag(it.tag));
                                const base = it.cn ? (String(it.tag || "") + " " + String(it.cn || "")) : String(it.tag || "");
                                let label = _favEsc(base);
                                let tip = "";
                                if (kind === "series" || kind === "character") {
                                    const note = (typeof window.animaFacetNoteGet === "function") ? window.animaFacetNoteGet(kind, it.tag) : "";
                                    if (note) label = _favEsc(note);
                                    tip = ' title="' + _favEsc(base + " — " + animaTxt("右键设置备注")) + '"';
                                }
                                h += '<button type="button" class="db-fav-fchip" data-kind="' + kind + '" data-tag="' + _favEsc(it.tag) + '" data-cn="' + _favEsc(it.cn) + '"' + tip + ' style="padding:3px 8px;border-radius:12px;border:1px solid ' + (sel ? "#f87171" : "rgba(var(--anima-line-soft-rgb),.42)") + ";background:" + (sel ? "rgba(248,113,113,0.18)" : "rgba(var(--anima-input-rgb),.86)") + ';color:var(--anima-ink-strong);cursor:pointer;font-size:11px;">' + label + ' <span style="opacity:.7">(' + it.count + ")</span></button>";
                            });
                            h += "</div></div>";
                            return h;
                        }
                        function _favRebuildFilterSections(root) {
                            if (!root || !_favFacetCache || !_favFacetCache.data) return;
                            const panel = root.querySelector(".db-fav-filter-panel");
                            if (!panel) return;
                            const loading = panel.querySelector(".db-fav-filter-loading");
                            if (loading) loading.remove();
                            const facets = _favFacetCache.data;
                            const artBtn = panel.querySelector(".db-fav-filter-show-artist");
                            if (artBtn && !(facets.artist && facets.artist.length)) artBtn.remove();
                            panel.querySelectorAll(".db-fav-filter-sec").forEach(function(el) { el.remove(); });
                            const empty = panel.querySelector(".db-fav-filter-empty");
                            if (empty) empty.remove();
                            const html = _favChipRowHtml("series", "系列", facets.series)
                                + _favChipRowHtml("character", _favCharacterTitle(), _favCharacterFacets(facets))
                                + _favChipRowHtml("artist", "画师", facets.artist);
                            if (html) panel.insertAdjacentHTML("beforeend", html);
                            else panel.insertAdjacentHTML("beforeend", '<div class="db-fav-filter-empty" style="color:var(--anima-ink-soft);font-size:12px;margin-top:6px;">暂无系列/角色数据。请到设置里一键为旧收藏补全标签。</div>');
                        }
                        function _favItemMatch(item, filter) {
                            if (!filter || !item) return true;
                            const m = _parseFavMeta(item);
                            if (filter.kind === "series") return _favHasTag(m.series, filter.tag);
                            if (filter.kind === "character") {
                                if (!_favHasTag(m.character, filter.tag)) return false;
                                if (filter.series) return _favHasTag(m.series, filter.series);
                                return true;
                            }
                            return _favHasTag(m[filter.kind], filter.tag);
                        }
                        function _favFilterPanelHtml(items, folderKeys) {
                            if (!_favFilterOpen) return "";
                            const sig = (folderKeys || []).join("\0");
                            const cached = (_favFacetCache && _favFacetCache.sig === sig && _favFacetCache.data) || null;
                            let html = '<div class="db-fav-filter-panel" style="display:block;margin:0 0 10px;padding:8px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);border-radius:6px;background:rgba(var(--anima-well-rgb),.10);">';
                            html += '<div style="display:flex;flex-direction:column;gap:6px;">';
                            html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">';
                            html += '<input class="db-fav-filter-q-series" value="' + _favEsc(_favFilterQSeries) + '" placeholder="搜系列…" style="flex:1;min-width:140px;padding:4px 8px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);color:var(--anima-ink-mid);font-size:12px;outline:none;">';
                            if (_favFilter) html += '<button type="button" class="db-fav-filter-clear" style="padding:4px 10px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:rgba(var(--anima-input-rgb),.86);color:var(--anima-ink-strong);cursor:pointer;font-size:11px;">清除筛选</button>';
                            if (!_favShowArtist && (!cached || (cached.artist && cached.artist.length))) html += '<button type="button" class="db-fav-filter-show-artist" style="padding:4px 10px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:rgba(var(--anima-input-rgb),.86);color:var(--anima-ink-strong);cursor:pointer;font-size:11px;">显示画师</button>';
                            html += "</div>";
                            html += '<input class="db-fav-filter-q-char" value="' + _favEsc(_favFilterQChar) + '" placeholder="搜角色…" style="width:100%;box-sizing:border-box;padding:4px 8px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);color:var(--anima-ink-mid);font-size:12px;outline:none;">';
                            html += '<div style="font-size:11px;color:var(--anima-mute-dim);">' + animaTxt("右键角色或系列可设备注") + "</div>";
                            html += "</div>";
                            if (cached) {
                                const facets = cached;
                                const ser = facets.series, cha = facets.character, art = facets.artist;
                                html += _favChipRowHtml("series", "系列", ser);
                                html += _favChipRowHtml("character", _favCharacterTitle(), _favCharacterFacets(facets));
                                html += _favChipRowHtml("artist", "画师", art);
                                if (!ser.length && !cha.length && !art.length) html += '<div class="db-fav-filter-empty" style="color:var(--anima-ink-soft);font-size:12px;margin-top:6px;">暂无系列/角色数据。请到设置里一键为旧收藏补全标签。</div>';
                            } else {
                                html += '<div class="db-fav-filter-loading" style="color:var(--anima-ink-soft);font-size:12px;margin-top:6px;">加载筛选…</div>';
                            }
                            html += "</div>";
                            return html;
                        }
                        function _favFillFilterPanel(root) {
                            if (!_favFilterOpen || !root || !_favPanelItems || !_favPanelKeys) return;
                            _favCollectFacets(_favPanelItems, _favPanelKeys);
                            _favRebuildFilterSections(root);
                        }
                        function _favToggleFilterPanel(root, fallbackRender) {
                            _favFilterOpen = !_favFilterOpen;
                            const btn = root && root.querySelector(".db-fav-filter-toggle");
                            if (btn) btn.textContent = animaTxt("筛选 ") + (_favFilterOpen ? "▴" : "▾");
                            const existing = root && root.querySelector(".db-fav-filter-panel");
                            if (!_favFilterOpen) {
                                if (existing) existing.remove();
                                return;
                            }
                            if (existing) return;
                            const bar = root && root.querySelector(".db-mode-bar");
                            if (!bar || !_favPanelItems || !_favPanelKeys) {
                                if (typeof fallbackRender === "function") fallbackRender();
                                return;
                            }
                            bar.insertAdjacentHTML("afterend", _favFilterPanelHtml(_favPanelItems, _favPanelKeys));
                            const sig = (_favPanelKeys || []).join("\0");
                            if (!(_favFacetCache && _favFacetCache.sig === sig)) {
                                requestAnimationFrame(function() { _favFillFilterPanel(root); });
                            }
                        }
                        function _gelAssignFavs(f) {
                            if (!f || f === favs) {
                                _folders = (favs._folders && favs._folders.images) || {};
                                _favCache = favs;
                                return;
                            }
                            Object.keys(favs).forEach(function(k) { delete favs[k]; });
                            Object.assign(favs, f);
                            _folders = (favs._folders && favs._folders.images) || {};
                            _favCache = favs;
                        }
                        const popup = $el("div",{style:{position:"fixed",inset:0,zIndex:99998,background:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}});
                        const inner = $el("div",{style:{width:_w+"px",height:_h+"px",minWidth:"450px",minHeight:"300px",resize:"both",overflow:"auto",background:"linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)",border:"1px solid rgba(var(--anima-accent-rgb),.45)",borderRadius:"8px",display:"flex",flexDirection:"column"}});
                        if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(inner);
                        inner.classList.add("anima-fav-popup");
                        const saveSize = () => { const r=inner.getBoundingClientRect(); localStorage.setItem("gel_fav_size",JSON.stringify({w:Math.round(r.width),h:Math.round(r.height),sw:sidebarW})); };
                        const closePopup = () => { saveSize(); _favPopupOpen = false; if (window.__animaFavRefresh) delete window.__animaFavRefresh.gel; _destroyGelFavSortables(); popup.remove(); };
                        const _confirmDialog = (title, cb) => {
                            const mask = $el("div",{style:{position:"fixed",inset:0,zIndex:100003,background:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}});
                            const box = $el("div",{style:{background:"linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)",borderRadius:"8px",padding:"20px",minWidth:"280px",textAlign:"center"}});
                            if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(box);
                            box.appendChild($el("div",{textContent:title,style:{color:"#e0e0e0",marginBottom:"16px",fontSize:"14px"}}));
                            const btnRow = $el("div",{style:{display:"flex",gap:"12px",justifyContent:"center"}});
                            btnRow.appendChild($el("button",{textContent:animaTxt("取消"),style:{padding:"8px 24px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",background:"rgba(var(--anima-input-rgb),.86)",color:"#fff",cursor:"pointer",borderRadius:"4px",fontSize:"14px"},onclick:()=>{mask.remove();cb(false);}}));
                            btnRow.appendChild($el("button",{textContent:"确认删除",style:{padding:"8px 24px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",background:"#f87171",color:"#fff",cursor:"pointer",borderRadius:"4px",fontSize:"14px",fontWeight:"bold"},onclick:()=>{mask.remove();cb(true);}}));
                            box.appendChild(btnRow);mask.appendChild(box);mask.addEventListener("click",(e)=>{if(e.target===mask){mask.remove();cb(false);}});document.body.appendChild(mask);
                        };
                        const mainTabBar = $el("div",{style:{display:"flex",borderBottom:"1px solid var(--anima-line)",flexShrink:0}});
                        [{k:"images",l:animaTxt("🖼 图片")},{k:"tags",l:"🏷 标签"}].forEach(mt => {const tb=$el("span",{textContent:mt.l,style:{flex:1,textAlign:"center",padding:"10px",cursor:"pointer",fontSize:"14px",fontWeight:"bold",color:_mainTab===mt.k?"#f87171":"var(--anima-ink-soft)",borderBottom:_mainTab===mt.k?"2px solid #f87171":"2px solid transparent",userSelect:"none"},onclick:()=>{_mainTab=mt.k;_imgPage=0;_tagPage=0;_favFilter=null;_favFacetCache=null;renderPopup();}});mainTabBar.appendChild(tb);});
                        inner.appendChild(mainTabBar);
                        const pagerBar = $el("div",{style:{display:"none",padding:"4px 8px",borderBottom:"1px solid rgba(255,255,255,.10)",background:"rgba(var(--anima-bg-deep-rgb),.62)",flexShrink:0}});
                        inner.appendChild(pagerBar);
                        const bodyArea = $el("div",{style:{flex:1,display:"flex",overflow:"hidden"}});
                        const sidebar = $el("div",{style:{width:sidebarW+"px",overflowY:"auto",padding:"4px 8px",borderRight:"1px solid var(--anima-line)",flexShrink:0,minWidth:"140px"}});
                        const slider = $el("div",{style:{width:"8px",cursor:"col-resize",background:"var(--anima-line)",flexShrink:0,userSelect:"none"},onmouseenter:function(){this.style.background="var(--anima-ink-mid)";},onmouseleave:function(){this.style.background="var(--anima-line)";},onmousedown:(e)=>{e.preventDefault();const sx=e.clientX,sw=sidebarW;const mv=(ev)=>{sidebarW=Math.max(100,Math.min(350,sw+ev.clientX-sx));sidebar.style.width=sidebarW+"px";};const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);saveSize();};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}});
                        const mainArea = $el("div",{style:{flex:1,overflowY:"auto",padding:"6px"}});
                        bodyArea.appendChild(sidebar);bodyArea.appendChild(slider);bodyArea.appendChild(mainArea);inner.appendChild(bodyArea);
                        inner.appendChild($el("button",{textContent:animaTxt("关闭"),style:{padding:"6px 16px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",background:"rgba(var(--anima-well-rgb),.28)",color:"var(--anima-ink)",cursor:"pointer",borderRadius:"3px",margin:"8px",alignSelf:"flex-end"},onclick:closePopup}));
                        const ioBar = $el("div",{style:{display:"flex",gap:"4px",padding:"0 8px 8px 8px",justifyContent:"flex-end"}});
                        ioBar.appendChild($el("button",{textContent:animaTxt("📤 导出"),style:{padding:"4px 10px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",background:"rgba(var(--anima-input-rgb),.86)",color:"var(--anima-ink-soft)",cursor:"pointer",borderRadius:"3px",fontSize:"11px"},onclick:()=>{window.open("/gelbooru_anima/favorites/export","_blank");}}));
                        ioBar.appendChild($el("button",{textContent:animaTxt("📥 导入"),style:{padding:"4px 10px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",background:"rgba(var(--anima-input-rgb),.86)",color:"var(--anima-ink-soft)",cursor:"pointer",borderRadius:"3px",fontSize:"11px"},onclick:()=>{const inp=document.createElement("input");inp.type="file";inp.accept=".json";inp.onchange=async()=>{const f=inp.files[0];if(!f)return;try{const t=await f.text();const d=JSON.parse(t);await fetch("/gelbooru_anima/favorites/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:d,mode:"merge"})});_favCache=null;closePopup();showFavPopup();}catch(e){alert("导入失败: "+e.message);}};inp.click();}}));
                        inner.appendChild(ioBar);
                        popup.appendChild(inner);document.body.appendChild(popup);

                        // ── 收藏夹查看大图覆盖层 ──
                        function _showGelImageOverlay(largeUrl, sampleUrl, thumbUrl, postId) {
                            const _sUrl = largeUrl || sampleUrl || thumbUrl || "";
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
                                        _img.src = "/gelbooru_anima/image_proxy?url=" + encodeURIComponent(thumbUrl);
                                    }
                                }
                            });
                            _img.src = "/gelbooru_anima/image_proxy?url=" + encodeURIComponent(_sUrl);
                            const _bar = $el("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", justifyContent: "center" } });
                            if (largeUrl) {
                                const _viewBtn = $el("span", {
                                    textContent: animaTxt("📥 查看原图"),
                                    style: { padding: "8px 18px", borderRadius: "6px", background: "var(--anima-line)", color: "var(--anima-ink-strong)", cursor: "pointer", fontSize: "14px", fontWeight: "700", border: "1px solid rgba(var(--anima-line-soft-rgb),.42)" },
                                    onclick: () => {
                                        if (_showingOrig) return;
                                        _showingOrig = true;
                                        _viewBtn.textContent = animaTxt("⏳ 加载中...");
                                        _viewBtn.style.opacity = "0.5";
                                        const _testImg = new Image();
                                        _testImg.onload = () => {
                                            _img.src = "/gelbooru_anima/image_proxy?url=" + encodeURIComponent(largeUrl);
                                            _viewBtn.textContent = animaTxt("✅ 原图");
                                            _viewBtn.style.opacity = "1";
                                        };
                                        _testImg.onerror = () => {
                                            _viewBtn.textContent = animaTxt("❌ 原图加载失败");
                                            _viewBtn.style.opacity = "1";
                                            _showingOrig = false;
                                        };
                                        _testImg.src = "/gelbooru_anima/image_proxy?url=" + encodeURIComponent(largeUrl);
                                    }
                                });
                                _bar.appendChild(_viewBtn);
                            }
                            const _dlBtn = $el("span", {
                                textContent: "⏬ 保存",
                                style: { padding: "8px 18px", borderRadius: "6px", background: "#f87171", color: "#fff", cursor: "pointer", fontSize: "14px", fontWeight: "700", border: "1px solid rgba(248,113,113,.55)" },
                                onclick: async () => {
                                    const _targetUrl = _showingOrig ? largeUrl : _sUrl;
                                    if (!_targetUrl) return;
                                    try {
                                        const r = await fetch("/gelbooru_anima/image_proxy?url=" + encodeURIComponent(_targetUrl));
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
                                style: { padding: "8px 18px", borderRadius: "6px", background: "rgba(var(--anima-input-rgb),.86)", color: "var(--anima-ink-strong)", cursor: "pointer", fontSize: "14px", fontWeight: "700", border: "1px solid rgba(var(--anima-line-soft-rgb),.42)" },
                                onclick: () => _ov.remove()
                            });
                            _bar.append(_dlBtn, _closeBtn);
                            _ov.append(_img, _bar);
                            document.body.appendChild(_ov);
                        }

                        function _destroyGelFavSortables() {
                            (_favSortables || []).forEach(function(s) { try { s.destroy(); } catch (e2) {} });
                            _favSortables = [];
                        }
                        function _gelRefreshFavs() {
                            _favCache = null;
                            return _getFavs(true).then(function(f) { _gelAssignFavs(f); renderPopup(); });
                        }
                        function _gelUserFolderLayout() {
                            const folders = _folders || {};
                            const existing = Object.keys(folders).filter(function(nm) { return nm !== "__tmp"; });
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
                            const pinned = dedupe((favs._folder_pinned && favs._folder_pinned.images) || []);
                            const pset = {};
                            pinned.forEach(function(nm) { pset[nm] = true; });
                            let unpinned = dedupe((favs._folder_order && favs._folder_order.images) || []).filter(function(nm) { return !pset[nm]; });
                            const known = {};
                            pinned.concat(unpinned).forEach(function(nm) { known[nm] = true; });
                            existing.forEach(function(nm) { if (!known[nm]) unpinned.push(nm); });
                            return { pinned: pinned, unpinned: unpinned };
                        }
                        function _bindGelFavFolderSortable(wrap, isPinned) {
                            if (!wrap || !wrap.children.length) return;
                            let tries = 0;
                            function go() {
                                if (!window.Sortable || !wrap.isConnected) {
                                    if (++tries > 25) return;
                                    setTimeout(go, 80);
                                    return;
                                }
                                const inst = window.Sortable.create(wrap, {
                                    handle: ".gel-fav-folder-handle",
                                    animation: 150,
                                    ghostClass: "gel-fav-folder-ghost",
                                    group: { name: isPinned ? "gel-fav-pin" : "gel-fav-order", pull: false, put: false },
                                    onStart: function() { _favFolderDragging = true; },
                                    onEnd: function() {
                                        setTimeout(function() { _favFolderDragging = false; }, 50);
                                        const pinW = sidebar.querySelector(".gel-fav-pin-wrap");
                                        const ordW = sidebar.querySelector(".gel-fav-order-wrap");
                                        const readNames = function(w) {
                                            if (!w) return [];
                                            return Array.from(w.querySelectorAll(".gel-fav-folder-row")).map(function(el) { return el.dataset.folderName; }).filter(Boolean);
                                        };
                                        const layout = _gelUserFolderLayout();
                                        const pinned = pinW ? readNames(pinW) : layout.pinned;
                                        const order = ordW ? readNames(ordW) : layout.unpinned;
                                        fetch("/gelbooru_anima/favorites/folder", {
                                            method: "POST", headers: {"Content-Type":"application/json"},
                                            body: JSON.stringify({ action: "reorder", category: "images", pinned: pinned, order: order })
                                        }).then(function(r) { return r.json(); }).then(function(d) {
                                            if (!d || !d.success) {
                                                alert("排序保存失败: " + ((d && d.error) || ""));
                                                _gelRefreshFavs();
                                                return;
                                            }
                                            if (!favs._folder_pinned) favs._folder_pinned = {};
                                            if (!favs._folder_order) favs._folder_order = {};
                                            favs._folder_pinned.images = (d.pinned != null) ? d.pinned : pinned;
                                            favs._folder_order.images = (d.order != null) ? d.order : order;
                                            if (_favCache) {
                                                _favCache._folder_pinned = favs._folder_pinned;
                                                _favCache._folder_order = favs._folder_order;
                                            }
                                        }).catch(function() { _gelRefreshFavs(); });
                                    }
                                });
                                _favSortables.push(inst);
                            }
                            go();
                        }
                        function _gelBindImageDrop(el, folderName) {
                            const sel = function() { return _imgFolder === folderName; };
                            el.addEventListener("dragover", function(e) {
                                e.preventDefault(); e.stopPropagation();
                                el.style.background = "var(--anima-line)";
                                el.style.outline = "2px solid #f87171";
                            });
                            el.addEventListener("dragleave", function() {
                                el.style.background = sel() ? "var(--anima-line)" : "transparent";
                                el.style.outline = "";
                            });
                            el.addEventListener("drop", function(e) {
                                e.preventDefault(); e.stopPropagation();
                                el.style.background = sel() ? "var(--anima-line)" : "transparent";
                                el.style.outline = "";
                                const ids = JSON.parse(e.dataTransfer.getData("text/gel-drag") || "[]");
                                if (!ids.length) return;
                                fetch("/gelbooru_anima/favorites/folder", {
                                    method: "POST", headers: {"Content-Type":"application/json"},
                                    body: JSON.stringify({ action: "move", category: "images", item_keys: ids, target_folder: folderName })
                                }).then(function(r) { return r.json(); }).then(function(d) {
                                    if (d.success) _gelRefreshFavs();
                                });
                            });
                        }
                        function _gelNameDialog(title, initial, cb) {
                            const mask = $el("div", { style: { position: "fixed", inset: 0, zIndex: 100030, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" } });
                            const box = $el("div", { style: { background: "linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)", borderRadius: "8px", padding: "16px", minWidth: "280px" } });
                            box.appendChild($el("div", { textContent: title, style: { color: "#e0e0e0", marginBottom: "10px", fontSize: "14px" } }));
                            const inp = $el("input", { type: "text", value: initial || "", style: { width: "100%", padding: "8px", border: "1px solid rgba(var(--anima-line-soft-rgb),.42)", background: "linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)", color: "#e0e0e0", borderRadius: "4px", boxSizing: "border-box", marginBottom: "12px" } });
                            box.appendChild(inp);
                            const bRow = $el("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" } });
                            bRow.appendChild($el("button", { textContent: animaTxt("取消"), style: { padding: "6px 16px", border: "1px solid rgba(var(--anima-line-soft-rgb),.42)", background: "#f87171", color: "#fff", cursor: "pointer", borderRadius: "3px" }, onclick: function() { mask.remove(); } }));
                            bRow.appendChild($el("button", { textContent: animaTxt("确定"), style: { padding: "6px 16px", border: "1px solid rgba(var(--anima-line-soft-rgb),.42)", background: "linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi))", color: "#fff", cursor: "pointer", borderRadius: "3px" }, onclick: function() {
                                const n = inp.value.trim();
                                mask.remove();
                                if (!n) return;
                                cb(n);
                            } }));
                            box.appendChild(bRow);
                            mask.appendChild(box);
                            mask.addEventListener("click", function(ev) { if (ev.target === mask) mask.remove(); });
                            document.body.appendChild(mask);
                            setTimeout(function() { inp.focus(); inp.select(); }, 50);
                        }
                        function _gelAppendFavFolderRow(host, fname, isPinned) {
                            const cnt = ((_folders[fname]) || []).length;
                            const sel = _imgFolder === fname;
                            const wrap = $el("div", { className: "gel-fav-folder-row", style: { fontSize: "12px", padding: "3px 6px 3px 8px", cursor: "pointer", color: sel ? "var(--anima-ink-mid)" : "var(--anima-ink-soft)", borderRadius: "3px", marginBottom: "1px", background: sel ? "var(--anima-line)" : "transparent", display: "flex", alignItems: "center", gap: "4px", userSelect: "none" } });
                            wrap.dataset.folderName = fname;
                            const handle = $el("span", { className: "gel-fav-folder-handle", textContent: "☰" });
                            handle.addEventListener("click", function(e) { e.stopPropagation(); });
                            const label = $el("span", { className: "gel-fav-folder-label", textContent: (isPinned ? "📌 " : "📁 ") + fname + " (" + cnt + ")", style: { flex: "1", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } });
                            wrap.appendChild(handle);
                            wrap.appendChild(label);
                            wrap.onclick = function() {
                                if (_favFolderDragging) return;
                                _imgFolder = fname;
                                _imgPage = 0;
                                _sel.clear();
                                _favFilter = null;
                                _favFacetCache = null;
                                renderPopup();
                            };
                            _gelBindImageDrop(wrap, fname);
                            wrap.addEventListener("contextmenu", function(e) {
                                e.preventDefault();
                                e.stopPropagation();
                                const menu = $el("div", { style: { position: "fixed", left: e.clientX + "px", top: e.clientY + "px", background: "linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)", border: "1px solid rgba(var(--anima-line-soft-rgb),.42)", borderRadius: "6px", padding: "4px", zIndex: 100031, minWidth: "140px", boxShadow: "0 4px 20px rgba(0,0,0,0.5)" } });
                                const addItem = function(lab, cb) {
                                    const item = $el("div", { textContent: lab, style: { padding: "6px 12px", cursor: "pointer", color: "var(--anima-ink-soft)", fontSize: "13px", borderRadius: "4px" }, onmouseenter: function() { item.style.background = "var(--anima-line)"; }, onmouseleave: function() { item.style.background = "transparent"; }, onclick: function() { menu.remove(); cb(); } });
                                    menu.appendChild(item);
                                };
                                addItem(isPinned ? "📌 取消置顶" : "📌 置顶", function() {
                                    fetch("/gelbooru_anima/favorites/folder", {
                                        method: "POST", headers: {"Content-Type":"application/json"},
                                        body: JSON.stringify({ action: isPinned ? "unpin" : "pin", category: "images", name: fname })
                                    }).then(function(r) { return r.json(); }).then(function(d) {
                                        if (d.success) _gelRefreshFavs();
                                        else alert((isPinned ? "取消置顶" : "置顶") + "失败: " + (d.error || ""));
                                    });
                                });
                                addItem("✏️ 重命名", function() {
                                    _gelNameDialog("重命名文件夹", fname, function(newName) {
                                        if (newName === fname) return;
                                        fetch("/gelbooru_anima/favorites/folder", {
                                            method: "POST", headers: {"Content-Type":"application/json"},
                                            body: JSON.stringify({ action: "rename", category: "images", name: fname, new_name: newName })
                                        }).then(function(r) { return r.json(); }).then(function(d) {
                                            if (d.success) {
                                                if (_imgFolder === fname) _imgFolder = newName;
                                                _gelRefreshFavs();
                                            } else alert("重命名失败: " + (d.error || ""));
                                        });
                                    });
                                });
                                addItem("🗑 删除", function() {
                                    _confirmDialog("删除文件夹「" + fname + "」？图片将移至未分类", function(ok) {
                                        if (!ok) return;
                                        fetch("/gelbooru_anima/favorites/folder", {
                                            method: "POST", headers: {"Content-Type":"application/json"},
                                            body: JSON.stringify({ action: "delete", category: "images", name: fname })
                                        }).then(function(r) { return r.json(); }).then(function(d) {
                                            if (d.success) {
                                                if (_imgFolder === fname) _imgFolder = null;
                                                _gelRefreshFavs();
                                            }
                                        });
                                    });
                                });
                                const closeMenu = function(ev) { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener("click", closeMenu); } };
                                setTimeout(function() { document.addEventListener("click", closeMenu); }, 10);
                                document.body.appendChild(menu);
                            });
                            host.appendChild(wrap);
                        }
                        function _gelRenderUserFolders() {
                            const layout = _gelUserFolderLayout();
                            if (layout.pinned.length) {
                                const pinWrap = $el("div", { className: "gel-fav-pin-wrap" });
                                layout.pinned.forEach(function(fn) { _gelAppendFavFolderRow(pinWrap, fn, true); });
                                sidebar.appendChild(pinWrap);
                                _bindGelFavFolderSortable(pinWrap, true);
                            }
                            if (layout.unpinned.length) {
                                const orderWrap = $el("div", { className: "gel-fav-order-wrap" });
                                layout.unpinned.forEach(function(fn) { _gelAppendFavFolderRow(orderWrap, fn, false); });
                                sidebar.appendChild(orderWrap);
                                _bindGelFavFolderSortable(orderWrap, false);
                            }
                        }

                        function renderPopup() {
                            _destroyGelFavSortables();
                            mainArea.innerHTML = "";
                            pagerBar.style.display = "none";
                            pagerBar.innerHTML = "";
                            mainTabBar.querySelectorAll("span").forEach((s,i)=>{s.style.color=(i===0?"images":"tags")===_mainTab?"#f87171":"var(--anima-ink-soft)";s.style.borderBottom=(i===0?"images":"tags")===_mainTab?"2px solid #f87171":"2px solid transparent";});
                            if (_mainTab==="images") { sidebar.style.display="block";
                                const catData = favs.images||{}; const allKeys = Object.keys(catData).filter(k=>k!=="_order");
                                const folderKeys = new Set(); for (const items of Object.values(_folders)) for (const k of items) folderKeys.add(k);
                                const uncatKeys = allKeys.filter(k=>!folderKeys.has(k));
                                const visibleKeys = _imgFolder===null?uncatKeys:(_imgFolder==="__all"?allKeys:(_imgFolder==="__tmp"?(_folders["__tmp"]||[]).filter(k=>catData[k]):(_folders[_imgFolder]||[]).filter(k=>catData[k])));
                                const order = catData._order||[]; visibleKeys.sort((a,b)=>{const ia=order.indexOf(a),ib=order.indexOf(b);if(ia!==-1&&ib!==-1)return ia-ib;if(ia!==-1)return -1;if(ib!==-1)return 1;return 0;});
                            if (!_favSortAsc) visibleKeys.reverse();
                                let totalPages = 0;
                                let pageKeys = [];
                                _favPageKeys = [];
                                _favViewKeys = [];
                                if (!visibleKeys.length) {
                                    _favPanelItems = catData;
                                    _favPanelKeys = [];
                                    mainArea.appendChild($el("div",{textContent:"暂无收藏图片",style:{textAlign:"center",color:"var(--anima-ink-soft)",padding:"40px"}}));
                                } else {
                                const viewKeys = _favFilter ? visibleKeys.filter(function(k){ return _favItemMatch(catData[k], _favFilter); }) : visibleKeys;
                                _favViewKeys = viewKeys;
                                const head = $el("div",{className:"db-fav-head",style:{position:"sticky",top:0,zIndex:40,isolation:"isolate",background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",marginBottom:"10px"}});
                                head.innerHTML = '<div class="db-mode-bar" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 0 8px;border-bottom:1px solid var(--anima-line);">'
                                    + '<span style="color:#f87171;font-size:13px;font-weight:bold;">☑ 多选</span>'
                                    + '<button type="button" class="db-fav-filter-toggle" style="flex-shrink:0;position:relative;z-index:2;padding:4px 10px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:rgba(var(--anima-input-rgb),.86);color:var(--anima-ink-strong);cursor:pointer;font-size:11px;">筛选 ' + (_favFilterOpen ? "▴" : "▾") + '</button>'
                                    + '<button type="button" class="db-img-sel-all" style="padding:4px 10px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:rgba(var(--anima-input-rgb),.86);color:var(--anima-ink-strong);cursor:pointer;font-size:11px;">' + (_favFilter ? "全选筛选" : "全选") + '</button>'
                                    + '<button type="button" class="db-img-sel-none" style="padding:4px 10px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:rgba(var(--anima-input-rgb),.86);color:var(--anima-ink-strong);cursor:pointer;font-size:11px;">取消</button>'
                                    + '<button type="button" class="gel-fav-sort-btn" style="padding:4px 10px;border-radius:4px;border:1px solid rgba(var(--anima-line-soft-rgb),.42);background:rgba(var(--anima-input-rgb),.86);color:#fbbf24;cursor:pointer;font-size:11px;font-weight:700;">' + (_favSortAsc ? "↑ 旧→新" : "↓ 新→旧") + '</button>'
                                    + '<span class="db-tool-item" style="margin-left:auto;display:flex;align-items:center;gap:4px;font-size:12px;color:var(--anima-ink-soft);">🖼<input class="gel-fav-zoom" type="range" min="0.5" max="2" step="0.1" value="' + _gFavZoom + '" style="width:50px;cursor:pointer;"></span>'
                                    + '</div>'
                                    + _favFilterPanelHtml(catData, visibleKeys);
                                _favPanelItems = catData;
                                _favPanelKeys = visibleKeys;
                                mainArea.appendChild(head);
                                if (_favFilterOpen) {
                                    const _fsig = visibleKeys.join("\0");
                                    if (!(_favFacetCache && _favFacetCache.sig === _fsig)) {
                                        requestAnimationFrame(function() { _favFillFilterPanel(mainArea); });
                                    }
                                }
                                const _zs = head.querySelector(".gel-fav-zoom");
                                if (_zs) {
                                    _zs.oninput = function(){ _gFavZoom = parseFloat(this.value); localStorage.setItem("gel_fav_zoom", _gFavZoom); };
                                    _zs.onchange = function(){ _gFavZoom = parseFloat(this.value); localStorage.setItem("gel_fav_zoom", _gFavZoom); renderPopup(); };
                                }
                                if (!viewKeys.length) {
                                    mainArea.appendChild($el("div",{textContent:"无匹配项",style:{textAlign:"center",color:"var(--anima-ink-soft)",padding:"30px",fontSize:"13px"}}));
                                } else {
                                const PER_PAGE=30;totalPages=Math.ceil(viewKeys.length/PER_PAGE);if(_imgPage>=totalPages)_imgPage=Math.max(0,totalPages-1);
                                pageKeys = viewKeys.slice(_imgPage*PER_PAGE,(_imgPage+1)*PER_PAGE);
                                _favPageKeys = pageKeys;
                                pageKeys.forEach(pid => {
                                    const info=catData[pid]||{};const isSel=_sel.has(pid);
                                    const card = $el("div",{className:"gel-fav-card",style:{display:"inline-block",width:Math.round(200*_gFavZoom)+"px",margin:"3px",verticalAlign:"top",borderRadius:"4px",overflow:"hidden",background:"rgba(var(--anima-well-rgb),.16)",cursor:"pointer",border:isSel?"2px solid #f87171":"2px solid rgba(255,255,255,.12)",position:"relative",transition:"transform .18s ease, box-shadow .18s ease, filter .18s ease"},draggable:true,ondragstart:(e)=>{e.stopPropagation();const ids=_sel.has(pid)?[..._sel]:[pid];e.dataTransfer.setData("text/gel-drag",JSON.stringify(ids));e.dataTransfer.effectAllowed="move";},onmouseenter:()=>{card.style.transform="translateY(-2px)";card.style.filter="brightness(1.12)";card.style.boxShadow="0 6px 18px rgba(0,0,0,0.45)";},onmouseleave:()=>{card.style.transform="";card.style.filter="";card.style.boxShadow="";},onclick:(e)=>{if(e.target.tagName==="INPUT")return;if(_sel.has(pid))_sel.delete(pid);else _sel.add(pid);renderPopup();}});
                                    card.appendChild($el("input",{type:"checkbox",checked:isSel,style:{position:"absolute",top:"4px",left:"4px",zIndex:2,cursor:"pointer"},onclick:(e)=>{e.stopPropagation();}}));
                                    const img=$el("img",{src:info.thumb?"/gelbooru_anima/image_proxy?url="+encodeURIComponent(info.thumb):"",style:{width:"100%",height:Math.round(200*_gFavZoom)+"px",objectFit:"contain",display:"block",background:"rgba(var(--anima-well-rgb),.08)"}});img.onerror=()=>{img.src="";img.alt="#"+pid;};card.appendChild(img);
                                    // 🔍 分类按钮
                                    const clsBtn=$el("span",{className:"gel-hover",textContent:"🔍",title:"画师/角色/系列",style:{position:"absolute",bottom:"4px",left:"4px",background:"rgba(0,0,0,0.78)",color:"var(--anima-ink-strong)",padding:"1px 5px",borderRadius:"6px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",fontSize:"11px",fontWeight:"700",cursor:"pointer",zIndex:3},onclick:(e)=>{e.stopPropagation();
                                        const rect=card.getBoundingClientRect();
                                        const localM=_parseFavMeta(info);
                                        const openGelFavMini=(artists,chars,series)=>{
                                            const mini=$el("div",{style:{position:"fixed",top:(rect.bottom+4)+"px",left:rect.left+"px",width:"200px",maxHeight:"200px",overflowY:"auto",background:"linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)",borderRadius:"6px",padding:"8px",zIndex:100010,boxShadow:"0 4px 16px rgba(0,0,0,0.6)"}});
                                            [{t:"🎨 画师",v:artists||[]},{t:"👤 角色",v:chars||[]},{t:"📺 系列",v:series||[]}].forEach(cat=>{if(!cat.v.length)return;mini.appendChild($el("div",{textContent:cat.t,style:{fontSize:"11px",fontWeight:"bold",color:"var(--anima-ink-mid)",marginBottom:"3px"}}));cat.v.forEach(tag=>{mini.appendChild($el("span",{textContent:tag,style:{display:"inline-block",margin:"1px 3px",padding:"1px 5px",borderRadius:"3px",fontSize:"10px",background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",color:"#e0e0e0",cursor:"pointer"},onclick:(ev)=>{ev.stopPropagation();searchInput.value=tag;mini.remove();closePopup();_page=1;doSearch();}}));});});
                                            if(!(artists||[]).length&&!(chars||[]).length&&!(series||[]).length)mini.appendChild($el("div",{textContent:"暂无分类数据",style:{color:"var(--anima-ink-soft)",fontSize:"11px"}}));
                                            document.body.appendChild(mini);
                                            const closer=(ev)=>{if(!mini.contains(ev.target)){mini.remove();document.removeEventListener("click",closer);}};
                                            setTimeout(()=>document.addEventListener("click",closer),10);
                                        };
                                        if(Array.isArray(localM.series)||Array.isArray(localM.character)||Array.isArray(localM.artist)){openGelFavMini(localM.artist,localM.character,localM.series);return;}
                                        clsBtn.textContent="⏳";
                                        fetch("/gelbooru_anima/post/"+pid).then(r=>r.json()).then(d=>{
                                            clsBtn.textContent="🔍";
                                            if(!d.success||!d.groups)return;
                                            const g=d.groups;
                                            openGelFavMini(g.artist||[],g.character||[],g.series||[]);
                                        }).catch(()=>{clsBtn.textContent="🔍";});
                                    }});
                                    card.appendChild(clsBtn);
                                    // 🖼️ 大图按钮
                                    const largeBtn=$el("span",{className:"gel-hover",textContent:"🖼️",title:"查看大图",style:{position:"absolute",bottom:"4px",right:"4px",background:"rgba(0,0,0,0.78)",color:"var(--anima-ink-strong)",padding:"1px 5px",borderRadius:"6px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",fontSize:"11px",fontWeight:"700",cursor:"pointer",zIndex:3},onclick:(e)=>{e.stopPropagation();_showGelImageOverlay(info.file_url||"",info.sample_url||"",info.thumb||"",pid);}});
                                    card.appendChild(largeBtn);
                                    card.appendChild($el("div",{textContent:"#"+pid,style:{padding:"2px 6px",fontSize:"12px",color:"var(--anima-ink)",textAlign:"center"}}));mainArea.appendChild(card);
                                });
                                }
                                }
                                const _fillPager=()=>{pagerBar.innerHTML="";pagerBar.style.display="none";if(totalPages<=1)return;pagerBar.style.display="flex";pagerBar.style.justifyContent="center";pagerBar.style.alignItems="center";pagerBar.style.gap="8px";const mkPrev=()=>$el("span",{textContent:"◀",style:{padding:"2px 8px",cursor:"pointer",fontWeight:"700",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",borderRadius:"6px",background:"rgba(var(--anima-input-rgb),.86)",color:_imgPage>0?"var(--anima-ink-strong)":"var(--anima-mute-dim)"},onclick:()=>{if(_imgPage>0){_imgPage--;renderPopup();}}});const mkNext=()=>$el("span",{textContent:"▶",style:{padding:"2px 8px",cursor:"pointer",fontWeight:"700",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",borderRadius:"6px",background:"rgba(var(--anima-input-rgb),.86)",color:_imgPage<totalPages-1?"var(--anima-ink-strong)":"var(--anima-mute-dim)"},onclick:()=>{if(_imgPage<totalPages-1){_imgPage++;renderPopup();}}});pagerBar.appendChild(mkPrev());pagerBar.appendChild($el("span",{textContent:"第 ",style:{color:"var(--anima-ink-soft)",fontSize:"12px"}}));const gInp=$el("input",{type:"number",min:"1",max:String(totalPages),value:String(_imgPage+1),style:{width:"50px",padding:"2px 4px",borderRadius:"3px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",color:"var(--anima-ink-mid)",fontSize:"12px",outline:"none"}});const doGoto=()=>{const v=parseInt(gInp.value,10);if(!isNaN(v)){_imgPage=Math.min(Math.max(v,1),totalPages)-1;renderPopup();mainArea.scrollTop=0;}};gInp.addEventListener("keydown",(ev)=>{if(ev.key==="Enter"){ev.stopPropagation();doGoto();}});pagerBar.appendChild(gInp);pagerBar.appendChild($el("span",{textContent:" / "+totalPages+" 页",style:{color:"var(--anima-ink-soft)",fontSize:"12px"}}));pagerBar.appendChild($el("span",{textContent:"跳转",style:{padding:"2px 8px",cursor:"pointer",fontSize:"12px",fontWeight:"700",color:"var(--anima-ink-strong)",background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",borderRadius:"6px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)"},onclick:()=>{doGoto();}}));pagerBar.appendChild(mkNext());};_fillPager();
                                if (_sel.size>0) { const btns=$el("div",{style:{textAlign:"center",padding:"8px 0",borderTop:"1px solid var(--anima-line)"}});btns.appendChild($el("span",{textContent:"已选 "+_sel.size+" 张",style:{color:"var(--anima-ink-soft)",fontSize:"11px",marginRight:"8px"}}));btns.appendChild($el("button",{textContent:"📤 输出",style:{padding:"4px 12px",margin:"0 4px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",background:"linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi))",color:"#fff",cursor:"pointer",borderRadius:"3px",fontSize:"12px"},onclick:()=>{const loaded=[];const allTags=[];for(const k of _sel){const info=catData[k];if(info){loaded.push({id:k,tags:info.cn||"",preview_url:info.thumb||"",sample_url:info.sample_url||info.thumb||"",file_url:info.file_url||"",rating:"general",score:0,width:info.width||0,height:info.height||0,source:info.source||""});allTags.push(...(info.cn||"").split(" ").filter(Boolean));}}if(loaded.length>0){_results=loaded;renderGrid();}const merged=_filterBlacklist([...new Set(allTags)].join(", "));const sw=node.widgets?.find(w=>w.name==="selection_data");if(sw)sw.value=JSON.stringify({mode:"multi",ids:[..._sel],merged_tags:merged});closePopup();}}));btns.appendChild($el("button",{textContent:"🗑 删除",style:{padding:"4px 12px",margin:"0 4px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",background:"#f87171",color:"#fff",cursor:"pointer",borderRadius:"3px",fontSize:"12px"},onclick:()=>{const n=_sel.size;const msg=n>1?"确认删除 "+n+" 张图片？":"确认删除该图片？";_confirmDialog(msg,async(ok)=>{if(!ok)return;for(const k of _sel)await fetch("/gelbooru_anima/favorites/remove",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag:k,category:"images"})});_favCache=null;_sel.clear();closePopup();showFavPopup();});}}));mainArea.appendChild(btns); }
                                sidebar.innerHTML="";const addSI=(label,count,folderName)=>{const sel=_imgFolder===folderName;const div=$el("div",{textContent:label+" ("+count+")",style:{padding:"3px 6px 3px 12px",cursor:"pointer",fontSize:"12px",color:sel?"var(--anima-ink-mid)":"var(--anima-ink-soft)",borderRadius:"3px",background:sel?"var(--anima-line)":"transparent",marginBottom:"1px",userSelect:"none"},onclick:()=>{_imgFolder=folderName;_imgPage=0;_sel.clear();_favFilter=null;_favFacetCache=null;renderPopup();}});if(folderName&&folderName!=="__all"){div.addEventListener("dragover",(e)=>{e.preventDefault();e.stopPropagation();div.style.background="var(--anima-line)";div.style.outline="2px solid #f87171";});div.addEventListener("dragleave",()=>{div.style.background=sel?"var(--anima-line)":"transparent";div.style.outline="";});div.addEventListener("drop",(e)=>{e.preventDefault();e.stopPropagation();div.style.background=sel?"var(--anima-line)":"transparent";div.style.outline="";const ids=JSON.parse(e.dataTransfer.getData("text/gel-drag")||"[]");if(!ids.length)return;fetch("/gelbooru_anima/favorites/folder",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"move",category:"images",item_keys:ids,target_folder:folderName})}).then(r=>r.json()).then(d=>{if(d.success){_favCache=null;_getFavs(true).then(f=>{_gelAssignFavs(f);renderPopup();});}});});if(folderName!=="__tmp"){div.addEventListener("contextmenu",(e)=>{e.preventDefault();e.stopPropagation();_confirmDialog("删除文件夹「"+folderName+"」？图片将移至未分类",(ok)=>{if(!ok)return;fetch("/gelbooru_anima/favorites/folder",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"delete",category:"images",name:folderName})}).then(r=>r.json()).then(d=>{if(d.success){_favCache=null;_getFavs(true).then(f=>{_gelAssignFavs(f);renderPopup();});}});});});}}if(folderName===null){div.addEventListener("dragover",(e)=>{e.preventDefault();e.stopPropagation();div.style.background="var(--anima-line)";div.style.outline="2px solid #f87171";});div.addEventListener("dragleave",()=>{div.style.background=sel?"var(--anima-line)":"transparent";div.style.outline="";});div.addEventListener("drop",(e)=>{e.preventDefault();e.stopPropagation();div.style.background=sel?"var(--anima-line)":"transparent";div.style.outline="";const ids=JSON.parse(e.dataTransfer.getData("text/gel-drag")||"[]");if(!ids.length)return;fetch("/gelbooru_anima/favorites/folder",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"remove_from_all",category:"images",item_keys:ids})}).then(r=>r.json()).then(d=>{if(d.success){_favCache=null;_getFavs(true).then(f=>{_gelAssignFavs(f);renderPopup();});}});});}sidebar.appendChild(div);};
                                addSI("📂 全部",allKeys.length,"__all");addSI("📂 未分类",uncatKeys.length,null);
                                _gelRenderUserFolders();
                                const tmpItems=(_folders["__tmp"]||[]).filter(k=>catData[k]).length;if(tmpItems>0)addSI("📦 临时",tmpItems,"__tmp");
                                sidebar.appendChild($el("div",{textContent:"＋ 新建文件夹",style:{padding:"5px 8px",cursor:"pointer",fontSize:"12px",color:"var(--anima-ink-strong)",fontWeight:"700",userSelect:"none",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",borderRadius:"6px",background:"rgba(var(--anima-input-rgb),.86)"},onclick:()=>{const mask=$el("div",{style:{position:"fixed",inset:0,zIndex:100030,background:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}});const box=$el("div",{style:{background:"linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)",borderRadius:"8px",padding:"16px",minWidth:"280px"}});box.appendChild($el("div",{textContent:"新建文件夹",style:{color:"#e0e0e0",marginBottom:"10px",fontSize:"14px"}}));const inp=$el("input",{type:"text",placeholder:"文件夹名称",style:{width:"100%",padding:"8px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",color:"#e0e0e0",borderRadius:"4px",boxSizing:"border-box",marginBottom:"12px"}});box.appendChild(inp);const bRow=$el("div",{style:{display:"flex",gap:"8px",justifyContent:"flex-end"}});bRow.appendChild($el("button",{textContent:animaTxt("取消"),style:{padding:"6px 16px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",background:"#f87171",color:"#fff",cursor:"pointer",borderRadius:"3px"},onclick:()=>mask.remove()}));bRow.appendChild($el("button",{textContent:animaTxt("确定"),style:{padding:"6px 16px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",background:"linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi))",color:"#fff",cursor:"pointer",borderRadius:"3px"},onclick:()=>{const n=inp.value.trim();mask.remove();if(!n)return;fetch("/gelbooru_anima/favorites/folder",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"create",category:"images",name:n})}).then(r=>r.json()).then(d=>{if(d.success){_favCache=null;_getFavs(true).then(f=>{_gelAssignFavs(f);renderPopup();});}});}}));box.appendChild(bRow);mask.appendChild(box);mask.addEventListener("click",(ev)=>{if(ev.target===mask)mask.remove();});document.body.appendChild(mask);setTimeout(()=>inp.focus(),50);}}));
                            } else { sidebar.style.display="none";
                                const subTabBar=$el("div",{style:{display:"flex",gap:"4px",marginBottom:"8px",alignItems:"center"}});_tagCats.forEach(cat=>{const st=$el("span",{textContent:_tagLabels[cat],style:{padding:"4px 12px",cursor:"pointer",fontSize:"13px",color:_tagTab===cat?"var(--anima-ink-mid)":"var(--anima-ink-soft)",borderBottom:_tagTab===cat?"2px solid var(--anima-ink-mid)":"2px solid transparent",userSelect:"none"},onclick:()=>{_tagTab=cat;_tagPage=0;renderPopup();}});subTabBar.appendChild(st);});
                                const _tagSortLab=_tagFavSort==="rate"?"⭐ 星级":(_tagFavSort==="asc"?"⬆ 最早":"⬇ 最新");
                                const tagSortBtn=$el("span",{textContent:_tagSortLab,title:"点击切换：星级 / 最新 / 最早",style:{marginLeft:"auto",padding:"3px 10px",cursor:"pointer",fontSize:"12px",color:"var(--anima-ink-soft)",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",borderRadius:"6px",background:"rgba(var(--anima-input-rgb),.86)",userSelect:"none"},onclick:()=>{_tagFavSort=_tagFavSort==="rate"?"desc":(_tagFavSort==="desc"?"asc":"rate");try{localStorage.setItem("gel_tag_fav_sort",_tagFavSort);}catch(eTs){}_tagPage=0;renderPopup();}});
                                subTabBar.appendChild(tagSortBtn);mainArea.appendChild(subTabBar);
                                const catData=favs[_tagTab]||{};let keys=Object.keys(catData).filter(k=>k!=="_order");
                                if(window.animaFavGrid&&window.animaFavGrid.sortTagFavKeys) keys=window.animaFavGrid.sortTagFavKeys(keys,catData,_tagFavSort);
                                else { const _tagOrder=Array.isArray(catData._order)?catData._order:[]; keys.sort((a,b)=>{const ia=_tagOrder.indexOf(a),ib=_tagOrder.indexOf(b);if(ia!==-1&&ib!==-1)return ia-ib;if(ia!==-1)return -1;if(ib!==-1)return 1;return 0;}); if(_tagFavSort==="desc") keys.reverse(); }
                                if(!keys.length){mainArea.appendChild($el("div",{textContent:"暂无收藏标签",style:{textAlign:"center",color:"var(--anima-ink-soft)",padding:"40px"}}));}
                                const TAG_PER_PAGE=30;const tagTotalPages=Math.ceil(keys.length/TAG_PER_PAGE);if(_tagPage>=tagTotalPages)_tagPage=Math.max(0,tagTotalPages-1);if(_tagPage<0)_tagPage=0;
                                const pageKeys=keys.slice(_tagPage*TAG_PER_PAGE,(_tagPage+1)*TAG_PER_PAGE);
                                const tagGrid = $el("div",{style:{display:"flex",flexWrap:"wrap",gap:"8px"}});
                                pageKeys.forEach(tag=>{const info=catData[tag]||{};const card=$el("div",{style:{width:"140px",borderRadius:"6px",overflow:"hidden",background:"rgba(var(--anima-well-rgb),.16)",cursor:"pointer",border:"1px solid rgba(255,255,255,.10)"},onclick:()=>{searchInput.value=tag;closePopup();_page=1;doSearch();}});if(info.thumb){const img=$el("img",{src:"/gelbooru_anima/image_proxy?url="+encodeURIComponent(info.thumb),style:{width:"140px",height:"140px",objectFit:"contain",display:"block",background:"rgba(var(--anima-well-rgb),.08)"}});img.onerror=()=>{img.src="";img.alt=tag;};card.appendChild(img);}else{const ph=$el("div",{textContent:"🏷",style:{width:"140px",height:"90px",display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(var(--anima-well-rgb),.08)",color:"rgba(var(--anima-ink-chip-rgb),.78)",fontSize:"16px"}});card.appendChild(ph);}const label=$el("div",{style:{padding:"4px 6px"}});if(info.title){label.appendChild($el("div",{textContent:info.title,style:{fontSize:"12px",fontWeight:"bold",color:"#fbbf24",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}));label.appendChild($el("div",{textContent:tag,style:{fontSize:"11px",color:"var(--anima-ink-soft)"}}));}else{label.appendChild($el("div",{textContent:tag+(info.cn?" · "+info.cn:""),style:{fontSize:"11px",color:"#e0e0e0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}));}const btnRow=$el("div",{style:{display:"flex",gap:"2px",marginTop:"3px"}});btnRow.appendChild($el("span",{textContent:"✏️",title:"编辑名称",style:{flex:1,textAlign:"center",cursor:"pointer",fontSize:"12px",fontWeight:"700",color:"var(--anima-ink-strong)",padding:"2px 4px",borderRadius:"6px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",background:"rgba(var(--anima-input-rgb),.86)"},onclick:(e)=>{e.stopPropagation();const mask=$el("div",{style:{position:"fixed",inset:0,zIndex:100020,background:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}});const box=$el("div",{style:{background:"linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)",borderRadius:"8px",padding:"16px",minWidth:"300px"}});box.appendChild($el("div",{textContent:"编辑标签显示名",style:{color:"#e0e0e0",marginBottom:"6px",fontSize:"14px"}}));box.appendChild($el("div",{textContent:"原标签: "+tag,style:{color:"var(--anima-ink-soft)",fontSize:"11px",marginBottom:"10px"}}));const inp=$el("input",{type:"text",value:info.title||"",placeholder:"自定义显示名",style:{width:"100%",padding:"8px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",color:"#e0e0e0",borderRadius:"4px",boxSizing:"border-box",marginBottom:"12px"}});box.appendChild(inp);const bRow=$el("div",{style:{display:"flex",gap:"8px",justifyContent:"flex-end"}});bRow.appendChild($el("button",{textContent:animaTxt("取消"),style:{padding:"6px 16px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",background:"#f87171",color:"#fff",cursor:"pointer",borderRadius:"3px"},onclick:()=>mask.remove()}));bRow.appendChild($el("button",{textContent:animaTxt("保存"),style:{padding:"6px 16px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",background:"linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi))",color:"#fff",cursor:"pointer",borderRadius:"3px"},onclick:async()=>{const v=inp.value.trim();mask.remove();await fetch("/gelbooru_anima/favorites/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag,category:_tagTab,thumb:info.thumb||"",cn:info.cn||"",title:v})});if(!_favCache[_tagTab])_favCache[_tagTab]={_order:[]};_favCache[_tagTab][tag]={thumb:info.thumb||"",cn:info.cn||"",title:v};renderPopup();}}));box.appendChild(bRow);mask.appendChild(box);mask.addEventListener("click",(ev)=>{if(ev.target===mask)mask.remove();});document.body.appendChild(mask);setTimeout(()=>inp.focus(),50);}}));btnRow.appendChild($el("span",{textContent:"🖼",title:"更换缩略图",style:{flex:1,textAlign:"center",cursor:"pointer",fontSize:"12px",fontWeight:"700",color:"var(--anima-ink-strong)",padding:"2px 4px",borderRadius:"6px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",background:"rgba(var(--anima-input-rgb),.86)"},onclick:(e)=>{e.stopPropagation();showThumbPicker(tag,_tagTab,info);}}));btnRow.appendChild($el("span",{textContent:"✕",title:animaTxt("删除"),style:{flex:1,textAlign:"center",cursor:"pointer",fontSize:"12px",fontWeight:"700",color:"#ffb4b4",padding:"2px 4px",borderRadius:"6px",border:"1px solid rgba(248,113,113,.55)",background:"#2a1616"},onclick:(ev)=>{ev.stopPropagation();_confirmDialog("确认删除标签「"+tag+"」？",async(ok)=>{if(!ok)return;await fetch("/gelbooru_anima/favorites/remove",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag,category:_tagTab})});_favCache=null;await _getFavs(true);renderPopup();});}}));label.appendChild(btnRow);card.appendChild(label);if(window.animaFavGrid&&window.animaFavGrid.makeRateRow){(function(_rtag,_rcat,_rinfo){card.appendChild(window.animaFavGrid.makeRateRow(_rinfo.rating||0,function(n){window.animaFavGrid.rateFavorite("gelbooru",_rtag,_rcat,n).then(function(d){if(!d||!d.success)return;if(!_favCache[_rcat])_favCache[_rcat]={};_favCache[_rcat][_rtag]=Object.assign({},_favCache[_rcat][_rtag]||_rinfo,{rating:n});if(catData[_rtag])catData[_rtag].rating=n;renderPopup();});},{center:true,size:12}));})(tag,_tagTab,info);}tagGrid.appendChild(card);});
                                mainArea.appendChild(tagGrid);
                                pagerBar.innerHTML="";pagerBar.style.display="none";
                                if(tagTotalPages>1){
                                    pagerBar.style.display="flex";pagerBar.style.justifyContent="center";pagerBar.style.alignItems="center";pagerBar.style.gap="8px";
                                    const mkPrev=$el("span",{textContent:"◀",style:{padding:"2px 8px",cursor:"pointer",fontWeight:"700",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",borderRadius:"6px",background:"rgba(var(--anima-input-rgb),.86)",color:_tagPage>0?"var(--anima-ink-strong)":"var(--anima-mute-dim)"},onclick:()=>{if(_tagPage>0){_tagPage--;renderPopup();}}});
                                    const mkNext=$el("span",{textContent:"▶",style:{padding:"2px 8px",cursor:"pointer",fontWeight:"700",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",borderRadius:"6px",background:"rgba(var(--anima-input-rgb),.86)",color:_tagPage<tagTotalPages-1?"var(--anima-ink-strong)":"var(--anima-mute-dim)"},onclick:()=>{if(_tagPage<tagTotalPages-1){_tagPage++;renderPopup();}}});
                                    pagerBar.appendChild(mkPrev);
                                    pagerBar.appendChild($el("span",{textContent:"第 ",style:{color:"var(--anima-ink-soft)",fontSize:"12px"}}));
                                    const gInp=$el("input",{type:"number",min:"1",max:String(tagTotalPages),value:String(_tagPage+1),style:{width:"48px",padding:"2px 4px",borderRadius:"3px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",background:"linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)",color:"var(--anima-ink-mid)",fontSize:"12px"}});
                                    gInp.addEventListener("keydown",(e)=>{if(e.key==="Enter"){const v=parseInt(gInp.value,10);if(!isNaN(v)){_tagPage=Math.min(Math.max(v-1,0),tagTotalPages-1);renderPopup();}}});
                                    pagerBar.appendChild(gInp);
                                    pagerBar.appendChild($el("span",{textContent:" / "+tagTotalPages+" 页",style:{color:"var(--anima-ink-soft)",fontSize:"12px"}}));
                                    pagerBar.appendChild($el("span",{textContent:"跳转",style:{padding:"2px 8px",cursor:"pointer",fontSize:"12px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",borderRadius:"6px",background:"var(--anima-line)",color:"var(--anima-ink-mid)"},onclick:()=>{const v=parseInt(gInp.value,10);if(!isNaN(v)){_tagPage=Math.min(Math.max(v-1,0),tagTotalPages-1);renderPopup();}}}));
                                    pagerBar.appendChild(mkNext);
                                }
                            }
                        }
                        window.__animaFavRefresh = window.__animaFavRefresh || {};
                        window.__animaFavRefresh.gel = function () {
                            _favCache = null;
                            _favFacetCache = null;
                            _getFavs(true).then(function (f) {
                                _gelAssignFavs(f);
                                if (popup.isConnected) renderPopup();
                            });
                        };
                        if (!inner._favFilterBound) {
                            inner._favFilterBound = true;
                            inner.addEventListener("click", function (e) {
                                const _el = (e.target && e.target.nodeType === 1) ? e.target : (e.target && e.target.parentElement);
                                if (!_el) return;
                                if (_el.closest(".db-fav-filter-toggle")) {
                                    e.stopPropagation();
                                    _favToggleFilterPanel(mainArea, renderPopup);
                                    return;
                                }
                                const fchip = _el.closest(".db-fav-fchip");
                                if (fchip) {
                                    e.stopPropagation();
                                    const kind = fchip.getAttribute("data-kind");
                                    const tag = _favNormTag(fchip.getAttribute("data-tag"));
                                    const curSer = _favActiveSeries();
                                    if (kind === "series") {
                                        if (curSer && curSer === tag) _favFilter = null;
                                        else _favFilter = { kind: "series", tag: tag };
                                    } else if (kind === "character") {
                                        if (curSer) {
                                            if (_favFilter && _favFilter.kind === "character" && _favNormTag(_favFilter.tag) === tag && _favNormTag(_favFilter.series || "") === curSer)
                                                _favFilter = { kind: "series", tag: curSer };
                                            else
                                                _favFilter = { kind: "character", tag: tag, series: curSer };
                                        } else if (_favFilter && _favFilter.kind === "character" && !_favFilter.series && _favNormTag(_favFilter.tag) === tag) {
                                            _favFilter = null;
                                        } else {
                                            _favFilter = { kind: "character", tag: tag };
                                        }
                                    } else if (_favFilter && _favFilter.kind === kind && _favNormTag(_favFilter.tag) === tag) {
                                        _favFilter = null;
                                    } else {
                                        _favFilter = { kind: kind, tag: tag };
                                    }
                                    _imgPage = 0;
                                    renderPopup();
                                    return;
                                }
                                if (_el.closest(".db-fav-filter-clear")) {
                                    e.stopPropagation();
                                    _favFilter = null;
                                    _imgPage = 0;
                                    renderPopup();
                                    return;
                                }
                                if (_el.closest(".db-fav-filter-show-artist")) {
                                    e.stopPropagation();
                                    _favShowArtist = true;
                                    const ab = _el.closest(".db-fav-filter-show-artist");
                                    if (ab) ab.remove();
                                    _favRebuildFilterSections(mainArea);
                                    return;
                                }
                                if (_el.closest(".gel-fav-sort-btn")) {
                                    e.stopPropagation();
                                    _favSortAsc = !_favSortAsc;
                                    localStorage.setItem("gel_fav_sort_asc", _favSortAsc ? "1" : "0");
                                    renderPopup();
                                    return;
                                }
                                if (e.target.closest(".db-img-sel-all")) {
                                    e.stopPropagation();
                                    const keys = (_favFilter && _favViewKeys.length) ? _favViewKeys : _favPageKeys;
                                    keys.forEach(function (k) { _sel.add(String(k)); });
                                    renderPopup();
                                    return;
                                }
                                if (e.target.closest(".db-img-sel-none")) {
                                    e.stopPropagation();
                                    _sel.clear();
                                    renderPopup();
                                }
                            });
                            inner.addEventListener("contextmenu", function (e) {
                                const fchip = e.target && e.target.closest ? e.target.closest(".db-fav-fchip") : null;
                                if (!fchip) return;
                                const kind = fchip.getAttribute("data-kind");
                                if (kind !== "series" && kind !== "character") return;
                                e.preventDefault();
                                e.stopPropagation();
                                if (typeof window.animaFacetNoteEdit !== "function") return;
                                const tag = fchip.getAttribute("data-tag") || "";
                                const cn = fchip.getAttribute("data-cn") || "";
                                window.animaFacetNoteEdit({
                                    kind: kind,
                                    tag: tag,
                                    fallback: cn ? (tag + " " + cn) : tag,
                                    onSaved: function() { _favRebuildFilterSections(mainArea); }
                                });
                            });
                            inner.addEventListener("input", function (e) {
                                if (e.target && e.target.matches && e.target.matches(".db-fav-filter-q-series")) {
                                    _favFilterQSeries = e.target.value;
                                    _favRebuildFilterSections(mainArea);
                                } else if (e.target && e.target.matches && e.target.matches(".db-fav-filter-q-char")) {
                                    _favFilterQChar = e.target.value;
                                    _favRebuildFilterSections(mainArea);
                                }
                            });
                        }
                        renderPopup();

                        function showThumbPicker(tag, category, info) {
                            const picker = $el("div",{style:{position:"fixed",inset:0,zIndex:100010,background:"rgba(0,0,0,0.85)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}});
                            picker.appendChild($el("div",{textContent:"为「"+tag+"」选择缩略图",style:{color:"#e0e0e0",fontSize:"16px",marginBottom:"12px"}}));
                            const grid = $el("div",{style:{width:"90vw",maxWidth:"800px",maxHeight:"60vh",overflowY:"auto",display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(120px, 1fr))",gap:"6px",padding:"8px",background:"linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)",borderRadius:"8px"}});
                            grid.innerHTML = '<span style="color:var(--anima-ink-soft);grid-column:1/-1;text-align:center;padding:20px;">搜索中...</span>';
                            picker.appendChild(grid);
                            picker.appendChild($el("button",{textContent:animaTxt("关闭"),style:{margin:"10px 0",padding:"8px 20px",border:"1px solid rgba(var(--anima-line-soft-rgb),.42)",background:"#f87171",color:"#fff",cursor:"pointer",borderRadius:"4px",fontSize:"14px"},onclick:()=>picker.remove()}));
                            picker.addEventListener("click",(ev)=>{if(ev.target===picker)picker.remove();});
                            document.body.appendChild(picker);
                            fetch("/gelbooru_anima/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tags:tag,page:0,limit:36,order:"score:desc"})}).then(r=>r.json()).then(d=>{grid.innerHTML="";if(!d.success||!d.posts||!d.posts.length){grid.innerHTML='<span style="color:var(--anima-ink-soft);grid-column:1/-1;text-align:center;padding:20px;">无结果</span>';return;}d.posts.forEach(p=>{const card=$el("div",{style:{borderRadius:"4px",overflow:"hidden",cursor:"pointer",border:"2px solid transparent",background:"rgba(var(--anima-well-rgb),.16)"},onclick:()=>{const url=p.preview_url||p.sample_url||"";console.log("[Gelbooru] thumb clicked for",tag,category,url);if(url){fetch("/gelbooru_anima/favorites/update_thumb",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag,category,thumb_url:url})}).then(r=>r.json()).then(d2=>{console.log("[Gelbooru] update_thumb response:",d2);if(d2.success){if(!_favCache[category])_favCache[category]={_order:[]};if(!_favCache[category][tag])_favCache[category][tag]={cn:"",title:""};_favCache[category][tag].thumb=url;picker.remove();renderPopup();}else{console.error("update_thumb failed:",d2);}}).catch(e=>{console.error("update_thumb error:",e);});}}});const img=$el("img",{src:"/gelbooru_anima/image_proxy?url="+encodeURIComponent(p.preview_url||p.sample_url||""),style:{width:"100%",height:"120px",objectFit:"contain",display:"block",background:"rgba(var(--anima-well-rgb),.08)"}});img.onerror=()=>{img.src="";img.alt=p.id;};card.appendChild(img);card.appendChild($el("div",{textContent:"★"+p.score,style:{padding:"2px 4px",fontSize:"10px",color:"#fbbf24",textAlign:"center"}}));grid.appendChild(card);});});
                        }
                    });
                }

                function showSettingsPopup() {
                    if (_settingsOpen) return;
                    _settingsOpen = true;
                    _getSettings().then(settings => {
                if (!settings || typeof settings !== "object") settings = {};
                        const popup = $el("div",{style:{position:"fixed",top:0,left:0,width:"100vw",height:"100vh",zIndex:99998,background:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}});
                        const inner = $el("div",{style:{width:"460px",maxHeight:"80vh",background:"linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%)",borderRadius:"8px",overflowY:"auto",display:"flex",flexDirection:"column",padding:"16px"}});
                        inner.appendChild($el("h3",{textContent:"Gelbooru 设置",style:{margin:"0 0 12px",color:"var(--anima-accent-soft)"}}));
                        const fields = [{k:"gelbooru_api_key",l:"API Key",t:"password"},{k:"gelbooru_user_id",l:"User ID",t:"text"}];
                        const inputs = {};
                        fields.forEach(f => {
                            inner.appendChild($el("label",{textContent:f.l,style:{display:"block",fontSize:"12px",color:"#aaa",marginBottom:"4px"}}));
                            const inp = $el("input",{type:f.t,value:settings[f.k]||"",style:{width:"100%",padding:"6px",border:"1px solid var(--anima-line)",background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",color:"#e0e0e0",borderRadius:"3px",boxSizing:"border-box",marginBottom:"10px"}});
                            inner.appendChild(inp); inputs[f.k] = inp;
                        });
                        // 黑名单
                        inner.appendChild($el("label",{textContent:"排除标签",style:{display:"block",fontSize:"12px",color:"#aaa",marginBottom:"4px",marginTop:"6px"}}));
                        const blInp = $el("textarea",{value:settings.blacklist_tags||"",placeholder:"逗号或空格分隔",style:{width:"100%",height:"80px",padding:"6px",border:"1px solid var(--anima-line)",background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",color:"#e0e0e0",borderRadius:"3px",boxSizing:"border-box",marginBottom:"10px",resize:"vertical"}});
                        inner.appendChild(blInp);
                        // 排除图片（客户端隐藏）
                        inner.appendChild($el("label",{textContent:"⊘ 排除图片（含这些 tag 的图不显示）",style:{display:"block",fontSize:"12px",color:"#f87171",marginBottom:"4px",marginTop:"6px"}}));
                        const excInp = $el("textarea",{value:settings.exclude_img_tags||_excludeImgTags,placeholder:"furry, ugly, bad...",style:{width:"100%",height:"60px",padding:"6px",border:"1px solid var(--anima-line)",background:"linear-gradient(165deg,var(--anima-well-lo) 0%,var(--anima-bg-deep) 72%)",color:"#e0e0e0",borderRadius:"3px",boxSizing:"border-box",marginBottom:"10px",resize:"vertical"}});
                        inner.appendChild(excInp);
                        // 原图输出
                        const origLabel = $el("label",{textContent:"原图输出（关闭则用样本图）",style:{display:"block",fontSize:"12px",color:"#aaa",marginBottom:"4px"}});
                        inner.appendChild(origLabel);
                        const origCb = $el("input",{type:"checkbox",checked:_useOriginal,style:{width:"auto",marginBottom:"10px"}});
                        inner.appendChild(origCb);
                        const _favBackfillHost = $el("div", { style: { margin: "8px 0 4px" } });
                        inner.appendChild(_favBackfillHost);
                        if (typeof window.animaMountFavBackfillBtn === "function") window.animaMountFavBackfillBtn(_favBackfillHost, "gel");
                        const btnRow = $el("div",{style:{display:"flex",gap:"8px",justifyContent:"flex-end",marginTop:"8px"}});
                        btnRow.appendChild($el("button",{textContent:animaTxt("取消"),style:{padding:"8px 20px",border:"none",background:"#f87171",color:"#fff",cursor:"pointer",borderRadius:"3px"},onclick:()=>{_settingsOpen=false;popup.remove();}}));
                        btnRow.appendChild($el("button",{textContent:animaTxt("保存"),style:{padding:"8px 20px",border:"none",background:"linear-gradient(180deg,var(--anima-accent-range),var(--anima-accent-hi))",color:"#fff",cursor:"pointer",borderRadius:"3px"},onclick:async()=>{const upd={};fields.forEach(f=>{upd[f.k]=inputs[f.k].value;});upd.blacklist_tags=blInp.value;upd.exclude_img_tags=excInp.value;await fetch("/gelbooru_anima/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(upd)});fields.forEach(f=>{_settingsCache[f.k]=inputs[f.k].value;});_settingsCache.blacklist_tags=blInp.value;localStorage.setItem("gel_blacklist",blInp.value);_blacklist=new Set(blInp.value.split(/[,，\s]+/).filter(Boolean));_excludeImgTags=excInp.value;localStorage.setItem("gel_exclude_img_tags",excInp.value);_excludeEnabled=true;localStorage.removeItem("gel_exclude_disabled");exclToggle.style.background="#f8717133";exclToggle.style.color="#f87171";exclToggle.title="排除图片过滤:开";_useOriginal=origCb.checked;localStorage.setItem("gel_original",_useOriginal?"1":"0");_settingsOpen=false;popup.remove();}}));
                        inner.appendChild(btnRow);
                        if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(inner);
                        popup.appendChild(inner);
                        document.body.appendChild(popup);
                    });
                }

                // Auto-load
                setTimeout(() => { _page = 1; doSearch(); }, 300);

            } catch(err) {
                console.error("[Gelbooru] onNodeCreated error:", err);
                const errDiv = document.createElement("div");
                errDiv.style.cssText = "width:100%;height:100%;background:#2a1616;color:#f87171;padding:20px;font-size:14px;white-space:pre-wrap;overflow:auto;";
                errDiv.textContent = "Gelbooru UI Error:\n" + (err.message || err) + "\n\n" + (err.stack || "");
                this.addDOMWidget("gelbooru_browser_ui", "div", errDiv, { onDraw: () => {} });
            }
        };
    }
});

console.log("[Gelbooru] Extension registered");
