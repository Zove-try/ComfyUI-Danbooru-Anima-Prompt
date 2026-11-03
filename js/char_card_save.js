import "./00_anima_i18n.js";
// char_card_save.js - 角色卡保存（独立模块）
// 从 anima_prompt_composer.js 抽取，供 newbie 等节点独立使用
// 数据存后端 /anima_random/character_cards/save，不依赖任何节点

(() => {
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

    // esc() 全局定义（与创作器一致；独立文件必须自带，否则 ReferenceError）
    if (typeof window.esc !== "function") {
        window.esc = function(s){ return (s||"").replace(/</g,"&lt;").replace(/>/g,"&gt;"); };
    }
    const _exportCharCardSave = () => {
            window.isAdexCharCard = function(cd) {
                return !!(cd && (cd.source === "animadex" || String(cd.id || "").indexOf("adex:") === 0));
            };
            window.deleteCharacterCard = function(cd) {
                if (window.isAdexCharCard(cd)) {
                    var tag = String(cd.id || "").replace(/^adex:/, "") || cd.name || "";
                    return fetch("/danbooru_anima/favorites/remove", {
                        method: "POST", headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({tag: tag, category: "animadex_characters"})
                    });
                }
                return fetch("/anima_random/character_cards/delete", {
                    method: "POST", headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({id: (cd && cd.id) || ""})
                });
            };
            window.ensureAdexCardTags = function(cd) {
                cd = cd || {};
                if (String(cd.tags || "").trim() || !window.isAdexCharCard(cd) || typeof window._adexEnrichCharFav !== "function") {
                    return Promise.resolve(cd);
                }
                var tag = String(cd.id || "").replace(/^adex:/, "") || cd.name || "";
                return window._adexEnrichCharFav(tag, {
                    thumb: cd.thumb || "",
                    tags: [],
                    copyright_name: cd.series || "",
                    cn: cd.cn || ""
                }).then(function(p) {
                    p = p || {};
                    var tags = p.tags || [];
                    if (Array.isArray(tags)) tags = tags.join(", ");
                    return {
                        id: cd.id,
                        name: p.name || cd.name,
                        series: p.copyright_name || cd.series || "",
                        tags: tags,
                        thumb: p.thumb_url || cd.thumb || "",
                        source: "animadex",
                        cn: cd.cn || ""
                    };
                }).catch(function(){ return cd; });
            };
            function saveCharCard(name, series, tags, thumbUrl, isFromGel, cardId) {
                console.log("[SCC] saveCharCard called, name=",name," isFromGel=",isFromGel);
                if (!name) name = "未命名"; if (!tags) tags = []; tags = tags.map(function(t){return (t||"").trim();}).filter(Boolean); if (typeof tags === "string") { if (tags.indexOf(' ') >= 0) { tags = tags.trim().split(/\s+/).filter(Boolean); } else { tags = tags.split(/[,，]+/).map(function(t){return t.trim();}).filter(Boolean); } } if (!Array.isArray(tags)) tags = [];
                let ftags = tags.slice();
                if (isFromGel) {
                    const poseExprBg = /^(standing|sitting|lying|kneeling|squatting|looking_at|looking_back|looking_away|looking_up|looking_down|arms_up|arms_behind|arms_crossed|hands_on|hands_in|hands_clasped|saluting|waving|pointing|thumbs_up|peace_sign|holding|grabbing|reaching_out|leaning|fighting|running|walking|jumping|floating|falling|stretching|spread_arms|dancing|crouching|on_bed|on_floor|against_wall|on_grass|crossed_legs|hand_on_chin|hand_to_mouth|looking_over|upside_down|hanging|climbing|splashing|praying|smile|open_mouth|closed_eyes|angry|sad|surprised|happy|embarrassed|laughing|crying|tears|pout|tongue_out|tongue|wink|seductive|evil_smile|forced_smile|serious|nervous|determined|sleepy|tired|yawning|screaming|shouting|frowning|blank_eyes|half-closed|glaring|scowl|pensive|disgust|scared|sulking|nosebleed|saliva|parted_lips|biting_lip|deadpan|grinning|mischievous|shocked|terrified|jealous|inquisitive|pleading|simple_background|white_background|gradient_background|grey_background|black_background|blue_background|outdoors|indoors|cityscape|sky|night_sky|starry_sky|sunset|sunrise|cloudy|rain|snow|underwater|space|school|classroom|bedroom|living_room|bathroom|street|alley|nature|forest|beach|ocean|mountain|river|field|flower_field|park|rooftop|balcony|library|cafe|restaurant|bokeh|room|museum|stage|ruins|ice|desert|glasses|sunglasses|necktie|bowtie|ribbon|choker|necklace|bracelet|earrings|watch|ring|headphones|hat|beret|cap|crown|hair_ornament|hair_ribbon|hairband|hairpin|hair_bun|mask|bandage|eyepatch|bag|backpack|handbag|umbrella|weapon|sword|gun|shield|mechanical|bandaid|plaster|collar|leash|bell|lace_collar|anklet|toe_ring|nail_polish|tattoo|whistle|binoculars|fan|key|from_above|from_below|from_behind|from_side|close-up|full_body|cowboy_shot|portrait|upper_body|lower_body|head_only|dynamic_angle|dutch_angle|monochrome|sepia|vignette|bloom|lens_flare|depth_of_field|motion_lines|speed_lines|film_grain|backlighting|rim_lighting|sunlight|moonlight|candlelight|neon_lights|sparkle|glowing|light_particles|watermark|signature|framed|border|1girl|1boy|solo|multiple)/i;
                    ftags = tags.filter(function(t){ return !poseExprBg.test(t.toLowerCase().replace(/ /g,"_")); });
                }
                ftags = ftags.filter(function(t){ return !/^\d/.test(t) && !/^(1girl|1boy|solo|multiple)/i.test(t); });
                if (!ftags.length) { if (!isFromGel) ftags = tags.slice(); }
                console.log("[SCC] ftags=",ftags.length," creating popup");
                var ov = document.createElement("div");
                ov.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:transparent;z-index:99999;display:flex;align-items:center;justify-content:center;pointer-events:none;";
                var bx = document.createElement("div");
                bx.style.cssText = "background:#1a1a2e;border:2px solid #6a1b9a;border-radius:8px;padding:12px;width:600px;max-height:85vh;overflow-y:auto;display:flex;flex-direction:column;pointer-events:auto;";
                bx.style.cursor = "grab";
                bx.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#ce93d8;font-weight:bold;font-size:14px;">保存角色卡</span><button id="cc-close" style="padding:3px 10px;border-radius:4px;border:none;cursor:pointer;background:#e94560;color:#fff;font-size:11px;">关闭</button></div>';
                var nmInp = document.createElement("input");
                nmInp.type = "text"; nmInp.value = name; nmInp.placeholder = animaTxt("角色名"); bx.appendChild(nmInp); var sInp2 = document.createElement("input"); sInp2.type = "text"; sInp2.value = series||""; sInp2.placeholder = "系列名 (可选)"; sInp2.style.cssText = "width:100%;padding:5px;margin-bottom:4px;border-radius:4px;border:1px solid var(--anima-title);background:var(--anima-bg);color:#e0e0e0;font-size:12px;outline:none;box-sizing:border-box;"; bx.appendChild(sInp2);
                nmInp.style.cssText = "width:100%;padding:5px;margin-bottom:4px;border-radius:4px;border:1px solid var(--anima-title);background:var(--anima-bg);color:#e0e0e0;font-size:12px;outline:none;box-sizing:border-box;";
                bx.appendChild(nmInp);
                var tagArea = document.createElement("div");
                tagArea.style.cssText = "max-height:250px;overflow-y:auto;margin-bottom:6px;";
                var deletedTags = [], _tl = {};
                var undoBtn = document.createElement("button");
                undoBtn.textContent = "撤回"; undoBtn.style.cssText = "padding:3px 8px;border-radius:3px;border:none;cursor:pointer;background:#2a2a3a;color:#aaa;font-size:10px;margin-bottom:4px;";
                undoBtn.onclick = function(){ if(deletedTags.length){ var t=deletedTags.pop(); ftags.push(t); undoBtn.textContent="撤回 ("+deletedTags.length+")"; renderTagList(); } };
                bx.appendChild(undoBtn); bx.appendChild(tagArea);
                function renderTagList(){
                    tagArea.innerHTML = "";
                    for(var i=0;i<ftags.length;i++){
                        var t = ftags[i]; var cn = _tl[t.replace(/ /g,"_").toLowerCase()]||"";
                        var row = document.createElement("div");
                        row.style.cssText = "display:flex;align-items:center;gap:4px;padding:3px 0;border-bottom:1px solid var(--anima-title);";
                        var sp = document.createElement("span");
                        sp.innerHTML = '<span style="color:#ce93d8;font-size:13px;">'+esc(t)+'</span>'+(cn?' <span style="color:#aaa;font-size:11px;">('+esc(cn)+')</span>':'');
                        sp.style.cssText = "flex:1;"; row.appendChild(sp);
                        var dl = document.createElement("button");
                        dl.textContent = "X"; dl.style.cssText = "padding:1px 4px;border-radius:3px;border:none;cursor:pointer;background:transparent;color:#e94560;font-size:12px;";
                        dl.onclick = function(ii){ return function(){ deletedTags.push(ftags.splice(ii,1)[0]); undoBtn.textContent="撤回 ("+deletedTags.length+")"; renderTagList(); }; }(i);
                        row.appendChild(dl); tagArea.appendChild(row);
                    }
                }
                (function(){
                    fetch("/danbooru_anima/translate_tags",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tags:ftags.map(function(t){return (t||"").trim().replace(/ /g,"_");})})}).then(function(r){return r.json()}).then(function(d){_tl=(d.success&&d.translations)||{}; renderTagList();}).catch(function(){});
                })();
                var saveBtn = document.createElement("button");
                saveBtn.textContent = animaTxt("保存"); saveBtn.style.cssText = "width:100%;padding:6px;border-radius:4px;border:none;cursor:pointer;background:#6a1b9a;color:#e1bee7;font-size:13px;font-weight:bold;margin-top:4px;";
                saveBtn.onclick = async function(){
                    var n = nmInp.value.trim(); var s = sInp2.value.trim(); if(!n||!ftags.length) return;
                    var td = "";
                    if(thumbUrl){ if(thumbUrl.startsWith("/")){ td = thumbUrl; } else { try{ var cr = await fetch(isFromGel ? ("/gelbooru_anima/image_proxy?url="+encodeURIComponent(thumbUrl)) : ("/danbooru_anima/animadex_image?url="+encodeURIComponent(thumbUrl))); var blob = await cr.blob(); var reader = new FileReader(); reader.readAsDataURL(blob); await new Promise(function(r){reader.onload=r}); td = reader.result; }catch(e){} } }
                    await fetch("/anima_random/character_cards/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:n,series:s||"",tags:ftags.join(", "),thumb_data:td,id:cardId||""})});
                    _ccClean(); ov.remove();
                };
                bx.appendChild(saveBtn);
                bx.querySelector("#cc-close").onclick = function(){ _ccClean(); ov.remove(); };
                console.log("[SCC] appending popup");
                // 拖拽 + 位置记忆
                var _ccDrag=false,_ccDx=0,_ccDy=0;
                var _ccClean=function(){ document.removeEventListener("mousemove",_ccMove); document.removeEventListener("mouseup",_ccUp); };
                var _ccMove=function(e2){ if(!_ccDrag)return; bx.style.left=(e2.clientX-_ccDx)+"px"; bx.style.top=(e2.clientY-_ccDy)+"px" };
                var _ccUp=function(){ _ccDrag=false; try{ localStorage.setItem("cc_edit_pos",JSON.stringify({left:bx.offsetLeft,top:bx.offsetTop})); }catch(e){} };
                bx.addEventListener("mousedown",function(e2){ var tg=e2.target.tagName; if(tg==="BUTTON"||tg==="INPUT"||tg==="TEXTAREA"||tg==="SELECT")return; _ccDrag=true;_ccDx=e2.clientX-bx.offsetLeft;_ccDy=e2.clientY-bx.offsetTop;bx.style.position="fixed";bx.style.margin="0";bx.style.left=bx.offsetLeft+"px";bx.style.top=bx.offsetTop+"px";e2.preventDefault(); });
                document.addEventListener("mousemove",_ccMove);
                document.addEventListener("mouseup",_ccUp);
                try{ var _p=JSON.parse(localStorage.getItem("cc_edit_pos")||"{}"); if(_p.left){ bx.style.left=_p.left+"px"; bx.style.top=_p.top+"px"; bx.style.position="fixed"; bx.style.margin="0"; } }catch(e){} setTimeout(function(){ window.clampPopup(bx); },0);
                ov.appendChild(bx); document.body.appendChild(ov);
            }
        window.saveCharCard = saveCharCard;
    };
    _exportCharCardSave();
    if (window.app?.registerExtension) {
        window.app.registerExtension({
            name: "danbooru-anima.char-card-save",
            async beforeRegisterNodeDef() {},
        });
    }
})();
