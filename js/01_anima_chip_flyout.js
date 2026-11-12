// Chip hover flyout + Sortable helper (passthrough / advanced / composer)
(function () {
    if (window.__animaChipFlyoutV >= 20) return;
    window.__animaChipFlyoutV = 20;

    var OPEN_MS = 750;
    var CLOSE_MS = 280;
    var W_MIN = -3.0;
    var W_MAX = 3.0;

    var st = document.getElementById("anima-chip-flyout-css");
    if (!st) {
        st = document.createElement("style");
        st.id = "anima-chip-flyout-css";
        (document.head || document.documentElement).appendChild(st);
    }
    st.textContent =
            ".anima-chip-flyout{position:fixed;z-index:100010;pointer-events:auto;min-width:204px;max-width:280px;" +
            "padding:8px;border-radius:12px;color:var(--anima-ink-chip);font-size:12px;font-weight:600;letter-spacing:.01em;" +
            "background:linear-gradient(180deg,rgba(255,255,255,.08),transparent 38%),linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 80%);" +
            "border:1px solid color-mix(in srgb,var(--fly-col,var(--anima-accent-soft)) 58%,transparent);" +
            "box-shadow:inset 3px 0 0 var(--fly-col,var(--anima-accent-soft)),0 18px 40px rgba(0,0,0,.55),0 0 0 1px rgba(var(--anima-bg-deep-rgb),.55);}" +
            ".anima-flyout-thumb{width:100%;height:168px;object-fit:contain;border-radius:8px;display:block;" +
            "background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);margin-bottom:6px;}" +
            ".anima-flyout-pin{display:block;width:100%;margin:0 0 6px;padding:5px 0;border:0;border-radius:8px;cursor:pointer;" +
            "font-size:12px;font-weight:700;color:var(--anima-accent-soft);background:rgba(var(--anima-accent-rgb),.14);}" +
            ".anima-flyout-pin.is-on{color:#ffeb3b;}" +
            ".anima-flyout-pin:hover{background:rgba(var(--anima-accent-rgb),.28);}" +
            ".anima-flyout-rate{margin:0 0 6px;justify-content:center;}" +
            ".anima-flyout-rate button{font-size:16px!important;}" +
            ".anima-flyout-wrow{display:flex;align-items:center;gap:3px;justify-content:center;margin:2px 0 6px;}" +
            ".anima-flyout-wbtn{min-width:28px;height:22px;padding:0 5px;border-radius:6px;border:1px solid rgba(var(--anima-accent-soft-rgb),.28);" +
            "background:rgba(var(--anima-bg-deep-rgb),.72);color:var(--anima-mute);cursor:pointer;font-size:11px;font-weight:700;line-height:20px;}" +
            ".anima-flyout-wbtn:hover{border-color:var(--anima-accent-soft);color:#fff;}" +
            ".anima-flyout-wval{min-width:36px;text-align:center;font-variant-numeric:tabular-nums;color:#fff;font-size:13px;}" +
            ".anima-flyout-reset{display:block;width:100%;margin:0 0 6px;padding:4px 0;border-radius:7px;border:1px dashed rgba(var(--anima-accent-soft-rgb),.35);" +
            "background:transparent;color:var(--anima-accent-soft);cursor:pointer;font-size:11px;font-weight:700;}" +
            ".anima-flyout-reset:hover{background:rgba(var(--anima-accent-rgb),.12);}" +
            ".anima-flyout-acts{display:flex;gap:4px;flex-wrap:wrap;}" +
            ".anima-flyout-act{flex:1 1 auto;min-width:56px;height:24px;padding:0 8px;border-radius:7px;border:1px solid rgba(255,255,255,.12);" +
            "background:rgba(255,255,255,.05);color:var(--anima-ink-chip);cursor:pointer;font-size:11px;font-weight:700;}" +
            ".anima-flyout-act:hover{border-color:var(--fly-col,var(--anima-accent-soft));}" +
            ".anima-flyout-act.is-danger{color:#ff8ea0;border-color:rgba(233,69,96,.35);}" +
            ".anima-flyout-act.is-warn{color:#ffd93d;border-color:rgba(255,217,61,.28);}" +
            ".anima-flyout-act.is-db{width:100%;height:28px;color:var(--anima-accent-soft);border-color:rgba(var(--anima-accent-rgb),.4);background:rgba(var(--anima-accent-rgb),.16);}" +
            ".anima-flyout-empty{padding:16px 8px;text-align:center;color:var(--anima-mute,#aaa);font-size:12px;font-weight:600;}" +
            ".anima-chip-sortable-chosen{z-index:10;box-shadow:0 4px 16px rgba(var(--anima-accent-rgb),.28)!important;}" +
            ".anima-chip-sortable-ghost{opacity:.35;border:1px dashed var(--anima-accent-soft)!important;background:rgba(var(--anima-accent-rgb),.08)!important;}" +
            ".sortable-fallback{opacity:0!important;visibility:hidden!important;pointer-events:none!important;}" +
            ".anima-chip-drag-ghost{position:fixed!important;margin:0!important;pointer-events:none!important;z-index:100020;opacity:.92;transform:none!important;box-sizing:border-box;overflow:visible!important;}" +
            ".anima-chip-check{cursor:pointer;font-size:14px;user-select:none;margin-right:2px;flex-shrink:0;}" +
            ".anima-chip-empty{color:#555;font-size:12px;}" +
            ".anima-chip-marquee{position:fixed;z-index:100015;pointer-events:none;box-sizing:border-box;" +
            "border:1px dashed var(--anima-accent-soft);background:rgba(var(--anima-accent-rgb),.18);border-radius:3px;display:none;}" +
            ".anima-chip-marquee.is-on{display:block;}" +
            ".anima-chip-area-pick{cursor:crosshair;}" +
            ".anima-chip-area-pick .anima-tag-chip{cursor:pointer;}" +
            ".anima-chip-area-pick .anima-tag-chip.is-sel{cursor:grab;}" +
            ".anima-chip-area-pick .anima-tag-chip.is-batch-lift{opacity:.4;}" +
            ".anima-chip-drop-mark{position:fixed;z-index:100016;width:2px;margin:0;padding:0;background:var(--anima-accent-soft);" +
            "border-radius:1px;display:none;pointer-events:none;box-shadow:0 0 8px rgba(var(--anima-accent-rgb),.85);}" +
            ".anima-chip-drop-mark.is-on{display:block;}" +
            ".anima-chip-batch-badge{position:absolute;right:-7px;top:-7px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;" +
            "background:#e94560;color:#fff;font-size:11px;font-weight:800;line-height:18px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.45);}" +
            ".anima-tag-chip.is-mq{box-shadow:0 0 0 1px var(--anima-accent-soft),0 0 10px rgba(var(--anima-accent-rgb),.35)!important;}";

    function flag(v) { return typeof v === "function" ? !!v() : !!v; }

    function clampW(w) {
        w = Number(w);
        if (!isFinite(w)) w = 1;
        w = Math.round(w * 10) / 10;
        if (w < W_MIN) w = W_MIN;
        if (w > W_MAX) w = W_MAX;
        return w;
    }

    window.animaClampWeight = clampW;

    window.animaHasWeight = function (w) {
        return w != null && isFinite(Number(w)) && Math.abs(Number(w) - 1) > 0.01;
    };

    window.animaArtistNorm = function (s) {
        return String(s || "")
            .replace(/^@+/, "")
            .replace(/\\\(/g, "(")
            .replace(/\\\)/g, ")")
            .replace(/_/g, " ")
            .trim()
            .toLowerCase();
    };

    window.animaToDanbooruArtistTag = function (tag, slug) {
        var s = slug ? String(slug) : "";
        if (!s) {
            var p = window.animaParseWeightTag ? window.animaParseWeightTag(tag) : { tag: String(tag || "") };
            s = String(p.tag || tag || "");
        }
        s = s.replace(/^@+/, "").replace(/^artist:/i, "");
        s = s.replace(/\\\(/g, "(").replace(/\\\)/g, ")");
        return s.trim().replace(/\s+/g, "_").toLowerCase();
    };

    window.animaParseWeightTag = function (raw) {
        var s = String(raw == null ? "" : raw).trim();
        if (!s) return { tag: "", weight: 1 };
        var weight = 1, peeled = false, guard = 0;
        while (guard++ < 8) {
            var m = s.match(/^\((.+):[ \t]*(-?\d+(?:\.\d+)?)[ \t]*\)$/);
            if (!m) break;
            s = m[1].trim();
            if (!peeled) {
                var n = Number(m[2]);
                if (isFinite(n)) weight = n;
                peeled = true;
            }
        }
        return { tag: s, weight: isFinite(weight) ? weight : 1 };
    };

    window.animaChipLooksArtist = function (tag, favList) {
        var p = window.animaParseWeightTag(tag);
        var inner = p.tag || "";
        if (!inner) return false;
        var bare = inner.replace(/^\s*\(+/, "");
        if (bare.charAt(0) === "@") return true;
        if (!favList || !favList.length) return false;
        var n = window.animaArtistNorm(inner);
        if (!n) return false;
        for (var i = 0; i < favList.length; i++) {
            if (window.animaArtistNorm(favList[i].tag) === n) return true;
        }
        return false;
    };

    window.animaFmtWeightTag = function (tag, w) {
        var p = window.animaParseWeightTag(tag);
        var base = p.tag || String(tag || "");
        var ww = (w != null && isFinite(Number(w))) ? Number(w) : p.weight;
        return window.animaHasWeight(ww) ? "(" + base + ":" + Number(ww).toFixed(1) + ")" : base;
    };

    window.animaChipLabel = function (tag, w, merged) {
        var p = window.animaParseWeightTag(tag);
        var base = p.tag || String(tag || "");
        var show = merged ? base.replace(/; /g, ", ") : base;
        var ww = (w != null && isFinite(Number(w))) ? Number(w) : p.weight;
        if (window.animaHasWeight(ww)) return "(" + show + ":" + Number(ww).toFixed(1) + ")";
        return show;
    };

    window.animaKillChipFlyouts = function () {
        try {
            document.querySelectorAll(".anima-chip-flyout,.ps-artist-hover").forEach(function (x) { x.remove(); });
        } catch (e) {}
    };

    window.animaChipSortableEnabled = function () {
        try { return localStorage.getItem("anima_chip_sortable") !== "0"; } catch (e) { return true; }
    };

    window.animaEnsureSortableScript = function () {
        if (window.Sortable) return;
        if (document.getElementById("apc-sortable-js") || document.getElementById("tp-sortable-js") || document.getElementById("anima-sortable-js")) return;
        var s = document.createElement("script");
        s.id = "anima-sortable-js";
        s.src = window.animaAsset("sortable.min.js");
        document.head.appendChild(s);
    };


    var _chipGhost = null;
    var _chipGhostOffX = 0;
    var _chipGhostOffY = 0;
    var _chipGhostMove = null;
    var _chipGhostUp = null;

    window.animaDetachChipDragGhost = function () {
        if (_chipGhostMove) {
            document.removeEventListener("pointermove", _chipGhostMove, true);
            document.removeEventListener("mousemove", _chipGhostMove, true);
            _chipGhostMove = null;
        }
        if (_chipGhostUp) {
            document.removeEventListener("pointerup", _chipGhostUp, true);
            document.removeEventListener("mouseup", _chipGhostUp, true);
            _chipGhostUp = null;
        }
        if (_chipGhost) {
            try { _chipGhost.remove(); } catch (e) {}
            _chipGhost = null;
        }
        try {
            document.querySelectorAll(".sortable-fallback").forEach(function (el) {
                el.style.opacity = "0";
                el.style.visibility = "hidden";
            });
        } catch (e) {}
    };

    window.animaAttachChipDragGhost = function (item, origEvt) {
        window.animaDetachChipDragGhost();
        if (!item) return;
        var r = item.getBoundingClientRect();
        var cx = origEvt && origEvt.clientX != null ? origEvt.clientX : r.left + r.width / 2;
        var cy = origEvt && origEvt.clientY != null ? origEvt.clientY : r.top + r.height / 2;
        _chipGhostOffX = cx - r.left;
        _chipGhostOffY = cy - r.top;
        if (!(_chipGhostOffX >= 0) || _chipGhostOffX > r.width) _chipGhostOffX = r.width / 2;
        if (!(_chipGhostOffY >= 0) || _chipGhostOffY > r.height) _chipGhostOffY = r.height / 2;
        var ghost = item.cloneNode(true);
        ghost.classList.remove(
            "anima-chip-sortable-chosen", "anima-chip-sortable-ghost",
            "apc-sortable-chosen", "apc-sortable-ghost", "is-drag", "is-drop"
        );
        ghost.classList.add("anima-chip-drag-ghost");
        ghost.style.position = "fixed";
        ghost.style.left = (cx - _chipGhostOffX) + "px";
        ghost.style.top = (cy - _chipGhostOffY) + "px";
        ghost.style.width = r.width + "px";
        ghost.style.height = r.height + "px";
        ghost.style.margin = "0";
        ghost.style.zIndex = "100020";
        ghost.style.pointerEvents = "none";
        ghost.style.opacity = "0.92";
        ghost.style.transform = "none";
        ghost.style.boxSizing = "border-box";
        document.body.appendChild(ghost);
        _chipGhost = ghost;
        _chipGhostMove = function (e) {
            if (!_chipGhost) return;
            _chipGhost.style.left = (e.clientX - _chipGhostOffX) + "px";
            _chipGhost.style.top = (e.clientY - _chipGhostOffY) + "px";
        };
        _chipGhostUp = function () { window.animaDetachChipDragGhost(); };
        document.addEventListener("pointermove", _chipGhostMove, true);
        document.addEventListener("mousemove", _chipGhostMove, true);
        document.addEventListener("pointerup", _chipGhostUp, true);
        document.addEventListener("mouseup", _chipGhostUp, true);
        requestAnimationFrame(function () {
            try {
                document.querySelectorAll(".sortable-fallback").forEach(function (el) {
                    el.style.opacity = "0";
                    el.style.visibility = "hidden";
                    el.style.pointerEvents = "none";
                });
            } catch (e) {}
        });
    };

    window.animaHiddenChipClickUnhide = function (e, unhideFn) {
        if (!e || typeof unhideFn !== "function") return;
        if (window.__animaChipMarquee) return;
        var sx = e.clientX, sy = e.clientY, done = false;
        function onUp(ev) {
            if (done) return;
            done = true;
            document.removeEventListener("mouseup", onUp, true);
            document.removeEventListener("pointerup", onUp, true);
            if (window.__animaChipDragging) return;
            var cx = ev && ev.clientX != null ? ev.clientX : sx;
            var cy = ev && ev.clientY != null ? ev.clientY : sy;
            if (Math.abs(cx - sx) + Math.abs(cy - sy) > 6) return;
            unhideFn();
        }
        document.addEventListener("mouseup", onUp, true);
        document.addEventListener("pointerup", onUp, true);
    };

    window.animaBindChipSortable = function (container, opts) {
        opts = opts || {};
        if (!container || container._animaSortableBound) return;
        if (!window.animaChipSortableEnabled()) return;
        container._animaSortableBound = true;
        window.animaEnsureSortableScript();
        var tries = 0;
        function go() {
            if (!window.animaChipSortableEnabled()) return;
            if (!window.Sortable) {
                if (++tries < 25) setTimeout(go, 200);
                return;
            }
            if (container._animaSortable) return;
            var cheapSort = window.animaCheapFx && window.animaCheapFx();
            container._animaSortable = window.Sortable.create(container, {
                animation: cheapSort ? 0 : 150,
                swapAnimation: !cheapSort,
                draggable: ".anima-tag-chip",
                filter: function (evt) {
                    var t = evt && evt.target;
                    if (t && t.closest && t.closest(".anima-chip-check")) return true;
                    if (opts.isDisabled && opts.isDisabled()) return true;
                    return false;
                },
                preventOnFilter: true,
                forceFallback: true,
                fallbackOnBody: true,
                fallbackTolerance: 4,
                touchStartThreshold: 6,
                chosenClass: "anima-chip-sortable-chosen",
                ghostClass: "anima-chip-sortable-ghost",
                onStart: function (evt) {
                    window.__animaChipDragging = true;
                    window.animaKillChipFlyouts();
                    window.animaAttachChipDragGhost(evt.item, evt.originalEvent);
                    if (opts.onStart) opts.onStart(evt);
                },
                onMove: function () {
                    if (opts.isDisabled && opts.isDisabled()) return false;
                    return true;
                },
                onEnd: function (evt) {
                    window.__animaChipDragging = false;
                    window.animaDetachChipDragGhost();
                    var from = evt.oldIndex, to = evt.newIndex;
                    if (from === to) return;
                    if (opts.onReorder) setTimeout(function () { opts.onReorder(from, to); }, 0);
                }
            });
            container._animaSortableSetDisabled = function (d) {
                try { container._animaSortable.option("disabled", !!d); } catch (e) {}
            };
            if (opts.isDisabled && opts.isDisabled()) container._animaSortableSetDisabled(true);
        }
        go();
    };

    window.animaBindLegacyChipDragStart = function (e, chip, area, opts) {
        opts = opts || {};
        e.preventDefault();
        window.__animaChipDragging = true;
        var idx = typeof opts.getIndex === "function" ? opts.getIndex() : parseInt(chip.dataset.ci, 10);
        var dragOn = false;
        var ghost = null;
        var hl = null;
        function atPoint(x, y) {
            var cs = area.querySelectorAll("[data-ci]");
            for (var i = 0; i < cs.length; i++) {
                var r = cs[i].getBoundingClientRect();
                if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return cs[i];
            }
            return null;
        }
        function restore(el) {
            if (!el) return;
            el.classList.remove("is-drop");
            el.classList.remove("is-drag");
        }
        chip.classList.add("is-drag");
        function mm(ev) {
            if (!dragOn) {
                dragOn = true;
                var r0 = chip.getBoundingClientRect();
                ghost = chip.cloneNode(true);
                ghost.classList.add("anima-chip-drag-ghost");
                ghost.style.position = "fixed";
                ghost.style.pointerEvents = "none";
                ghost.style.zIndex = 100020;
                ghost.style.opacity = "0.92";
                ghost.style.transform = "none";
                ghost.style.width = r0.width + "px";
                ghost.style.height = r0.height + "px";
                ghost.style.margin = "0";
                ghost._offX = e.clientX - r0.left;
                ghost._offY = e.clientY - r0.top;
                document.body.appendChild(ghost);
            }
            ev.preventDefault();
            ghost.style.left = (ev.clientX - ghost._offX) + "px";
            ghost.style.top = (ev.clientY - ghost._offY) + "px";
            var el = atPoint(ev.clientX, ev.clientY);
            if (el === hl) return;
            if (hl) restore(hl);
            hl = null;
            if (el && el.dataset.ci !== String(idx)) {
                el.classList.add("is-drop");
                hl = el;
            }
        }
        function mu(ev) {
            window.__animaChipDragging = false;
            document.removeEventListener("mousemove", mm, true);
            document.removeEventListener("mouseup", mu, true);
            if (ghost) { ghost.remove(); ghost = null; }
            var swapped = false;
            if (dragOn) {
                var te = atPoint(ev.clientX, ev.clientY) || (ev.target.closest ? ev.target.closest("[data-ci]") : null);
                if (te) {
                    var to = parseInt(te.dataset.ci, 10);
                    if (to !== idx && opts.getTags && opts.setTags) {
                        var t = opts.getTags();
                        var it = t.splice(idx, 1)[0];
                        t.splice(to, 0, it);
                        opts.setTags(t);
                        swapped = true;
                    }
                }
            }
            if (!swapped) {
                var ac = area.querySelectorAll("[data-ci]");
                for (var i = 0; i < ac.length; i++) restore(ac[i]);
            }
        }
        document.addEventListener("mousemove", mm, true);
        document.addEventListener("mouseup", mu, true);
    };

    function mkBtn(cls, text, onClick) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = cls;
        b.textContent = text;
        b.onmousedown = function (e) { e.preventDefault(); e.stopPropagation(); };
        b.onclick = function (e) { e.stopPropagation(); onClick(e, b); };
        return b;
    }

    window.animaBindChipFlyout = function (chip, opts) {
        opts = opts || {};
        var openT = null, closeT = null, pop = null, gen = 0;

        function flyoutThumbSrc(info) {
            info = info || {};
            var g = window.animaFavGrid;
            var tag = (info.found && info.found.tag) || "";
            if (!tag && opts.tag) {
                tag = window.animaToDanbooruArtistTag ? window.animaToDanbooruArtistTag(opts.tag) : String(opts.tag).replace(/^@+/, "").replace(/\s+/g, "_");
            }
            if (g && g.live && g.live()) {
                if (g.liveThumb) {
                    var lv = g.liveThumb(tag) || g.liveThumb(opts.tag);
                    if (lv) return lv;
                }
                if (opts.cat === "artists" || opts.kind === "artist") return "";
            }
            if (g && g.localThumb && tag) {
                var loc = g.localThumb("danbooru", tag) || g.localThumb("gelbooru", tag);
                if (!loc && tag.charAt(0) === "@") loc = g.localThumb("danbooru", tag.slice(1)) || g.localThumb("gelbooru", tag.slice(1));
                if (loc) return loc;
            }
            if (info.useAdexProxy && info.thumbUrl) {
                return "/danbooru_anima/animadex_image?url=" + encodeURIComponent(info.thumbUrl);
            }
            if (info.thumbUrl && g && typeof g.favSrc === "function") {
                var srcKind = (info.source === "gelbooru" || /gelbooru\.com/i.test(info.thumbUrl)) ? "gelbooru" : "danbooru";
                return g.favSrc(info.thumbUrl, srcKind, tag);
            }
            if (info.thumbUrl && typeof opts.favImgUrl === "function") return opts.favImgUrl(info.thumbUrl);
            return info.thumbUrl || "";
        }
        function mountFlyoutThumb(info) {
            if (!pop) return;
            var src = flyoutThumbSrc(info);
            var im = pop.querySelector(".anima-flyout-thumb");
            if (!src) {
                if (im) try { im.remove(); } catch (e0) {}
                return;
            }
            if (im) {
                if ((im.getAttribute("src") || "") !== src) im.src = src;
                return;
            }
            var empty = pop.querySelector(".anima-flyout-empty");
            if (empty) empty.remove();
            im = document.createElement("img");
            im.className = "anima-flyout-thumb";
            im.decoding = "async";
            im.src = src;
            im.onerror = function () { this.style.display = "none"; };
            pop.insertBefore(im, pop.firstChild);
        }
        function disabled() {
            if (window.__animaChipDragging) return true;
            if (opts.disabled && opts.disabled()) return true;
            return false;
        }
        function kill() {
            if (openT) { clearTimeout(openT); openT = null; }
            if (closeT) { clearTimeout(closeT); closeT = null; }
            gen++;
            if (pop) { try { pop.remove(); } catch (e) {} pop = null; }
            if (typeof opts.onClose === "function") {
                try { opts.onClose(); } catch (e0) {}
            }
        }
        function scheduleClose() {
            if (closeT) clearTimeout(closeT);
            closeT = setTimeout(function () { kill(); }, CLOSE_MS);
        }
        function cancelClose() {
            if (closeT) { clearTimeout(closeT); closeT = null; }
        }
        function place(el) {
            var rc = chip.getBoundingClientRect();
            var w = el.offsetWidth || 220;
            var h = el.offsetHeight || 80;
            var x = Math.min(Math.max(8, rc.left), window.innerWidth - w - 8);
            var y = rc.top - h - 8;
            if (y < 8) y = rc.bottom + 8;
            if (y + h > window.innerHeight - 8) y = Math.max(8, window.innerHeight - h - 8);
            el.style.left = x + "px";
            el.style.top = y + "px";
        }
        function applyWeight(delta, reset) {
            var cur = opts.getWeight ? Number(opts.getWeight()) : 1;
            if (!isFinite(cur)) cur = 1;
            var nw = reset ? 1 : clampW(cur + delta);
            if (opts.setWeight) opts.setWeight(nw);
            if (pop) {
                var val = pop.querySelector(".anima-flyout-wval");
                if (val) val.textContent = (Math.abs(nw - 1) < 0.01 ? "1.0" : nw.toFixed(1));
            }
        }
        function rateValue(info) {
            if (typeof opts.getRating === "function") return opts.getRating(info);
            var found = info && info.found;
            if (window.animaFavGrid && typeof window.animaFavGrid.clampRating === "function") {
                return window.animaFavGrid.clampRating(found && found.rating);
            }
            var n = parseInt(found && found.rating, 10);
            if (!isFinite(n) || n < 0) n = 0;
            if (n > 5) n = 5;
            return n;
        }
        function canRate(info) {
            if (opts.noRate) return false;
            if (typeof opts.onRate !== "function") return false;
            if (!window.animaFavGrid || typeof window.animaFavGrid.makeRateRow !== "function") return false;
            var found = info && info.found;
            return !!(found && (found.inFav || found.starred));
        }
        function mountRate(info) {
            if (!pop || !canRate(info)) return;
            var old = pop.querySelector(".anima-flyout-rate");
            if (old) old.remove();
            var row = window.animaFavGrid.makeRateRow(rateValue(info), function (n) {
                if (info && info.found) info.found.rating = n;
                if (pop && pop._info && pop._info.found) pop._info.found.rating = n;
                mountRate(info);
                place(pop);
                opts.onRate(n, info);
            }, { center: true, size: 16 });
            row.classList.add("anima-flyout-rate");
            var pin = pop.querySelector(".anima-flyout-pin");
            var thumb = pop.querySelector(".anima-flyout-thumb, .anima-flyout-empty");
            if (pin && pin.nextSibling) pop.insertBefore(row, pin.nextSibling);
            else if (pin) pop.appendChild(row);
            else if (thumb && thumb.nextSibling) pop.insertBefore(row, thumb.nextSibling);
            else if (thumb) pop.appendChild(row);
            else pop.appendChild(row);
        }
        function show(info) {
            if (disabled()) return;
            var hidden = flag(opts.isHidden);
            window.animaKillChipFlyouts();
            pop = document.createElement("div");
            pop.className = "anima-chip-flyout ps-artist-hover";
            var col = "";
            try { col = getComputedStyle(chip).getPropertyValue("--chip-col").trim(); } catch (e) {}
            if (col) pop.style.setProperty("--fly-col", col);

            if (info && (info.thumbUrl || opts.tag)) {
                mountFlyoutThumb(info);
            }
            if (info && info.found && opts.onPin) {
                var pin = mkBtn("anima-flyout-pin" + (info.found.starred ? " is-on" : ""), info.found.starred ? animaTxt("★ 已置顶") : animaTxt("⭐ 收藏置顶"), function (e, b) {
                    Promise.resolve(opts.onPin(info.found, b)).then(function () {
                        if (!pop) return;
                        if (info.found) info.found.inFav = true;
                        mountRate(info);
                        place(pop);
                    });
                });
                pop.appendChild(pin);
            }
            mountRate(info);

            if (opts.getWeight && opts.setWeight) {
                var wrow = document.createElement("div");
                wrow.className = "anima-flyout-wrow";
                var cur = Number(opts.getWeight());
                if (!isFinite(cur)) cur = 1;
                function addDelta(label, d) {
                    wrow.appendChild(mkBtn("anima-flyout-wbtn", label, function () { applyWeight(d, false); }));
                }
                addDelta("−1", -1);
                addDelta("−.5", -0.5);
                addDelta("−.1", -0.1);
                var val = document.createElement("span");
                val.className = "anima-flyout-wval";
                val.textContent = (Math.abs(cur - 1) < 0.01 ? "1.0" : Number(cur).toFixed(1));
                wrow.appendChild(val);
                addDelta("+.1", 0.1);
                addDelta("+.5", 0.5);
                addDelta("+1", 1);
                pop.appendChild(wrow);
                pop.appendChild(mkBtn("anima-flyout-reset", animaTxt("复位 1.0"), function () { applyWeight(0, true); }));
            }

            var acts = document.createElement("div");
            acts.className = "anima-flyout-acts";
            if (opts.onHide) {
                acts.appendChild(mkBtn("anima-flyout-act", hidden ? animaTxt("显示") : animaTxt("隐藏"), function () {
                    opts.onHide();
                    kill();
                }));
            }
            if (opts.onDelete) {
                acts.appendChild(mkBtn("anima-flyout-act is-danger", animaTxt("删除"), function () {
                    opts.onDelete();
                    kill();
                }));
            }
            if (flag(opts.isMerged) && opts.onUnmerge) {
                acts.appendChild(mkBtn("anima-flyout-act is-warn", animaTxt("拆解"), function () {
                    opts.onUnmerge();
                    kill();
                }));
            }
            if (typeof opts.onDanbooru === "function") {
                acts.appendChild(mkBtn("anima-flyout-act is-db", animaTxt("🔍 去D站"), function () {
                    opts.onDanbooru(pop && pop._info ? pop._info : (info || {}));
                }));
            }
            if (typeof opts.onGelbooru === "function") {
                acts.appendChild(mkBtn("anima-flyout-act is-db", animaTxt("🔍 去G站"), function () {
                    opts.onGelbooru(pop && pop._info ? pop._info : (info || {}));
                }));
            }
            if (acts.childNodes.length) pop.appendChild(acts);

            pop._info = info || {};
            pop.onmouseenter = function () { cancelClose(); };
            pop.onmouseleave = function () { scheduleClose(); };
            document.body.appendChild(pop);
            place(pop);
        }

        function fillArtist(info) {
            if (!pop) return;
            info = info || {};
            pop._info = info;
            mountFlyoutThumb(info);
            if (!pop.querySelector(".anima-flyout-thumb") && !pop.querySelector(".anima-flyout-empty")) {
                var em = document.createElement("div");
                em.className = "anima-flyout-empty";
        em.textContent = (window.animaFavGrid && window.animaFavGrid.live && window.animaFavGrid.live() && (opts.cat === "artists" || opts.kind === "artist")) ? animaTxt("没有单画师缩略图") : animaTxt("无缩略图");
                pop.insertBefore(em, pop.firstChild);
            }
            if (info.found && opts.onPin && !pop.querySelector(".anima-flyout-pin")) {
                var pin = mkBtn("anima-flyout-pin" + (info.found.starred ? " is-on" : ""), info.found.starred ? animaTxt("★ 已置顶") : animaTxt("⭐ 收藏置顶"), function (e, b) {
                    Promise.resolve(opts.onPin(info.found, b)).then(function () {
                        if (!pop) return;
                        if (info.found) info.found.inFav = true;
                        mountRate(info);
                        place(pop);
                    });
                });
                var thumbEl = pop.querySelector(".anima-flyout-thumb");
                if (thumbEl && thumbEl.nextSibling) pop.insertBefore(pin, thumbEl.nextSibling);
                else if (thumbEl) pop.appendChild(pin);
                else pop.insertBefore(pin, pop.firstChild.nextSibling);
            }
            mountRate(info);
            place(pop);
        }

        function openFlyout(requireHover) {
            if (disabled() || !chip.isConnected) return;
            if (requireHover && !chip.matches(":hover")) return;
            var my = ++gen;
            function paint(info) {
                if (my !== gen) return;
                if (disabled() || !chip.isConnected) return;
                if (requireHover && !chip.matches(":hover")) return;
                if (pop && pop.isConnected) fillArtist(info || {});
                else show(info || {});
            }
            if (!requireHover) {
                if (!(pop && pop.isConnected)) show({});
                if (typeof opts.resolveArtist === "function") {
                    opts.resolveArtist().then(function (info) {
                        if (my !== gen || !pop || !pop.isConnected) return;
                        fillArtist(info || {});
                    }).catch(function () {});
                }
                return;
            }
            if (typeof opts.resolveArtist === "function") {
                opts.resolveArtist().then(paint).catch(function () { paint({}); });
            } else {
                show({});
            }
        }
        chip.addEventListener("mouseenter", function () {
            if (opts.hover === false) return;
            if (disabled()) return;
            cancelClose();
            if (openT) clearTimeout(openT);
            var delay = (typeof opts.openMs === "number") ? opts.openMs : OPEN_MS;
            openT = setTimeout(function () {
                openT = null;
                openFlyout(true);
            }, delay);
        });
        if (opts.rightClick) {
            chip.addEventListener("contextmenu", function (e) {
                if (opts.ignore && e.target && e.target.closest && e.target.closest(opts.ignore)) return;
                if (disabled()) return;
                e.preventDefault();
                e.stopPropagation();
                if (openT) { clearTimeout(openT); openT = null; }
                cancelClose();
                openFlyout(false);
            }, true);
        }
        chip.addEventListener("mouseleave", function () {
            if (openT) { clearTimeout(openT); openT = null; }
            scheduleClose();
        });
    };
    window.animaMoveTagsTogether = function (tags, selectedIdxs, restInsertAt) {
        tags = tags ? tags.slice() : [];
        var seen = {}, sel = [], i, n;
        selectedIdxs = selectedIdxs || [];
        for (i = 0; i < selectedIdxs.length; i++) {
            n = Number(selectedIdxs[i]);
            if (!isFinite(n) || n < 0 || n >= tags.length || seen[n]) continue;
            seen[n] = true;
            sel.push(n);
        }
        sel.sort(function (a, b) { return a - b; });
        if (!sel.length) return { tags: tags, insertAt: 0, movedCount: 0 };
        var moving = [], rest = [];
        for (i = 0; i < tags.length; i++) {
            if (seen[i]) moving.push(tags[i]);
            else rest.push(tags[i]);
        }
        var at = Number(restInsertAt);
        if (!isFinite(at)) at = rest.length;
        if (at < 0) at = 0;
        if (at > rest.length) at = rest.length;
        return { tags: rest.slice(0, at).concat(moving, rest.slice(at)), insertAt: at, movedCount: moving.length };
    };

    var _mqBox = null;
    var _dmBox = null;
    function mqBoxEl() {
        if (_mqBox && _mqBox.isConnected) return _mqBox;
        _mqBox = document.createElement("div");
        _mqBox.className = "anima-chip-marquee";
        (document.body || document.documentElement).appendChild(_mqBox);
        return _mqBox;
    }
    function dmBoxEl() {
        if (_dmBox && _dmBox.isConnected) return _dmBox;
        _dmBox = document.createElement("div");
        _dmBox.className = "anima-chip-drop-mark";
        (document.body || document.documentElement).appendChild(_dmBox);
        return _dmBox;
    }
    function hideDropMark() {
        if (_dmBox) _dmBox.classList.remove("is-on");
    }

    window.animaBindChipMarquee = function (area, opts) {
        opts = opts || {};
        if (!area || area._animaMarqueeBound) return;
        area._animaMarqueeBound = true;
        var drag = false, moved = false, sx = 0, sy = 0;

        function active() { return typeof opts.isActive === "function" ? !!opts.isActive() : !!opts.isActive; }
        function chipNodes() { return area.querySelectorAll("[data-ci]"); }
        function selectedIdxs() {
            if (typeof opts.getSelectedIndices === "function") return opts.getSelectedIndices() || [];
            return [];
        }
        function idxSet(arr) {
            var s = {};
            for (var i = 0; i < arr.length; i++) s[Number(arr[i])] = true;
            return s;
        }
        function flexInsertIndex(els, x, y) {
            for (var i = 0; i < els.length; i++) {
                var r = els[i].getBoundingClientRect();
                if (y < r.top || (y <= r.bottom && x < (r.left + r.right) / 2)) return i;
            }
            return els.length;
        }
        function restInsertAt(els, selSet, fullAt) {
            var n = 0;
            for (var i = 0; i < fullAt && i < els.length; i++) {
                var k = Number(els[i].getAttribute("data-ci"));
                if (!selSet[k]) n++;
            }
            return n;
        }
        function clearMq() {
            var list = chipNodes();
            for (var i = 0; i < list.length; i++) list[i].classList.remove("is-mq");
        }
        function hitList(x1, y1, x2, y2) {
            var l = Math.min(x1, x2), t = Math.min(y1, y2), r = Math.max(x1, x2), b = Math.max(y1, y2);
            var out = [];
            var list = chipNodes();
            for (var i = 0; i < list.length; i++) {
                var c = list[i].getBoundingClientRect();
                if (c.right < l || c.left > r || c.bottom < t || c.top > b) continue;
                var n = Number(list[i].getAttribute("data-ci"));
                if (isFinite(n)) out.push(n);
            }
            return out;
        }
        function paintBox(x1, y1, x2, y2) {
            var el = mqBoxEl();
            var l = Math.min(x1, x2), t = Math.min(y1, y2);
            el.style.left = l + "px";
            el.style.top = t + "px";
            el.style.width = Math.abs(x2 - x1) + "px";
            el.style.height = Math.abs(y2 - y1) + "px";
            el.classList.add("is-on");
            clearMq();
            var ids = hitList(x1, y1, x2, y2);
            var set = {};
            for (var i = 0; i < ids.length; i++) set[ids[i]] = true;
            var list = chipNodes();
            for (var j = 0; j < list.length; j++) {
                var n = Number(list[j].getAttribute("data-ci"));
                if (set[n]) list[j].classList.add("is-mq");
            }
        }
        function hideBox() {
            if (_mqBox) {
                _mqBox.classList.remove("is-on");
                _mqBox.style.width = "0";
                _mqBox.style.height = "0";
            }
            clearMq();
        }
        function bindDoc(move, up) {
            document.addEventListener("mousemove", move, true);
            document.addEventListener("mouseup", up, true);
            document.addEventListener("pointermove", move, true);
            document.addEventListener("pointerup", up, true);
        }
        function unbindDoc(move, up) {
            document.removeEventListener("mousemove", move, true);
            document.removeEventListener("mouseup", up, true);
            document.removeEventListener("pointermove", move, true);
            document.removeEventListener("pointerup", up, true);
        }
        function onMove(ev) {
            if (!drag) return;
            var dx = ev.clientX - sx, dy = ev.clientY - sy;
            if (!moved && Math.abs(dx) + Math.abs(dy) > 6) moved = true;
            if (moved) {
                ev.preventDefault();
                paintBox(sx, sy, ev.clientX, ev.clientY);
            }
        }
        function onUp(ev) {
            if (!drag) return;
            drag = false;
            window.__animaChipMarquee = false;
            unbindDoc(onMove, onUp);
            var cx = ev && ev.clientX != null ? ev.clientX : sx;
            var cy = ev && ev.clientY != null ? ev.clientY : sy;
            hideBox();
            if (moved) {
                var ids = hitList(sx, sy, cx, cy);
                if (ids.length && typeof opts.onMarqueeIndices === "function") opts.onMarqueeIndices(ids);
            }
            moved = false;
        }
        function beginChipGesture(e, chip, t) {
            var n = Number(chip.getAttribute("data-ci"));
            if (!isFinite(n)) return;
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            var checkOnly = !!(t && t.closest && t.closest(".anima-chip-check"));
            var startX = e.clientX, startY = e.clientY;
            var chipMoved = false;
            var ids = [];
            var selSet = {};
            var ghost = null;
            var ghostOffX = 0, ghostOffY = 0;

            function killGhost() {
                if (ghost) { try { ghost.remove(); } catch (err) {} ghost = null; }
                hideDropMark();
                var list = chipNodes();
                for (var i = 0; i < list.length; i++) list[i].classList.remove("is-batch-lift");
                window.__animaChipDragging = false;
            }
            function listArr() {
                var raw = chipNodes(), out = [];
                for (var i = 0; i < raw.length; i++) out.push(raw[i]);
                return out;
            }
            function paintDrop(ev) {
                var els = listArr();
                var fullAt = flexInsertIndex(els, ev.clientX, ev.clientY);
                var mark = dmBoxEl();
                if (!els.length) { hideDropMark(); return fullAt; }
                var r;
                if (fullAt >= els.length) {
                    r = els[els.length - 1].getBoundingClientRect();
                    mark.style.left = r.right + "px";
                    mark.style.top = r.top + "px";
                    mark.style.height = r.height + "px";
                } else {
                    r = els[fullAt].getBoundingClientRect();
                    mark.style.left = (r.left - 1) + "px";
                    mark.style.top = r.top + "px";
                    mark.style.height = r.height + "px";
                }
                mark.classList.add("is-on");
                return fullAt;
            }
            function startVisual(ev) {
                if (window.animaKillChipFlyouts) window.animaKillChipFlyouts();
                window.__animaChipDragging = true;
                var raw = chipNodes();
                for (var i = 0; i < raw.length; i++) {
                    var k = Number(raw[i].getAttribute("data-ci"));
                    if (selSet[k]) raw[i].classList.add("is-batch-lift");
                }
                var r0 = chip.getBoundingClientRect();
                ghostOffX = ev.clientX - r0.left;
                ghostOffY = ev.clientY - r0.top;
                if (!(ghostOffX >= 0) || ghostOffX > r0.width) ghostOffX = r0.width / 2;
                if (!(ghostOffY >= 0) || ghostOffY > r0.height) ghostOffY = r0.height / 2;
                ghost = chip.cloneNode(true);
                ghost.classList.remove("is-batch-lift", "is-mq", "anima-chip-sortable-chosen", "anima-chip-sortable-ghost");
                ghost.classList.add("anima-chip-drag-ghost");
                ghost.style.position = "fixed";
                ghost.style.left = (ev.clientX - ghostOffX) + "px";
                ghost.style.top = (ev.clientY - ghostOffY) + "px";
                ghost.style.width = r0.width + "px";
                ghost.style.height = r0.height + "px";
                ghost.style.margin = "0";
                ghost.style.zIndex = "100020";
                ghost.style.pointerEvents = "none";
                ghost.style.opacity = "0.92";
                ghost.style.transform = "none";
                ghost.style.overflow = "visible";
                if (ids.length > 1) {
                    var badge = document.createElement("span");
                    badge.className = "anima-chip-batch-badge";
                    badge.textContent = String(ids.length);
                    ghost.appendChild(badge);
                }
                document.body.appendChild(ghost);
                paintDrop(ev);
            }
            function chipMove(ev) {
                var dx = ev.clientX - startX, dy = ev.clientY - startY;
                if (!chipMoved && Math.abs(dx) + Math.abs(dy) > 6) {
                    if (checkOnly) return;
                    if (typeof opts.onBatchReorder !== "function") return;
                    ids = [];
                    var got = selectedIdxs();
                    for (var i = 0; i < got.length; i++) {
                        var n2 = Number(got[i]);
                        if (isFinite(n2)) ids.push(n2);
                    }
                    ids.sort(function (a, b) { return a - b; });
                    selSet = idxSet(ids);
                    if (!selSet[n] || !ids.length) return;
                    chipMoved = true;
                    startVisual(ev);
                }
                if (!chipMoved) return;
                ev.preventDefault();
                if (ghost) {
                    ghost.style.left = (ev.clientX - ghostOffX) + "px";
                    ghost.style.top = (ev.clientY - ghostOffY) + "px";
                }
                paintDrop(ev);
            }
            function chipUp(ev) {
                unbindDoc(chipMove, chipUp);
                var cx = ev && ev.clientX != null ? ev.clientX : startX;
                var cy = ev && ev.clientY != null ? ev.clientY : startY;
                if (chipMoved) {
                    var els = listArr();
                    var fullAt = flexInsertIndex(els, cx, cy);
                    var restAt = restInsertAt(els, selSet, fullAt);
                    killGhost();
                    if (typeof opts.onBatchReorder === "function") opts.onBatchReorder(ids, restAt);
                } else {
                    killGhost();
                    if (Math.abs(cx - startX) + Math.abs(cy - startY) <= 6) {
                        if (typeof opts.onClickIndex === "function") opts.onClickIndex(n);
                    }
                }
            }
            bindDoc(chipMove, chipUp);
        }
        area.addEventListener("mousedown", function (e) {
            if (e.button !== 0) return;
            if (!active()) return;
            if (e.detail === 2) return;
            var t = e.target;
            if (t && t.closest && t.closest("input,textarea")) return;
            var chip = t && t.closest ? t.closest("[data-ci]") : null;
            if (chip && area.contains(chip)) {
                beginChipGesture(e, chip, t);
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            drag = true;
            moved = false;
            sx = e.clientX;
            sy = e.clientY;
            window.__animaChipMarquee = true;
            bindDoc(onMove, onUp);
        }, true);
    };
})();
