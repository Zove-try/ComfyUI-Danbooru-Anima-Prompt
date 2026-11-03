/**
 * Stack extra output slots onto the first slot so LiteGraph measures ~1
 * row of outputs. That drops widgetStartY and removes the empty band
 * between the title bar and the custom DOM UI.
 *
 * Expand must CLEAR stale widgets_start_y (?? short-circuits arrange),
 * ASSIGN default slot pos, then force DOM widget.y down. GraphView
 * places the browser overlay at node.pos + widget.y.
 *
 * Do not splice / removeOutput — slot indexes stay put, existing links stay valid.
 */
(function () {
    if (window.__animaCollapseOutputsVer === 7) return;
    window.__animaCollapseOutputsVer = 7;
    window.__animaCollapseOutputsLoaded = true;

    function slotH() {
        try {
            if (typeof LiteGraph !== "undefined" && LiteGraph.NODE_SLOT_HEIGHT) {
                return LiteGraph.NODE_SLOT_HEIGHT;
            }
        } catch (e) {}
        return 20;
    }

    function titleH() {
        try {
            if (typeof LiteGraph !== "undefined" && LiteGraph.NODE_TITLE_HEIGHT) {
                return LiteGraph.NODE_TITLE_HEIGHT;
            }
        } catch (e) {}
        return 30;
    }

    function collapsedRelPos(node) {
        var h = slotH();
        var offset = h * 0.5;
        var w = (node.size && node.size[0]) || 800;
        return [w + 1 - offset, 0.7 * h];
    }

    function defaultRelPos(node, i) {
        var h = slotH();
        var offset = h * 0.5;
        var w = (node.size && node.size[0]) || 800;
        return [w + 1 - offset, (i + 0.7) * h];
    }

    function collapsedStartY() {
        return Math.round(slotH() * 1.2);
    }

    function extraSlots(node) {
        var n = (node.outputs && node.outputs.length) || 0;
        return Math.max(0, n - 1);
    }

    function collapseDelta(node) {
        return extraSlots(node) * slotH();
    }

    function expandedStartY(node) {
        return collapsedStartY() + collapseDelta(node);
    }

    function slotRelPos(node, i) {
        if (node && node._animaPortsCollapsed) return collapsedRelPos(node);
        return defaultRelPos(node, i);
    }

    function slotAbsPos(node, i) {
        var p = slotRelPos(node, i);
        var nx = (node.pos && node.pos[0]) || 0;
        var ny = (node.pos && node.pos[1]) || 0;
        return [nx + p[0], ny + p[1]];
    }

    function expandedMeasureRect(node) {
        var h = slotH();
        var n = (node.outputs && node.outputs.length) || 0;
        if (n < 1) n = 1;
        var nx = (node.pos && node.pos[0]) || 0;
        var ny = (node.pos && node.pos[1]) || 0;
        var first = defaultRelPos(node, 0);
        var last = defaultRelPos(node, n - 1);
        var top = ny + first[1] - h * 0.5;
        var bot = ny + last[1] + h * 0.5;
        return [nx + first[0] - h * 0.5, top, h, bot - top];
    }

    function dirty(node) {
        try {
            if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
        } catch (e) {}
        try {
            if (node.graph && typeof node.graph.setDirtyCanvas === "function") {
                node.graph.setDirtyCanvas(true, true);
            }
        } catch (e2) {}
        try {
            if (window.app && app.graph && typeof app.graph.setDirtyCanvas === "function") {
                app.graph.setDirtyCanvas(true, true);
            }
        } catch (e3) {}
    }

    function resolveMethod(obj, name) {
        var p = obj;
        for (var i = 0; i < 16 && p; i++) {
            try {
                var d = Object.getOwnPropertyDescriptor(p, name);
                if (d) {
                    if (typeof d.value === "function") return d.value;
                    if (typeof d.get === "function") {
                        try {
                            var v = d.get.call(obj);
                            if (typeof v === "function") return v;
                        } catch (e) {}
                    }
                }
            } catch (e2) {}
            try {
                if (Object.prototype.hasOwnProperty.call(p, name) && typeof p[name] === "function") {
                    return p[name];
                }
            } catch (e3) {}
            p = Object.getPrototypeOf(p);
        }
        try {
            if (typeof obj[name] === "function") return obj[name];
        } catch (e4) {}
        return null;
    }

    function wrapOnTarget(target, name, wrapper, flag) {
        if (!target || target[flag]) return false;
        var orig = resolveMethod(target, name);
        if (typeof orig !== "function") return false;
        try {
            target[name] = function () {
                return wrapper.call(this, orig, arguments);
            };
            target[flag] = true;
            return true;
        } catch (e) {
            return false;
        }
    }

    function wrapInstanceResolved(node, name, wrapper) {
        wrapOnTarget(node, name, wrapper, "_animaWrap_" + name);
    }

    function wrapProtoChain(node, name, wrapper, protoFlag) {
        var p = Object.getPrototypeOf(node);
        for (var i = 0; i < 16 && p; i++) {
            try {
                if (Object.prototype.hasOwnProperty.call(p, name) && typeof p[name] === "function") {
                    return wrapOnTarget(p, name, wrapper, protoFlag);
                }
            } catch (e) {}
            p = Object.getPrototypeOf(p);
        }
        return false;
    }

    function wrapOrAdd(node, name, wrapper) {
        if (node["_animaWrap_" + name]) return;
        var orig = resolveMethod(node, name);
        if (typeof orig !== "function") orig = function () {};
        node["_animaOrig_" + name] = orig;
        node[name] = function () {
            return wrapper.call(this, orig, arguments);
        };
        node["_animaWrap_" + name] = true;
    }

    function setSlotPos(o, x, y) {
        if (!o) return;
        try {
            o.pos = [x, y];
        } catch (e) {
            try {
                if (o.pos) {
                    o.pos[0] = x;
                    o.pos[1] = y;
                }
            } catch (e2) {}
        }
    }

    function ensureBoundingRect(slot, absX, absY) {
        if (!slot) return;
        var h = slotH();
        var x = absX - h * 0.5;
        var y = absY - h * 0.5;
        if (!slot.boundingRect) {
            try { slot.boundingRect = [x, y, h, h]; } catch (e) { return; }
        }
        try {
            slot.boundingRect[0] = x;
            slot.boundingRect[1] = y;
            slot.boundingRect[2] = h;
            slot.boundingRect[3] = h;
        } catch (e2) {
            try { slot.boundingRect = [x, y, h, h]; } catch (e3) {}
        }
    }

    function writeAbsPos(node, i, out) {
        var p = slotAbsPos(node, i);
        if (out && typeof out === "object") {
            try { out[0] = p[0]; out[1] = p[1]; } catch (e) {}
            return out;
        }
        return p;
    }

    function layoutOwned(node) {
        return !!(node && (node._animaPortsCollapsed || node._animaLayoutOwned));
    }

    function captureMeta(node) {
        if (node._animaOrigOutputMeta) return;
        var outs = node.outputs || [];
        node._animaOrigOutputMeta = outs.map(function (o) {
            if (!o) return null;
            return {
                name: o.name,
                hasLabel: Object.prototype.hasOwnProperty.call(o, "label"),
                label: o.label,
                hasLoc: Object.prototype.hasOwnProperty.call(o, "localized_name"),
                localized_name: o.localized_name
            };
        });
    }

    function restoreLabels(node) {
        var meta = node._animaOrigOutputMeta;
        if (!meta || !node.outputs) return;
        for (var i = 0; i < node.outputs.length; i++) {
            var o = node.outputs[i];
            var m = meta[i];
            if (!o || !m) continue;
            o.name = m.name;
            if (m.hasLabel) o.label = m.label;
            else {
                try { delete o.label; } catch (e) { o.label = undefined; }
            }
            if (m.hasLoc) o.localized_name = m.localized_name;
            else {
                try { delete o.localized_name; } catch (e2) { o.localized_name = undefined; }
            }
        }
        if (typeof window.animaApplyOutputLabels === "function" && node._animaPortZhNames) {
            window.animaApplyOutputLabels(node, node._animaPortZhNames);
        }
    }

    function clearCollapseFlag(o) {
        if (!o) return;
        try { delete o._animaCollapsePos; } catch (e) { o._animaCollapsePos = undefined; }
    }

    function clearSlotPos(o) {
        if (!o) return;
        clearCollapseFlag(o);
        try { delete o.pos; } catch (e) {
            try { o.pos = undefined; } catch (e2) {}
        }
    }

    function restoreMeta(node) {
        restoreLabels(node);
        var outs = node.outputs || [];
        for (var i = 0; i < outs.length; i++) clearSlotPos(outs[i]);
    }

    function applySlotGeometry(node) {
        var outs = node.outputs || [];
        var conc = node._concreteOutputs;
        var nx = (node.pos && node.pos[0]) || 0;
        var ny = (node.pos && node.pos[1]) || 0;
        for (var i = 0; i < outs.length; i++) {
            var p = slotRelPos(node, i);
            var o = outs[i];
            if (o) {
                setSlotPos(o, p[0], p[1]);
                if (node._animaPortsCollapsed) o._animaCollapsePos = true;
                else clearCollapseFlag(o);
                ensureBoundingRect(o, nx + p[0], ny + p[1]);
            }
            var c = conc && conc[i];
            if (c && c !== o) {
                setSlotPos(c, p[0], p[1]);
                if (node._animaPortsCollapsed) c._animaCollapsePos = true;
                else clearCollapseFlag(c);
                ensureBoundingRect(c, nx + p[0], ny + p[1]);
            }
        }
    }

    function applyCollapsedPos(node) {
        applySlotGeometry(node);
    }

    function applyExpandedPos(node) {
        applySlotGeometry(node);
        try {
            if (typeof node._setConcreteSlots === "function") node._setConcreteSlots();
        } catch (e) {}
        applySlotGeometry(node);
    }

    function hideExtraLabels(node) {
        var outs = node.outputs || [];
        for (var i = 1; i < outs.length; i++) {
            if (outs[i]) outs[i].label = " ";
        }
    }

    function setStartY(node, y) {
        try { delete node.widgets_start_y; } catch (e) {}
        try { node.widgets_start_y = undefined; } catch (e2) {}
        try { node.widgets_start_y = y; } catch (e3) {}
        try {
            if (node.widgets_start_y !== y) {
                Object.defineProperty(node, "widgets_start_y", {
                    value: y, writable: true, configurable: true, enumerable: true
                });
            }
        } catch (e4) {}
    }

    function applyOwnedLayout(node) {
        if (!node) return;
        try { node.widgets_up = false; } catch (e) {}
        if (node._animaPortsCollapsed) {
            applyCollapsedPos(node);
            hideExtraLabels(node);
            setStartY(node, collapsedStartY());
        } else {
            applyExpandedPos(node);
            setStartY(node, expandedStartY(node));
        }
    }

    function isDomLayoutWidget(w) {
        if (!w) return false;
        var n = w.name || "";
        if (n === "danbooru_browser_ui" || n === "gelbooru_browser_ui") return true;
        if (w.hidden) return false;
        if (typeof w.computeLayoutSize === "function") return true;
        if (w.element) return true;
        var t = w.type;
        return t === "div" || t === "DIV" || t === "custom";
    }

    function forceWidgetY(node, y) {
        if (y == null || isNaN(y)) return;
        var ws = node.widgets || [];
        for (var i = 0; i < ws.length; i++) {
            var w = ws[i];
            if (!isDomLayoutWidget(w)) continue;
            w.y = y;
            try { w.last_y = y; } catch (e) {}
            try {
                var bh = (node.size && node.size[1]) || 0;
                if (bh > y) w.computedHeight = bh - y;
            } catch (e2) {}
        }
    }

    function relayoutWidgets(node) {
        if (!node || !layoutOwned(node)) return;
        if (node._animaRelayouting) return;
        node._animaRelayouting = true;
        try {
            applyOwnedLayout(node);
            try {
                if (typeof node._setConcreteSlots === "function") node._setConcreteSlots();
            } catch (e) {}
            applyOwnedLayout(node);
            var y = node._animaPortsCollapsed ? collapsedStartY() : expandedStartY(node);
            setStartY(node, y);
            try {
                if (typeof node._arrangeWidgets === "function") node._arrangeWidgets(y);
            } catch (e2) {}
            forceWidgetY(node, y);
        } finally {
            node._animaRelayouting = false;
        }
    }

    function scheduleRelayout(node) {
        relayoutWidgets(node);
        dirty(node);
        var n = 0;
        function tick() {
            try { relayoutWidgets(node); dirty(node); } catch (e) {}
            n += 1;
            if (n < 8) requestAnimationFrame(tick);
        }
        try { requestAnimationFrame(tick); } catch (e0) {}
        setTimeout(function () { try { relayoutWidgets(node); dirty(node); } catch (e) {} }, 0);
        setTimeout(function () { try { relayoutWidgets(node); dirty(node); } catch (e2) {} }, 50);
        setTimeout(function () { try { relayoutWidgets(node); dirty(node); } catch (e3) {} }, 160);
    }

    function syncChrome(node) {
        try {
            if (typeof node._animaSyncPortsChrome === "function") node._animaSyncPortsChrome();
        } catch (e) {}
    }

    function setNodeSize(node, w, h) {
        try {
            if (typeof node.setSize === "function") node.setSize([w, h]);
            else {
                node.size[0] = w;
                node.size[1] = h;
            }
        } catch (e) {
            try { node.size[1] = h; } catch (e2) {}
        }
    }

    function shrinkHeight(node) {
        if (node._animaHeightShrunk) return;
        var d = collapseDelta(node);
        if (d <= 0 || !node.size) return;
        node._animaCollapseDelta = d;
        setNodeSize(node, node.size[0], Math.max(240, node.size[1] - d));
        node._animaHeightShrunk = true;
    }

    function growHeight(node) {
        if (!node._animaHeightShrunk) return;
        var d = node._animaCollapseDelta || collapseDelta(node);
        if (!node.size) {
            node._animaHeightShrunk = false;
            return;
        }
        if (d > 0) setNodeSize(node, node.size[0], node.size[1] + d);
        node._animaHeightShrunk = false;
    }

    function applyVisual(node, collapsed) {
        node._animaLayoutOwned = true;
        if (collapsed) {
            applyCollapsedPos(node);
            hideExtraLabels(node);
            setStartY(node, collapsedStartY());
        } else {
            restoreLabels(node);
            applyExpandedPos(node);
            setStartY(node, expandedStartY(node));
        }
        try {
            if (typeof node.arrange === "function") node.arrange();
        } catch (e2) {}
        relayoutWidgets(node);
        dirty(node);
    }

    function injectChromeStyle() {
        var _oldPorts = document.getElementById("anima-ports-chrome-style");
        if (_oldPorts) _oldPorts.remove();
        if (document.getElementById("anima-ports-chrome-style-v2")) return;
        var st = document.createElement("style");
        st.id = "anima-ports-chrome-style-v2";
        st.textContent =
            ".anima-ports-chrome{display:flex;align-items:center;justify-content:space-between;height:22px;min-height:22px;flex:0 0 22px;padding:0 10px 0 12px;box-sizing:border-box;background:linear-gradient(180deg,rgba(var(--anima-bg-rgb),.5),rgba(var(--anima-well-deepest-rgb),.12));border-bottom:1px solid rgba(var(--anima-accent-rgb),.16);box-shadow:inset 0 1px 0 rgba(var(--anima-accent-soft-rgb),.07);user-select:none;pointer-events:auto;}"
            + ".anima-ports-chrome-kicker{font-size:10px;letter-spacing:.32em;color:var(--anima-title);line-height:1;}"
            + ".anima-ports-chrome-btn{appearance:none;-webkit-appearance:none;display:inline-flex;align-items:center;gap:6px;height:16px;padding:0;margin:0;border:0;border-bottom:1px solid transparent;border-radius:0;background:transparent;color:var(--anima-mute-dim);font-size:11px;line-height:1;cursor:pointer;box-shadow:none;font-family:inherit;}"
            + ".anima-ports-chrome-btn:hover,.danbooru-anima-browser button.anima-ports-chrome-btn:hover,.gel-browser-root button.anima-ports-chrome-btn:hover{filter:none!important;transform:none!important;color:var(--anima-mute)!important;background:transparent!important;box-shadow:none!important;border-bottom-color:rgba(var(--anima-accent-soft-rgb),.5);}"
            + ".anima-ports-chrome-chev{font-size:9px;color:var(--anima-dot-off);transform:translateY(-0.5px);}"
            + ".anima-ports-chrome.is-collapsed .anima-ports-chrome-btn,.anima-ports-chrome.is-collapsed .anima-ports-chrome-chev{color:var(--anima-accent-soft);}";
        document.head.appendChild(st);
    }

    window.animaMakePortsChromeToggle = function (node) {
        injectChromeStyle();
        var bar = document.createElement("div");
        bar.className = "anima-ports-chrome";
        var kicker = document.createElement("span");
        kicker.className = "anima-ports-chrome-kicker";
        kicker.textContent = animaTxt("节点外形");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "anima-ports-chrome-btn";
        btn.title = animaTxt("收起或展开右侧输出口。只改节点外形，不是搜索工具。");
        var chev = document.createElement("span");
        chev.className = "anima-ports-chrome-chev";
        var label = document.createElement("span");
        label.className = "anima-ports-chrome-label";
        btn.appendChild(chev);
        btn.appendChild(label);
        function sync() {
            var c = !!(node && node._animaPortsCollapsed);
            bar.classList.toggle("is-collapsed", c);
            chev.textContent = c ? "▾" : "▴";
            label.textContent = c ? animaTxt("展开右侧端口") : animaTxt("收起右侧端口");
            btn.setAttribute("aria-pressed", c ? "true" : "false");
        }
        btn.addEventListener("click", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            if (!node || typeof node._animaSetPortsCollapsed !== "function") return;
            node._animaSetPortsCollapsed(!node._animaPortsCollapsed, { adjustHeight: true });
            sync();
        });
        bar.appendChild(kicker);
        bar.appendChild(btn);
        if (node) node._animaSyncPortsChrome = sync;
        sync();
        return bar;
    };

    function wrapArrangeWidgets(orig, args) {
        if (this._animaArrangingWidgets) return orig.apply(this, args);
        if (!layoutOwned(this)) return orig.apply(this, args);
        this._animaArrangingWidgets = true;
        try {
            applyOwnedLayout(this);
            var y = this._animaPortsCollapsed ? collapsedStartY() : expandedStartY(this);
            setStartY(this, y);
            var r;
            try { r = orig.call(this, y); } catch (e) { r = undefined; }
            forceWidgetY(this, y);
            return r;
        } finally {
            this._animaArrangingWidgets = false;
        }
    }

    function wrapArrange(orig, args) {
        if (this._animaArranging) return orig.apply(this, args);
        this._animaArranging = true;
        try {
            if (layoutOwned(this)) applyOwnedLayout(this);
            var r;
            try { r = orig.apply(this, args); } catch (e) { r = undefined; }
            if (layoutOwned(this)) relayoutWidgets(this);
            return r;
        } finally {
            this._animaArranging = false;
        }
    }

    function wrapMeasureSlots(orig, args) {
        if (layoutOwned(this) && !this._animaPortsCollapsed) {
            applyExpandedPos(this);
            try { orig.apply(this, args); } catch (e) {}
            return expandedMeasureRect(this);
        }
        if (layoutOwned(this) && this._animaPortsCollapsed) {
            applyCollapsedPos(this);
        }
        return orig.apply(this, args);
    }

    function wrapDraw(orig, args) {
        var r = orig.apply(this, args);
        if (layoutOwned(this)) {
            var y = this._animaPortsCollapsed ? collapsedStartY() : expandedStartY(this);
            forceWidgetY(this, y);
        }
        return r;
    }

    function wrapConcreteSlots(orig, args) {
        var r = orig.apply(this, args);
        if (layoutOwned(this)) applySlotGeometry(this);
        return r;
    }

    window.hookAnimaCollapseOutputs = function (node, opts) {
        if (!node) return null;
        opts = opts || {};
        if (node._animaCollapseHooked) {
            return {
                setCollapsed: function (c, o) { node._animaSetPortsCollapsed(c, o); },
                isCollapsed: function () { return !!node._animaPortsCollapsed; },
                applyFromStore: function () { node._animaApplyPortsFromStore(); }
            };
        }
        node._animaCollapseHooked = true;
        node._animaPortsCollapsed = false;
        node._animaHeightShrunk = false;
        node._animaLayoutOwned = false;

        wrapProtoChain(node, "_arrangeWidgets", wrapArrangeWidgets, "_animaPortsProtoArrangeV7");
        wrapProtoChain(node, "arrange", wrapArrange, "_animaPortsProtoLayoutV7");
        wrapProtoChain(node, "_measureSlots", wrapMeasureSlots, "_animaPortsProtoMeasureV7");
        wrapProtoChain(node, "draw", wrapDraw, "_animaPortsProtoDrawV7");
        wrapProtoChain(node, "_setConcreteSlots", wrapConcreteSlots, "_animaPortsProtoConcreteV7");

        wrapInstanceResolved(node, "getOutputPos", function (orig, args) {
            if (layoutOwned(this)) return writeAbsPos(this, args[0] | 0);
            return orig.apply(this, args);
        });

        wrapInstanceResolved(node, "getConnectionPos", function (orig, args) {
            if (layoutOwned(this) && !args[0]) {
                var idx = this._animaPortsCollapsed ? 0 : (args[1] | 0);
                return writeAbsPos(this, idx, args[2]);
            }
            return orig.apply(this, args);
        });

        wrapInstanceResolved(node, "getSlotPosition", function (orig, args) {
            if (layoutOwned(this) && !args[1]) return writeAbsPos(this, args[0] | 0);
            return orig.apply(this, args);
        });

        wrapInstanceResolved(node, "_arrangeWidgets", wrapArrangeWidgets);
        wrapInstanceResolved(node, "arrange", wrapArrange);
        wrapInstanceResolved(node, "_measureSlots", wrapMeasureSlots);
        wrapInstanceResolved(node, "draw", wrapDraw);
        wrapInstanceResolved(node, "_setConcreteSlots", wrapConcreteSlots);

        wrapOrAdd(node, "onResize", function (orig, args) {
            var r = orig.apply(this, args);
            if (layoutOwned(this)) applySlotGeometry(this);
            return r;
        });

        wrapInstanceResolved(node, "serialize", function (orig, args) {
            if (this._animaOrigOutputMeta) restoreMeta(this);
            var data;
            try { data = orig.apply(this, args); } catch (e) { data = null; }
            if (layoutOwned(this)) applyOwnedLayout(this);
            return data;
        });

        wrapOrAdd(node, "onConfigure", function (orig, args) {
            var r = orig.apply(this, args);
            var self = this;
            setTimeout(function () { try { self._animaApplyPortsFromStore(); } catch (e) {} }, 0);
            setTimeout(function () { try { self._animaApplyPortsFromStore(); } catch (e) {} }, 80);
            setTimeout(function () { try { self._animaApplyPortsFromStore(); } catch (e) {} }, 260);
            return r;
        });

        wrapOrAdd(node, "onMouseDown", function (orig, args) {
            var pos = args[1];
            if (this._animaPortsCollapsed && pos && this.size) {
                var sh = slotH();
                var th = titleH();
                var x = pos[0];
                var y = pos[1];
                var hitX = x > this.size[0] - 32;
                var hitY = y > -th - 4 && y < sh * 2.6;
                if (hitX && hitY) {
                    this._animaSetPortsCollapsed(false, { adjustHeight: true });
                    return true;
                }
            }
            return orig.apply(this, args);
        });

        node._animaSetPortsCollapsed = function (collapsed, opt) {
            collapsed = !!collapsed;
            opt = opt || {};
            var heightAdj = !!opt.adjustHeight;
            var was = !!this._animaPortsCollapsed;
            if (collapsed === was) {
                if (collapsed || this._animaLayoutOwned || this._animaOrigOutputMeta) {
                    applyOwnedLayout(this);
                    try { this.arrange(); } catch (e) {}
                    scheduleRelayout(this);
                }
                syncChrome(this);
                return;
            }
            this._animaPortsCollapsed = collapsed;
            try {
                if (!this.properties) this.properties = {};
                this.properties.anima_ports_collapsed = collapsed;
            } catch (e) {}
            if (collapsed) captureMeta(this);
            applyVisual(this, collapsed);
            if (heightAdj) {
                if (collapsed) shrinkHeight(this);
                else growHeight(this);
                try { this.arrange(); } catch (e2) {}
                scheduleRelayout(this);
            }
            syncChrome(this);
            if (!opt.silent && typeof opts.onChange === "function") {
                try { opts.onChange(collapsed); } catch (e3) {}
            }
        };

        node._animaApplyPortsFromStore = function () {
            var v = false;
            if (typeof opts.readStored === "function") {
                try { v = !!opts.readStored(); } catch (e) { v = false; }
            } else {
                try { v = !!(this.properties && this.properties.anima_ports_collapsed); } catch (e2) { v = false; }
            }
            this._animaSetPortsCollapsed(v, { adjustHeight: false, silent: true });
        };

        return {
            setCollapsed: function (c, o) { node._animaSetPortsCollapsed(c, o); },
            isCollapsed: function () { return !!node._animaPortsCollapsed; },
            applyFromStore: function () { node._animaApplyPortsFromStore(); }
        };
    };
})();
