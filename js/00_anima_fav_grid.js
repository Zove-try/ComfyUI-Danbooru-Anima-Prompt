// 画师/标签收藏夹：网格尺寸 + 大图开关（默认缩略图）
(function () {
    if (window.__animaFavGridV >= 22) return;
    window.__animaFavGridV = 22;

    var CELL_KEY = "apc_fav_grid_cell";
    var HD_KEY = "apc_fav_grid_hd";
    var LIVE_KEY = "apc_fav_live";
    var _liveMap = {};
    var CELL_MIN = 88;
    var CELL_MAX = 200;
    var CELL_DEF = 108;
    var _bars = [];

    function _clampCell(n) {
        n = parseInt(n, 10);
        if (!isFinite(n)) n = CELL_DEF;
        if (n < CELL_MIN) n = CELL_MIN;
        if (n > CELL_MAX) n = CELL_MAX;
        return n;
    }
    function cell() {
        try { return _clampCell(localStorage.getItem(CELL_KEY) || CELL_DEF); }
        catch (e) { return CELL_DEF; }
    }
    function setCell(n) {
        n = _clampCell(n);
        try { localStorage.setItem(CELL_KEY, String(n)); } catch (e) {}
        return n;
    }
    function hd() {
        try { return localStorage.getItem(HD_KEY) === "1"; }
        catch (e) { return false; }
    }
    function setHd(on) {
        try { localStorage.setItem(HD_KEY, on ? "1" : "0"); } catch (e) {}
        return !!on;
    }
    function live() {
        try { return localStorage.getItem(LIVE_KEY) === "1"; }
        catch (e) { return false; }
    }
    function setLive(on) {
        on = !!on;
        try { localStorage.setItem(LIVE_KEY, on ? "1" : "0"); } catch (e) {}
        if (on) resetLiveAutoTried();
        applyLiveSrcs();
        try { window.dispatchEvent(new CustomEvent("anima-live-mode")); } catch (e2) {}
        if (!on) return on;
        loadLiveMap(true).then(function () {
            applyLiveSrcs();
            return ensureLiveThumbs(collectLiveArtistTags());
        }).then(function () {
            applyLiveSrcs();
            try { window.dispatchEvent(new CustomEvent("anima-live-mode")); } catch (e3) {}
        }).catch(function () { applyLiveSrcs(); });
        return on;
    }
    function liveNorm(tag) {
        var s = String(tag || "").trim();
        s = s.replace(/^@+/, "").replace(/^artist:/i, "");
        s = s.replace(/\\([()])/g, "$1").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
        return s;
    }
    function liveThumb(tag) {
        if (!tag) return "";
        var keys = [];
        function add(x) {
            var k = liveNorm(x);
            if (k && keys.indexOf(k) < 0) keys.push(k);
        }
        add(tag);
        if (typeof window.animaParseWeightTag === "function") {
            var p = window.animaParseWeightTag(tag);
            if (p && p.tag) add(p.tag);
        }
        for (var i = 0; i < keys.length; i++) {
            var rec = _liveMap[keys[i]];
            if (!rec) continue;
            var file = typeof rec === "string" ? rec : (rec.file || "");
            var url = (typeof rec === "object" && rec.url) ? rec.url : "";
            if (!url && file) url = "/danbooru_anima/live_thumb/" + encodeURIComponent(file);
            if (!url) continue;
            var t = (typeof rec === "object" && rec.mtime) ? rec.mtime : 0;
            if (t) url += (url.indexOf("?") >= 0 ? "&" : "?") + "t=" + t;
            return url;
        }
        return "";
    }
    function loadLiveMap(force) {
        if (force) {
            loadLiveMap._done = false;
            loadLiveMap._p = null;
        }
        if (loadLiveMap._p) return loadLiveMap._p;
        if (loadLiveMap._done) return Promise.resolve(_liveMap);
        loadLiveMap._p = fetch("/danbooru_anima/live_thumbs/map").then(function (r) { return r.json(); }).then(function (d) {
            _liveMap = (d && d.map && typeof d.map === "object") ? d.map : {};
            loadLiveMap._done = true;
            loadLiveMap._p = null;
            return _liveMap;
        }).catch(function () {
            loadLiveMap._done = true;
            loadLiveMap._p = null;
            return _liveMap;
        });
        return loadLiveMap._p;
    }
    var _autoTried = {};
    var _autoBusy = {};
    var _autoQ = [];
    var _autoT = 0;
    function resetLiveAutoTried() {
        _autoTried = {};
        _autoBusy = {};
        _autoQ = [];
        if (_autoT) { clearTimeout(_autoT); _autoT = 0; }
    }
    function collectLiveArtistTags() {
        var out = [];
        var seen = {};
        function add(t) {
            var k = liveNorm(t);
            if (!k || seen[k]) return;
            seen[k] = 1;
            out.push(t);
        }
        var imgs = document.querySelectorAll("img[data-fav-cat='artists'][data-fav-tag]");
        for (var i = 0; i < imgs.length; i++) add(imgs[i].getAttribute("data-fav-tag") || "");
        var cards = document.querySelectorAll(".opv-art-card[data-key]");
        for (var c = 0; c < cards.length; c++) add(cards[c].getAttribute("data-key") || "");
        return out;
    }
    function ensureLiveThumbs(tags) {
        tags = Array.isArray(tags) ? tags : [];
        var need = [];
        var seen = {};
        for (var i = 0; i < tags.length; i++) {
            var t = tags[i];
            var k = liveNorm(t);
            if (!k || seen[k] || liveThumb(t) || _autoTried[k] || _autoBusy[k]) continue;
            seen[k] = 1;
            need.push(t);
            _autoBusy[k] = 1;
        }
        if (!need.length) return Promise.resolve(_liveMap);
        return fetch("/danbooru_anima/live_thumbs/autofill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tags: need, deep: true })
        }).then(function (r) { return r.json(); }).then(function (d) {
            if (d && d.map && typeof d.map === "object") _liveMap = d.map;
            for (var n = 0; n < need.length; n++) {
                var nk = liveNorm(need[n]);
                delete _autoBusy[nk];
                if (!liveThumb(need[n])) _autoTried[nk] = 1;
            }
            return _liveMap;
        }).catch(function () {
            for (var n2 = 0; n2 < need.length; n2++) {
                var nk2 = liveNorm(need[n2]);
                delete _autoBusy[nk2];
                _autoTried[nk2] = 1;
            }
            return _liveMap;
        });
    }
    function queueLiveAutofill(tag) {
        if (!live() || !tag || liveThumb(tag)) return;
        var k = liveNorm(tag);
        if (!k || _autoTried[k] || _autoBusy[k]) return;
        if (_autoQ.indexOf(tag) < 0) _autoQ.push(tag);
        if (_autoT) clearTimeout(_autoT);
        _autoT = setTimeout(function () {
            _autoT = 0;
            var batch = _autoQ.splice(0);
            if (!batch.length || !live()) return;
            ensureLiveThumbs(batch).then(function () {
                if (!live()) return;
                applyLiveSrcs();
                try { window.dispatchEvent(new CustomEvent("anima-live-mode")); } catch (e3) {}
            });
        }, 80);
    }
    function metrics() {
        var c = cell();
        var hdOn = hd();
        return {
            cell: c,
            imgH: Math.round(c * (hdOn ? 1.42 : 1.12)),
            gap: c < 100 ? 4 : (c < 140 ? 6 : 8),
            pad: c < 100 ? 3 : 4,
            font: c < 96 ? 10 : (c < 140 ? 11 : 12),
            hd: hdOn
        };
    }

    function unwrapProxy(u) {
        if (!u) return "";
        try {
            var m = String(u).match(/\/(?:danbooru|gelbooru)_anima\/image_proxy\?url=([^&]+)/);
            if (m) return decodeURIComponent(m[1]);
        } catch (e) {}
        return String(u);
    }
    function toThumbUrl(u) {
        if (!u) return u;
        if (u.indexOf("data:") === 0) return u;
        if (u.indexOf("/web/thumbs/") >= 0 || u.indexOf("/danbooru_anima/fav_thumb") >= 0 || u.indexOf("/extensions/") === 0 || u.indexOf("/danbooru_anima/combo_thumb/") >= 0) return u;
        var gel = u.replace(/\/samples\/([^/?#]+\/[^/?#]+)\/sample_/, "/thumbnails/$1/thumbnail_");
        gel = gel.replace(/\/images\/([^/?#]+\/[^/?#]+)\/(?!thumbnail_)([^/?#]+)/, "/thumbnails/$1/thumbnail_$2");
        if (gel !== u) return gel;
        if (u.indexOf("/thumbnails/") >= 0) return u;
        var changed = false;
        var d = u.replace(/\/(original|sample|720x720|360x360|512x512|180x180)\//g, function () { changed = true; return "/preview/"; });
        d = d.replace(/\/data\/(original|sample)\//g, function () { changed = true; return "/data/preview/"; });
        if (/\/preview\/[^/?#]+\/[^/?#]+\/sample-/.test(d)) {
            d = d.replace(/(\/preview\/[^/?#]+\/[^/?#]+\/)sample-/, "$1");
            changed = true;
        }
        if (changed && /donmai\.us/.test(d)) {
            d = d.replace(/\.(png|webp|gif|jpeg)(\?[^#]*)?$/i, ".jpg$2");
        }
        return d;
    }
    function toTinyUrl(u) {
        var inner = toThumbUrl(unwrapProxy(u || ""));
        if (!inner) return inner;
        if (inner.indexOf("/preview/") >= 0) return inner.replace("/preview/", "/180x180/");
        return inner;
    }
    function swapDonmaiFolder(u, folder) {
        var d = String(u || "").replace(/\/(original|sample|preview|180x180|360x360|512x512|720x720)\//, "/" + folder + "/");
        d = d.replace(/\/data\/(original|sample|preview)\//, "/data/" + (folder === "sample" ? "sample" : "preview") + "/");
        if (folder === "sample") {
            d = d.replace(/(\/sample\/[^/?#]+\/[^/?#]+\/)(?!sample-)([^/?#]+)/, "$1sample-$2");
        } else {
            d = d.replace(new RegExp("(/" + folder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/[^/?#]+/[^/?#]+/)sample-"), "$1");
        }
        if (/donmai\.us/.test(d) && folder !== "original") {
            d = d.replace(/\.(png|webp|gif|jpeg)(\?[^#]*)?$/i, ".jpg$2");
        }
        return d;
    }
    function toHdUrl(u) {
        var inner = unwrapProxy(u || "");
        if (!inner) return inner;
        if (inner.indexOf("data:") === 0) return inner;
        if (inner.indexOf("/web/thumbs/") >= 0 || inner.indexOf("/danbooru_anima/fav_thumb") >= 0 || inner.indexOf("/extensions/") === 0 || inner.indexOf("/danbooru_anima/combo_thumb/") >= 0) return inner;
        if (/gelbooru\.com/i.test(inner) || /\/thumbnails\//.test(inner) || /\/samples\//.test(inner)) {
            var gel = inner.replace(/\/thumbnails\/([^/?#]+\/[^/?#]+)\/thumbnail_/, "/samples/$1/sample_");
            gel = gel.replace(/\/images\/([^/?#]+\/[^/?#]+)\/(?!sample_)([^/?#]+)/, "/samples/$1/sample_$2");
            return gel;
        }
        return swapDonmaiFolder(inner, "sample");
    }
    function toMidUrl(u) {
        var inner = unwrapProxy(u || "");
        if (!inner) return inner;
        if (inner.indexOf("data:") === 0) return inner;
        if (inner.indexOf("/web/thumbs/") >= 0 || inner.indexOf("/danbooru_anima/fav_thumb") >= 0 || inner.indexOf("/extensions/") === 0 || inner.indexOf("/danbooru_anima/combo_thumb/") >= 0) return inner;
        if (/gelbooru\.com/i.test(inner) || /\/thumbnails\//.test(inner) || /\/samples\//.test(inner)) {
            return toHdUrl(inner);
        }
        return swapDonmaiFolder(inner, "360x360");
    }
    function proxySrc(raw, source, mode) {
        var inner = unwrapProxy(raw || "");
        if (!inner) return "";
        if (inner.indexOf("data:") === 0) return inner;
        if (inner.indexOf("/web/thumbs/") >= 0 || inner.indexOf("/danbooru_anima/fav_thumb") >= 0 || inner.indexOf("/extensions/") === 0 || inner.indexOf("/danbooru_anima/combo_thumb/") >= 0) return inner;
        if (mode === "tiny") inner = toTinyUrl(inner);
        else if (mode === "mid") inner = toMidUrl(inner);
        else if (mode === true || mode === "hd") inner = toHdUrl(inner);
        else inner = toThumbUrl(inner);
        if (/^https?:\/\//i.test(inner) || inner.indexOf("//") === 0) {
            var gel = (source === "gelbooru") || /gelbooru\.com/i.test(inner);
            var prefix = gel ? "/gelbooru_anima/image_proxy?url=" : "/danbooru_anima/image_proxy?url=";
            return prefix + encodeURIComponent(inner);
        }
        return inner;
    }
    var _favIoMap = [];
    var _favIoPad = 80;
    var _favIoMaxWait = 1;
    var _favLoadQ = [];
    var _favInflight = 0;
    var _FAV_MAX_INFLIGHT = 4;
    var _favFrameStarted = 0;
    var _favPumpRaf = 0;
    var SORT_KEY = "apc_fav_join_sort";
    var _thumbMap = {};
    function newestFirst() {
        try { return localStorage.getItem(SORT_KEY) !== "old"; }
        catch (e) { return true; }
    }
    function setNewestFirst(on) {
        try { localStorage.setItem(SORT_KEY, on ? "new" : "old"); } catch (e1) {}
        return !!on;
    }
    function applyJoinSort(list) {
        var out = (list || []).slice();
        if (newestFirst()) out.reverse();
        return out;
    }
    function mapKey(source, tag) {
        var site = (source === "gelbooru" || source === "gel") ? "g" : "d";
        return site + ":" + String(tag || "").replace(/\s+/g, "_").toLowerCase();
    }
    function localThumb(source, tag) {
        if (!tag) return "";
        return _thumbMap[mapKey(source, tag)] || "";
    }
    function loadThumbMap(force) {
        if (force) {
            loadThumbMap._done = false;
            loadThumbMap._p = null;
        }
        if (loadThumbMap._p) return loadThumbMap._p;
        if (loadThumbMap._done) return Promise.resolve(_thumbMap);
        loadThumbMap._p = fetch("/danbooru_anima/fav_thumbs/map").then(function (r) { return r.json(); }).then(function (d) {
            _thumbMap = (d && d.map && typeof d.map === "object") ? d.map : {};
            loadThumbMap._done = true;
            loadThumbMap._p = null;
            return _thumbMap;
        }).catch(function () {
            loadThumbMap._done = true;
            loadThumbMap._p = null;
            return _thumbMap;
        });
        return loadThumbMap._p;
    }
    function favSrc(raw, source, tag) {
        if (live()) {
            var lv = liveThumb(tag);
            if (lv) return lv;
        }
        var loc = localThumb(source, tag);
        if (loc) return loc;
        return proxySrc(raw, source, "tiny");
    }
    loadThumbMap();
    loadLiveMap();

    function nearestScrollRoot(el) {
        var g = el && el.closest && el.closest(".fav-art-grid, .anima-fav-grid");
        if (g) return g;
        var n = el;
        while (n && n !== document.body && n !== document.documentElement) {
            try {
                var st = window.getComputedStyle(n);
                var oy = st && st.overflowY;
                if (oy === "auto" || oy === "scroll" || oy === "overlay") return n;
            } catch (e) {}
            n = n.parentElement;
        }
        return null;
    }
    function pruneFavIo() {
        var keep = [];
        for (var i = 0; i < _favIoMap.length; i++) {
            var rec = _favIoMap[i];
            if (!rec || !rec.io) continue;
            if (rec.root && rec.root.isConnected === false) {
                try { rec.io.disconnect(); } catch (e) {}
                continue;
            }
            keep.push(rec);
        }
        _favIoMap = keep;
    }
    function ioForRoot(root) {
        pruneFavIo();
        for (var i = 0; i < _favIoMap.length; i++) {
            if (_favIoMap[i].root === root) return _favIoMap[i].io;
        }
        if (typeof IntersectionObserver !== "function") return null;
        var io = new IntersectionObserver(function (entries) {
            for (var j = 0; j < entries.length; j++) {
                var en = entries[j];
                if (!en.isIntersecting) continue;
                var t = en.target;
                try { io.unobserve(t); } catch (e2) {}
                if (typeof t._favStartLoad === "function") t._favStartLoad();
            }
        }, { root: root, rootMargin: _favIoPad + "px 0px", threshold: 0.01 });
        _favIoMap.push({ root: root, io: io });
        return io;
    }
    function unobserveFav(imgEl) {
        var t = (imgEl && imgEl._favIoEl) || imgEl;
        if (!t) return;
        for (var i = 0; i < _favIoMap.length; i++) {
            try { _favIoMap[i].io.unobserve(t); } catch (e) {}
        }
        if (imgEl) imgEl._favIoEl = null;
    }
    function _favPump() {
        var perFrame = 2;
        while (_favInflight < _FAV_MAX_INFLIGHT && _favFrameStarted < perFrame && _favLoadQ.length) {
            var job = _favLoadQ.shift();
            if (!job || !job.img || !job.img.isConnected) continue;
            _favInflight++;
            _favFrameStarted++;
            var finished = false;
            function done() {
                if (finished) return;
                finished = true;
                _favInflight--;
                _favPump();
            }
            try { job.run(done); } catch (e) { done(); }
        }
        if (_favLoadQ.length && !_favPumpRaf) {
            _favPumpRaf = requestAnimationFrame(function () {
                _favPumpRaf = 0;
                _favFrameStarted = 0;
                _favPump();
            });
        }
    }
    function _favEnqueue(imgEl, run, urgent) {
        var job = { img: imgEl, run: run };
        if (urgent) _favLoadQ.unshift(job);
        else _favLoadQ.push(job);
        _favPump();
    }
    function hasSize(el) {
        try {
            var r = el.getBoundingClientRect();
            return r.width > 2 && r.height > 2;
        } catch (e) { return false; }
    }
    function inPadRect(el, root) {
        try {
            var r = el.getBoundingClientRect();
            var b = (root && root.getBoundingClientRect) ? root.getBoundingClientRect() : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
            var pad = _favIoPad;
            return r.bottom >= b.top - pad && r.top <= b.bottom + pad && r.right >= b.left - pad && r.left <= b.right + pad;
        } catch (e) { return false; }
    }
    if (!window.__animaFavGridHide) {
        window.__animaFavGridHide = true;
        window.addEventListener("pagehide", function () {
            for (var i = 0; i < _favIoMap.length; i++) {
                try { _favIoMap[i].io.disconnect(); } catch (e) {}
            }
            _favIoMap = [];
            try {
                var imgs = document.querySelectorAll(".fav-img-wrap img[data-raw]");
                for (var j = 0; j < imgs.length; j++) {
                    var im = imgs[j];
                    if (im && im.getAttribute("src") && !im.complete) {
                        try { im.removeAttribute("src"); } catch (e2) {}
                    }
                }
            } catch (e3) {}
        });
    }

    function bindImg(imgEl, rawUrl, source, opt) {
        if (!imgEl) return;
        opt = opt || {};
        unobserveFav(imgEl);
        if (imgEl._favArmRaf) { cancelAnimationFrame(imgEl._favArmRaf); imgEl._favArmRaf = 0; }
        if (imgEl._favArmTo) { clearTimeout(imgEl._favArmTo); imgEl._favArmTo = 0; }
        imgEl.dataset.raw = rawUrl || "";
        imgEl.dataset.kind = source || "danbooru";
        if (opt.tag) imgEl.dataset.favTag = opt.tag;
        if (opt.cat) imgEl.dataset.favCat = opt.cat;
        imgEl.style.width = opt.width || "100%";
        imgEl.style.height = opt.height || "100%";
        imgEl.style.objectFit = opt.objectFit || "contain";
        imgEl.style.borderRadius = opt.borderRadius || "4px";
        imgEl.hidden = false;
        imgEl.style.display = "block";
        imgEl.referrerPolicy = "no-referrer";
        imgEl.decoding = "async";
        imgEl.loading = "eager";
        try { imgEl.fetchPriority = opt.eager ? "high" : "low"; } catch (e0) {}
        var stage = 0;
        var started = false;
        function applySrc(mode) {
            var cur = imgEl.getAttribute("src") || "";
            if (live()) {
                var lv = liveThumb(opt.tag || imgEl.dataset.favTag);
                if (lv) {
                    imgEl.hidden = false;
                    imgEl.style.display = "block";
                    if (lv !== cur) imgEl.src = lv;
                    return lv;
                }
                var cat = opt.cat || imgEl.dataset.favCat || "";
                if (cat === "artists") {
                    queueLiveAutofill(opt.tag || imgEl.dataset.favTag);
                }
            }
            if (stage === 0) {
                var loc = localThumb(source, opt.tag || imgEl.dataset.favTag);
                var locIsHigh = loc && /_h\.jpg(?:\?|$)/.test(loc);
                if (loc && !(hd() && mode === true && !locIsHigh)) {
                    if (loc !== cur) imgEl.src = loc;
                    return loc;
                }
            }
            var src = proxySrc(rawUrl, source, mode);
            if (src && src !== cur) {
                imgEl.src = src;
                return src;
            }
            return "";
        }
        function ioTarget() {
            return imgEl.closest(".fav-img-wrap") || imgEl.parentElement || imgEl;
        }
        function startLoad() {
            if (started) return;
            started = true;
            unobserveFav(imgEl);
            imgEl._favStartLoad = null;
            var wrap = ioTarget();
            if (wrap) wrap._favStartLoad = null;
            _favEnqueue(imgEl, function (done) {
                var settled = false;
                function finishLoad() {
                    if (settled) return;
                    settled = true;
                    done();
                }
                imgEl.onload = function () {
                    imgEl.style.display = "block";
                    var w = imgEl.parentElement;
                    if (w) {
                        var letter = w.querySelector(".fav-letter");
                        if (letter) letter.style.display = "none";
                    }
                    finishLoad();
                };
                imgEl.onerror = function () {
                    var srcNow = imgEl.getAttribute("src") || "";
                    if (live() && /\/danbooru_anima\/live_thumb\//.test(srcNow)) {
                        var locFail = localThumb(source, opt.tag || imgEl.dataset.favTag);
                        if (locFail && locFail !== srcNow) {
                            imgEl.hidden = false;
                            imgEl.style.display = "block";
                            imgEl.src = locFail;
                            return;
                        }
                        var proxFail = proxySrc(rawUrl, source, "tiny");
                        if (proxFail && proxFail !== srcNow) {
                            imgEl.hidden = false;
                            imgEl.style.display = "block";
                            imgEl.src = proxFail;
                            return;
                        }
                        finishLoad();
                        return;
                    }
                    var next = "";
                    if (stage < 1) {
                        stage = 1;
                        next = applySrc(hd() ? true : "tiny");
                        if (next) return;
                    }
                    if (hd() && stage < 2) {
                        stage = 2;
                        next = applySrc("mid");
                        if (next) return;
                    }
                    if (stage < 3) {
                        stage = 3;
                        next = applySrc("tiny");
                        if (next) return;
                    }
                    imgEl.style.display = "none";
                    var w2 = imgEl.parentElement;
                    if (w2) {
                        var letter2 = w2.querySelector(".fav-letter");
                        if (letter2) letter2.style.display = "flex";
                    }
                    finishLoad();
                };
                if (!applySrc(hd() ? true : "tiny")) finishLoad();
                else if (imgEl.complete) {
                    if (imgEl.naturalWidth > 0) imgEl.onload();
                    else imgEl.onerror();
                }
            }, !!opt.eager);
        }
        imgEl._favStartLoad = startLoad;
        if (imgEl.getAttribute("src") && !imgEl.complete) {
            try { imgEl.removeAttribute("src"); } catch (e) {}
        }
        function arm(waited) {
            if (started) return;
            if (!imgEl.isConnected) {
                if ((waited || 0) >= _favIoMaxWait) { startLoad(); return; }
                imgEl._favArmRaf = requestAnimationFrame(function () {
                    imgEl._favArmRaf = 0;
                    arm((waited || 0) + 1);
                });
                return;
            }
            var wrap = ioTarget();
            if (wrap) wrap._favStartLoad = startLoad;
            if (opt.eager) { startLoad(); return; }
            var root = nearestScrollRoot(wrap);
            if (typeof IntersectionObserver !== "function") {
                startLoad();
                return;
            }
            var io = ioForRoot(root);
            if (!io) { startLoad(); return; }
            imgEl._favIoEl = wrap;
            try { io.observe(wrap); } catch (e) { startLoad(); }
        }
        arm(0);
    }
    function swapOneFavImg(imgEl) {
        if (!imgEl || !imgEl.dataset) return;
        var tag = imgEl.dataset.favTag || "";
        var cat = imgEl.dataset.favCat || "";
        var raw = imgEl.dataset.raw || "";
        var source = imgEl.dataset.kind || "danbooru";
        var want = "";
        if (live()) {
            want = liveThumb(tag);
            if (!want && (cat === "artists" || !cat) && tag) queueLiveAutofill(tag);
        }
        if (!want) {
            var loc = localThumb(source, tag);
            if (loc) want = loc;
            else if (raw) want = proxySrc(raw, source, hd() ? true : "tiny");
        }
        if (!want) return;
        var cur = imgEl.getAttribute("src") || "";
        if (want === cur) return;
        imgEl.hidden = false;
        imgEl.style.display = "block";
        imgEl.src = want;
        var wrap = imgEl.parentElement;
        if (wrap) {
            var letter = wrap.querySelector(".fav-letter");
            if (letter) letter.style.display = "none";
        }
    }
    function applyLiveSrcs(root) {
        if (!root) {
            pruneBars();
            var i;
            for (i = 0; i < _bars.length; i++) {
                paintBar(_bars[i].bar);
                var g = _bars[i].getGrid && _bars[i].getGrid();
                if (g) applyLiveSrcs(g);
            }
            var extra = document.querySelectorAll("img[data-fav-cat='artists'][data-fav-tag]");
            for (i = 0; i < extra.length; i++) swapOneFavImg(extra[i]);
            return;
        }
        var imgs = root.querySelectorAll("img[data-fav-tag], img[data-raw]");
        for (var j = 0; j < imgs.length; j++) swapOneFavImg(imgs[j]);
    }
    function refreshImgs(root) {
        if (!root) return;
        var imgs = root.querySelectorAll(".fav-img-wrap img[data-raw]");
        for (var i = 0; i < imgs.length; i++) {
            bindImg(imgs[i], imgs[i].dataset.raw, imgs[i].dataset.kind, { tag: imgs[i].dataset.favTag, cat: imgs[i].dataset.favCat });
        }
    }

    function applyGrid(el) {
        if (!el) return;
        if (el.classList && !el.classList.contains("fav-art-grid") && !el.classList.contains("anima-fav-grid")) {
            el.classList.add("anima-fav-grid");
        }
        var m = metrics();
        el.style.display = "grid";
        el.style.gridTemplateColumns = "repeat(auto-fill,minmax(" + m.cell + "px,1fr))";
        el.style.gridAutoRows = "min-content";
        el.style.alignItems = "start";
        el.style.justifyItems = "stretch";
        el.style.gap = m.gap + "px";
        el.style.alignContent = "start";
        el.style.minWidth = "0";
    }
    function applyCards(root) {
        if (!root) return;
        var m = metrics();
        var cards = root.querySelectorAll(".tp-card");
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            card.style.width = "100%";
            card.style.minWidth = "0";
            card.style.height = "auto";
            card.style.overflow = "visible";
            card.style.alignSelf = "start";
            var gapY = Math.max(4, Math.round(m.gap * 0.75));
            card.style.minHeight = (m.imgH + m.pad * 2 + gapY + m.font + 10) + "px";
            card.style.padding = m.pad + "px";
            card.style.gap = gapY + "px";
            card.style.boxSizing = "border-box";
        }
        var wraps = root.querySelectorAll(".fav-img-wrap");
        var lf = Math.max(14, Math.round(m.cell * 0.28));
        for (var j = 0; j < wraps.length; j++) {
            var w = wraps[j];
            w.style.width = "100%";
            w.style.height = m.imgH + "px";
            w.style.minHeight = m.imgH + "px";
            w.style.flexShrink = "0";
            w.style.overflow = "hidden";
            w.style.position = "relative";
            w.style.display = "flex";
            w.style.alignItems = "center";
            w.style.justifyContent = "center";
            var letter = w.querySelector(".fav-letter");
            if (letter) {
                letter.style.fontSize = lf + "px";
                letter.style.position = "absolute";
                letter.style.inset = "0";
                letter.style.alignItems = "center";
                letter.style.justifyContent = "center";
                letter.style.pointerEvents = "none";
                letter.style.fontWeight = "700";
                letter.style.color = "rgba(var(--anima-ink-rgb),.82)";
            }
        }
        var lbls = root.querySelectorAll(".fav-lbl");
        for (var k = 0; k < lbls.length; k++) {
            lbls[k].style.fontSize = m.font + "px";
            lbls[k].style.maxWidth = "100%";
            lbls[k].style.flexShrink = "0";
        }
        var fillers = root.querySelectorAll(".fav-empty");
        for (var n = 0; n < fillers.length; n++) {
            fillers[n].style.gridColumn = "1 / -1";
        }
    }
    function finish(grid) {
        injectCss();
        applyGrid(grid);
        applyCards(grid);
    }

    function injectCss() {
        var st = document.getElementById("anima-fav-grid-css");
        if (!st) {
            st = document.createElement("style");
            st.id = "anima-fav-grid-css";
            document.head.appendChild(st);
        }
        st.textContent =
            ".anima-fav-grid-bar{display:flex;align-items:center;gap:8px;padding:5px 10px;flex-shrink:0;" +
            "border-bottom:1px solid rgba(var(--anima-accent-rgb),.18);background:rgba(var(--anima-well-rgb),.32);min-width:0;}" +
            ".anima-fav-hd{flex-shrink:0;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;" +
            "letter-spacing:.02em;cursor:pointer;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);" +
            "color:var(--anima-mute);user-select:none;line-height:18px;transition:background .15s,border-color .15s,color .15s;}" +
            ".anima-fav-hd.on{border-color:rgba(var(--anima-accent-rgb),.48);background:rgba(var(--anima-accent-rgb),.18);color:var(--anima-accent-soft);}" +
            ".anima-fav-sort{white-space:nowrap;}" +
            ".anima-fav-grid-bar .fav-sz-lab{flex-shrink:0;font-size:11px;color:var(--anima-mute);user-select:none;}" +
            ".anima-fav-grid-bar .fav-sz-px{flex-shrink:0;min-width:38px;text-align:right;font-size:11px;font-variant-numeric:tabular-nums;" +
            "color:var(--anima-accent-soft);font-weight:600;}" +
            ".anima-fav-grid-bar input[type=range]{-webkit-appearance:none;appearance:none;height:4px;border-radius:99px;flex:1;" +
            "min-width:72px;max-width:200px;cursor:pointer;outline:none;" +
            "background:linear-gradient(90deg,var(--anima-accent-range),var(--anima-accent-hi));}" +
            ".anima-fav-grid-bar input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;" +
            "background:var(--anima-accent-soft);border:2px solid var(--anima-title);box-shadow:0 0 0 1px rgba(var(--anima-accent-rgb),.35);}" +
            ".fav-art-grid,.anima-fav-grid{grid-auto-rows:min-content;align-items:start;}" +
            ".fav-art-grid>.tp-card,.anima-fav-grid>.tp-card{overflow:visible;min-height:min-content;align-self:start;}" +
            ".fav-img-wrap{min-width:0;}" +
            ".fav-letter{display:flex;align-items:center;justify-content:center;position:absolute;inset:0;pointer-events:none;font-weight:700;}" +
            ".fav-lbl{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
            ".anima-fav-pager{display:none;align-items:center;justify-content:center;gap:8px;padding:6px 10px;flex-shrink:0;" +
            "border-top:1px solid rgba(var(--anima-accent-rgb),.18);background:rgba(var(--anima-well-rgb),.32);min-width:0;}" +
            ".anima-fav-pager button{padding:3px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);" +
            "color:var(--anima-accent-soft);cursor:pointer;font-size:12px;font-weight:700;line-height:18px;}" +
            ".anima-fav-pager button:disabled{opacity:.35;cursor:default;color:var(--anima-mute);}" +
            ".anima-fav-pager .fav-pg-info{font-size:12px;color:var(--anima-mute);user-select:none;font-variant-numeric:tabular-nums;}" +
            ".anima-fav-pager input[type=number]{width:48px;padding:2px 4px;border-radius:6px;border:1px solid rgba(255,255,255,.12);" +
            "background:rgba(0,0,0,.25);color:var(--anima-accent-soft);font-size:12px;text-align:center;outline:none;}" +
            ".anima-fav-live.on{border-color:rgba(20,184,166,.55);background:rgba(20,184,166,.22);color:#5eead4;}";
    }
    function pruneBars() {
        for (var i = _bars.length - 1; i >= 0; i--) {
            if (!_bars[i].bar || !_bars[i].bar.isConnected) _bars.splice(i, 1);
        }
    }
    function paintBar(bar) {
        if (!bar) return;
        var m = metrics();
        var pill = bar.querySelector(".anima-fav-hd:not(.anima-fav-sort):not(.anima-fav-live)");
        var livePill = bar.querySelector(".anima-fav-live");
        var sortBtn = bar.querySelector(".anima-fav-sort");
        var range = bar.querySelector("input[type=range]");
        var px = bar.querySelector(".fav-sz-px");
        if (pill) pill.classList.toggle("on", m.hd);
        if (livePill) {
            livePill.classList.toggle("on", live());
            livePill.setAttribute("aria-pressed", live() ? "true" : "false");
        }
        if (sortBtn) {
            sortBtn.textContent = newestFirst() ? (typeof animaTxt === "function" ? animaTxt("最新加入") : "最新加入") : (typeof animaTxt === "function" ? animaTxt("最早加入") : "最早加入");
            sortBtn.classList.toggle("on", newestFirst());
        }
        if (range) range.value = String(m.cell);
        if (px) px.textContent = m.cell + "px";
    }
    function syncAll(kind) {
        pruneBars();
        for (var i = 0; i < _bars.length; i++) {
            var rec = _bars[i];
            paintBar(rec.bar);
            var g = rec.getGrid && rec.getGrid();
            if (!g) continue;
            if (kind === "hd") {
                refreshImgs(g);
                applyCards(g);
                applyGrid(g);
            } else {
                finish(g);
            }
        }
    }
    function mountBar(parent, opt) {
        injectCss();
        opt = opt || {};
        var bar = document.createElement("div");
        bar.className = "anima-fav-grid-bar";
        var pill = document.createElement("span");
        pill.className = "anima-fav-hd" + (hd() ? " on" : "");
        pill.textContent = "大图";
        pill.title = "开启后加载更清晰的大图，会更卡、更慢。默认用缩略图。";
        pill.setAttribute("role", "button");
        pill.setAttribute("aria-pressed", hd() ? "true" : "false");
        pill.onclick = function () {
            setHd(!hd());
            pill.setAttribute("aria-pressed", hd() ? "true" : "false");
            syncAll("hd");
        };
        var lab = document.createElement("span");
        lab.className = "fav-sz-lab";
        lab.textContent = "尺寸";
        var range = document.createElement("input");
        range.type = "range";
        range.min = String(CELL_MIN);
        range.max = String(CELL_MAX);
        range.step = "2";
        range.value = String(cell());
        range.title = "缩略图网格大小";
        range.setAttribute("aria-label", "收藏夹缩略图大小");
        range.oninput = function () {
            setCell(range.value);
            syncAll("size");
        };
        var px = document.createElement("span");
        px.className = "fav-sz-px";
        px.textContent = cell() + "px";
        bar.appendChild(pill);
        var livePill = document.createElement("span");
        livePill.className = "anima-fav-hd anima-fav-live" + (live() ? " on" : "");
        livePill.textContent = typeof animaTxt === "function" ? animaTxt("AI") : "AI";
        livePill.title = typeof animaTxt === "function" ? animaTxt("AI模式：用该画师的单画师生成图当缩略图。没指定时自动匹配。") : "AI模式：用该画师的单画师生成图当缩略图。没指定时自动匹配。";
        livePill.setAttribute("role", "button");
        livePill.setAttribute("aria-pressed", live() ? "true" : "false");
        livePill.onclick = function () { setLive(!live()); };
        bar.appendChild(livePill);
        var sortBtn = document.createElement("span");
        sortBtn.className = "anima-fav-hd anima-fav-sort" + (newestFirst() ? " on" : "");
        sortBtn.textContent = newestFirst() ? (typeof animaTxt === "function" ? animaTxt("最新加入") : "最新加入") : (typeof animaTxt === "function" ? animaTxt("最早加入") : "最早加入");
        sortBtn.title = typeof animaTxt === "function" ? animaTxt("按加入时间排序") : "按加入时间排序";
        sortBtn.setAttribute("role", "button");
        sortBtn.onclick = function () {
            setNewestFirst(!newestFirst());
            pruneBars();
            for (var si = 0; si < _bars.length; si++) paintBar(_bars[si].bar);
            if (typeof opt.onSort === "function") opt.onSort(newestFirst());
        };
        bar.appendChild(sortBtn);
        bar.appendChild(lab);
        bar.appendChild(range);
        bar.appendChild(px);
        if (parent) parent.appendChild(bar);
        _bars.push({ bar: bar, getGrid: opt.getGrid || null });
        return bar;
    }

    var PAGE_KEY = "apc_fav_page_size";
    var PAGE_DEF = 96;
    var PAGE_MAX = 160;
    function pageSize() {
        var raw = localStorage.getItem(PAGE_KEY);
        var n = parseInt(raw || String(PAGE_DEF), 10);
        if (raw === "24" || raw === "12") n = PAGE_DEF;
        if (!isFinite(n) || n < 24) n = PAGE_DEF;
        if (n > PAGE_MAX) n = PAGE_MAX;
        return n;
    }
    function slicePage(list, page, size) {
        size = size || pageSize();
        list = list || [];
        var total = list.length;
        var pages = Math.max(1, Math.ceil(total / size) || 1);
        page = parseInt(page, 10) || 1;
        if (page < 1) page = 1;
        if (page > pages) page = pages;
        var start = (page - 1) * size;
        return { page: page, pages: pages, total: total, size: size, items: list.slice(start, start + size) };
    }
    function mountPager(parent, opt) {
        injectCss();
        opt = opt || {};
        var bar = document.createElement("div");
        bar.className = "anima-fav-pager";
        function paint(st) {
            st = st || {};
            var page = st.page || 1;
            var pages = Math.max(1, st.pages || 1);
            var total = st.total || 0;
            bar.innerHTML = "";
            if (total <= (st.size || pageSize())) {
                bar.style.display = "none";
                return;
            }
            bar.style.display = "flex";
            function mkPgBtn(label, disabled, go) {
                var b = document.createElement("button");
                b.type = "button";
                b.textContent = label;
                b.disabled = !!disabled;
                if (!disabled) b.onclick = function () { if (opt.onPage) opt.onPage(go); };
                return b;
            }
            function goPage(p) {
                p = parseInt(p, 10);
                if (!isFinite(p) || p < 1) p = 1;
                if (p > pages) p = pages;
                if (p !== page && opt.onPage) opt.onPage(p);
            }
            var jump = document.createElement("input");
            jump.type = "number";
            jump.min = "1";
            jump.max = String(pages);
            jump.value = String(page);
            jump.title = (typeof animaTxt === "function" ? animaTxt("跳转到页") : "跳转到页");
            jump.onchange = function () { goPage(jump.value); };
            jump.onkeydown = function (ev) {
                if (ev.key === "Enter") { ev.preventDefault(); goPage(jump.value); }
            };
            var jumpBtn = document.createElement("button");
            jumpBtn.type = "button";
            jumpBtn.textContent = (typeof animaTxt === "function" ? animaTxt("跳转") : "跳转");
            jumpBtn.onclick = function () { goPage(jump.value); };
            var info = document.createElement("span");
            info.className = "fav-pg-info";
            info.textContent = page + " / " + pages + "  ·  " + total;
            bar.appendChild(mkPgBtn(typeof animaTxt === "function" ? animaTxt("首页") : "首页", page <= 1, 1));
            bar.appendChild(mkPgBtn(typeof animaTxt === "function" ? animaTxt("上一页") : "上一页", page <= 1, page - 1));
            bar.appendChild(info);
            bar.appendChild(jump);
            bar.appendChild(jumpBtn);
            bar.appendChild(mkPgBtn(typeof animaTxt === "function" ? animaTxt("下一页") : "下一页", page >= pages, page + 1));
            bar.appendChild(mkPgBtn(typeof animaTxt === "function" ? animaTxt("尾页") : "尾页", page >= pages, pages));
        }
        bar.paint = paint;
        if (parent) parent.appendChild(bar);
        return bar;
    }


    var FAV_REV_KEY = "anima_fav_rev";
    var _favListeners = [];
    var _favSyncReady = false;
    var _favSyncTimer = 0;
    function clampRating(n) {
        n = parseInt(n, 10);
        if (!isFinite(n) || n < 0) n = 0;
        if (n > 5) n = 5;
        return n;
    }
    function pinOrderIndex(tag, order) {
        if (!order || !order.length) return 9999;
        var i = order.indexOf(tag);
        return i < 0 ? 9999 : i;
    }
    function sortPinned(tags, getRating, pinOrder) {
        if (!tags || !tags.length) return tags;
        tags.sort(function (a, b) {
            var ra = clampRating(typeof getRating === "function" ? getRating(a) : 0);
            var rb = clampRating(typeof getRating === "function" ? getRating(b) : 0);
            if (ra !== rb) return rb - ra;
            var ia = pinOrderIndex(a, pinOrder), ib = pinOrderIndex(b, pinOrder);
            if (ia !== ib) return ia - ib;
            return String(a || "").localeCompare(String(b || ""));
        });
        return tags;
    }
    function sortTagFavKeys(keys, items, mode) {
        keys = (keys || []).slice();
        items = items || {};
        mode = mode || "rate";
        var order = Array.isArray(items._order) ? items._order : [];
        if (mode === "rate") {
            sortPinned(keys, function (k) {
                var inf = items[k];
                return inf && typeof inf === "object" ? inf.rating : 0;
            }, order);
            return keys;
        }
        var idx = {};
        var i;
        for (i = 0; i < order.length; i++) idx[order[i]] = i;
        keys.sort(function (a, b) {
            var ia = Object.prototype.hasOwnProperty.call(idx, a) ? idx[a] : 99999;
            var ib = Object.prototype.hasOwnProperty.call(idx, b) ? idx[b] : 99999;
            if (ia !== ib) return ia - ib;
            return String(a || "").localeCompare(String(b || ""));
        });
        if (mode === "desc") keys.reverse();
        return keys;
    }
    var _favSkipKey = "";
    var _favSkipUntil = 0;
    function fireFavListeners() {
        _favSyncTimer = 0;
        var skip = (Date.now() < _favSkipUntil) ? _favSkipKey : "";
        var list = _favListeners.slice();
        for (var i = 0; i < list.length; i++) {
            var rec = list[i];
            var fn = rec && rec.fn ? rec.fn : rec;
            var key = rec && rec.skip ? rec.skip : "";
            if (skip && key && skip === key) continue;
            try { if (typeof fn === "function") fn(); } catch (e) {}
        }
    }
    function scheduleFavListeners() {
        if (_favSyncTimer) clearTimeout(_favSyncTimer);
        _favSyncTimer = setTimeout(fireFavListeners, 80);
    }
    function ensureFavSync() {
        if (_favSyncReady) return;
        _favSyncReady = true;
        window.addEventListener("storage", function (e) {
            if (e && e.key === FAV_REV_KEY) scheduleFavListeners();
        });
        window.addEventListener("anima-fav-changed", scheduleFavListeners);
        try {
            if (!window.__animaFavBC) window.__animaFavBC = new BroadcastChannel("anima-fav");
            window.__animaFavBC.addEventListener("message", scheduleFavListeners);
        } catch (e) {}
    }
    function emitFavChanged(skipKey) {
        if (skipKey) {
            _favSkipKey = skipKey;
            _favSkipUntil = Date.now() + 500;
        }
        try { localStorage.setItem(FAV_REV_KEY, String(Date.now())); } catch (e) {}
        try { window.dispatchEvent(new CustomEvent("anima-fav-changed")); } catch (e2) {}
        try {
            if (!window.__animaFavBC) window.__animaFavBC = new BroadcastChannel("anima-fav");
            window.__animaFavBC.postMessage({ t: "fav", at: Date.now() });
        } catch (e3) {}
    }
    function onFavChanged(fn, skipKey) {
        if (typeof fn !== "function") return function () {};
        ensureFavSync();
        var rec = { fn: fn, skip: skipKey || "" };
        _favListeners.push(rec);
        return function () {
            var i = _favListeners.indexOf(rec);
            if (i >= 0) _favListeners.splice(i, 1);
        };
    }
    function makeRateRow(cur, onPick, opts) {
        opts = opts || {};
        cur = clampRating(cur);
        var row = document.createElement("div");
        row.className = "anima-fav-rate" + (opts.unpin ? " is-unpin" : "") + (opts.overlay ? " is-overlay" : "");
        if (opts.tag) row.setAttribute("data-rate-tag", String(opts.tag));
        row.style.cssText = "display:flex;align-items:center;justify-content:" + (opts.center ? "center" : "flex-start") + ";gap:0;line-height:1;margin-top:" + (opts.overlay ? "0" : "2px") + ";user-select:none;";
        row._cur = cur;
        var txt = typeof animaTxt === "function" ? animaTxt : function (s) { return s; };
        function paint(n) {
            n = clampRating(n);
            row._cur = n;
            var btns = row.querySelectorAll("button");
            for (var i = 0; i < btns.length; i++) {
                var on = (i + 1) <= n;
                btns[i].style.color = on ? "var(--opv-star-on, #ffd24d)" : "var(--opv-star-off, rgba(255,255,255,.28))";
                btns[i].style.textShadow = on ? "0 0 4px rgba(255,210,77,.45)" : "none";
            }
        }
        row._setRating = paint;
        for (var i = 1; i <= 5; i++) {
            (function (n) {
                var b = document.createElement("button");
                b.type = "button";
                b.textContent = "\u2605";
                b.title = n + txt("\u661f");
                b.setAttribute("aria-label", n + txt("\u661f"));
                b.style.cssText = "appearance:none;border:0;background:transparent;padding:0 1px;margin:0;cursor:pointer;font-size:" + (opts.size || 12) + "px;line-height:1;color:" + (n <= cur ? "var(--opv-star-on, #ffd24d)" : "var(--opv-star-off, rgba(255,255,255,.28))") + ";text-shadow:" + (n <= cur ? "0 0 4px rgba(255,210,77,.45)" : "none") + ";";
                b.onclick = function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof onPick === "function") onPick(row._cur === n ? 0 : n);
                };
                row.appendChild(b);
            })(i);
        }
        row.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); });
        row.addEventListener("mousedown", function (e) { e.stopPropagation(); });
        return row;
    }
    function paintRateTag(tag, n, root) {
        if (tag == null || tag === "") return;
        n = clampRating(n);
        root = root || document;
        var rows = root.querySelectorAll ? root.querySelectorAll(".anima-fav-rate[data-rate-tag]") : [];
        for (var i = 0; i < rows.length; i++) {
            if (rows[i].getAttribute("data-rate-tag") !== String(tag)) continue;
            if (typeof rows[i]._setRating === "function") rows[i]._setRating(n);
        }
    }
    function rateFavorite(src, tag, cat, n, skipKey) {
        n = clampRating(n);
        var url = src === "gelbooru" ? "/gelbooru_anima/favorites/rate" : "/danbooru_anima/favorites/rate";
        return fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tag: tag, category: cat || "artists", rating: n })
        }).then(function (r) { return r.json(); }).then(function (d) {
            if (d && d.success) emitFavChanged(skipKey);
            return d;
        });
    }
    var rateCss = document.getElementById("anima-fav-rate-css");
    if (!rateCss) {
        rateCss = document.createElement("style");
        rateCss.id = "anima-fav-rate-css";
        (document.head || document.documentElement).appendChild(rateCss);
    }
    rateCss.textContent =
        ".anima-fav-rate{display:none;}" +
        ".opv-art-card>.anima-fav-rate{display:flex!important;}" +
        ".tp-pin-chip .anima-fav-rate{display:flex!important;}" +
        ".fav-img-wrap>.anima-fav-rate,.anima-fav-rate.is-overlay{display:flex!important;position:absolute;left:0;right:0;bottom:0;z-index:4;" +
        "margin:0;padding:5px 0 4px;justify-content:center!important;background:linear-gradient(180deg,transparent,rgba(0,0,0,.66));" +
        "opacity:0;pointer-events:none;transition:opacity .12s ease;}" +
        ".fav-img-wrap:hover>.anima-fav-rate{opacity:1;pointer-events:auto;}" +
        ".fav-img-wrap>.anima-fav-rate.is-unpin{transition-delay:0s;}" +
        ".fav-img-wrap:hover>.anima-fav-rate.is-unpin{transition-delay:.32s;}" +
        ".anima-fav-rate button:hover{filter:brightness(1.25);}";

    window.animaFavGrid = {
        cell: cell,
        setCell: setCell,
        hd: hd,
        setHd: setHd,
        metrics: metrics,
        applyGrid: applyGrid,
        applyCards: applyCards,
        finish: finish,
        toThumbUrl: toThumbUrl,
        proxySrc: proxySrc,
        bindImg: bindImg,
        refreshImgs: refreshImgs,
        applyLiveSrcs: applyLiveSrcs,
        mountBar: mountBar,
        pageSize: pageSize,
        slicePage: slicePage,
        mountPager: mountPager,
        applyJoinSort: applyJoinSort,
        newestFirst: newestFirst,
        loadThumbMap: loadThumbMap,
        localThumb: localThumb,
        favSrc: favSrc,
        live: live,
        setLive: setLive,
        liveThumb: liveThumb,
        loadLiveMap: loadLiveMap,
        ensureLiveThumbs: ensureLiveThumbs,
        queueLiveAutofill: queueLiveAutofill,
        clampRating: clampRating,
        sortPinned: sortPinned,
        sortTagFavKeys: sortTagFavKeys,
        makeRateRow: makeRateRow,
        paintRateTag: paintRateTag,
        rateFavorite: rateFavorite,
        emitChange: emitFavChanged,
        onChange: onFavChanged
    };
})();
