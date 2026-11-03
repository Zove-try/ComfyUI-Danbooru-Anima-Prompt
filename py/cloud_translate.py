"""
云翻译模块 — 调用免费/API 翻译服务，补充本地翻译不足
"""
import json
import re
import time
import os
import sqlite3
import threading

import requests
from requests.adapters import HTTPAdapter

# 全局 session — 屏蔽系统代理，直连（DeepSeek/百度无需梯子）
_session = requests.Session()
_session.trust_env = False
# Google 免费接口在国内通常要走系统代理，单独开一个会话
_session_google = requests.Session()

# ── 翻译结果本地缓存（只缓存 tag 格式的结果，长句不缓存） ──
_CLOUD_CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cloud_translations.json")
_cloud_cache = {}
_cloud_cache_lock = threading.Lock()
_dirty = False

def _load_cloud_cache():
    global _cloud_cache, _dirty
    try:
        if os.path.exists(_CLOUD_CACHE_FILE):
            with open(_CLOUD_CACHE_FILE, "r", encoding="utf-8") as f:
                _cloud_cache = json.load(f)
    except Exception:
        _cloud_cache = {}
    _dirty = False

def _save_cloud_cache():
    global _dirty
    if not _dirty:
        return
    with _cloud_cache_lock:
        try:
            with open(_CLOUD_CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(_cloud_cache, f, ensure_ascii=False, indent=2)
            _dirty = False
        except Exception:
            pass

# ── 用户手动覆盖翻译 ──
_USER_TRANS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "user_translations.json")

def load_user_translations():
    try:
        if os.path.exists(_USER_TRANS_FILE):
            with open(_USER_TRANS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {}

def save_user_translation(tag, cn):
    data = load_user_translations()
    data[tag] = cn
    try:
        with open(_USER_TRANS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False

def clear_cloud_cache():
    """删除云端翻译缓存文件"""
    global _cloud_cache
    with _cloud_cache_lock:
        _cloud_cache = {}
    try:
        if os.path.exists(_CLOUD_CACHE_FILE):
            os.remove(_CLOUD_CACHE_FILE)
        return True
    except Exception:
        return False

# ── tag 判定 — 只有这些才算 tag，值得缓存 ──
_TAG_RE = re.compile(r'^[a-z][a-z0-9]*(_[a-z][a-z0-9]*)*$')
_SENTENCE_RE = re.compile(r'\s|[\u4e00-\u9fff]|[A-Z]{2,}|[.,!?;:]')

def is_tag(text):
    """判断是否像 tag（允许 artist/@ 等特殊格式）"""
    text = text.strip()
    if not text:
        return False
    if len(text) > 200:  # 长句不缓存
        return False
    if "\n" in text:
        return False
    # 只要有下划线且不含中文/全角标点，就当 tag 缓存
    if "_" in text:
        if re.search(r'[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]', text):
            return False
        return True
    # 纯英文单词也缓存
    if re.match(r'^[a-zA-Z][a-zA-Z0-9_\-\.\'@()/]*$', text) and " " not in text:
        return True
    return False

import hashlib
import random

_BAIDU_NMT_URL = "https://fanyi-api.baidu.com/api/trans/vip/translate"
_BAIDU_LLM_URL = "https://fanyi-api.baidu.com/ait/api/aiTextTranslate"
_BAIDU_RETRY = {54003, 52001, 52002, 54005}
_BAIDU_FATAL = {52003, 54001, 54004, 58002}
_baidu_lock = threading.Lock()
_baidu_next = 0.0


def _chunk_texts(texts, max_items, max_chars):
    """按条数和字符数切批。含换行的整段单独成批，避免和别的标签粘在一起。"""
    batch = []
    size = 0
    for raw in texts:
        text = raw if isinstance(raw, str) else str(raw)
        if not text:
            continue
        if "\n" in text or len(text) > max_chars:
            if batch:
                yield batch
                batch = []
                size = 0
            yield [text]
            continue
        extra = len(text) + (1 if batch else 0)
        if batch and (len(batch) >= max_items or size + extra > max_chars):
            yield batch
            batch = [text]
            size = len(text)
        else:
            batch.append(text)
            size += extra
    if batch:
        yield batch


def _baidu_pace():
    """标准版默认 1 QPS。连发时后面的请求会直接失败，表现就是只译出开头几条。"""
    global _baidu_next
    with _baidu_lock:
        now = time.monotonic()
        wait = _baidu_next - now
        if wait > 0:
            time.sleep(wait)
        _baidu_next = time.monotonic() + 1.05


def _baidu_apply_rows(items, rows):
    rows = rows or []
    if len(items) == 1:
        parts = []
        for row in rows:
            dst = (row.get("dst") or "").strip()
            if dst:
                parts.append(dst)
        if parts:
            return {items[0]: "\n".join(parts)}
        return {}
    mapped = {}
    if len(rows) == len(items):
        for src, row in zip(items, rows):
            dst = (row.get("dst") or "").strip()
            if dst:
                mapped[src] = dst
        if len(mapped) == len(items):
            return mapped
    by_src = {}
    for row in rows:
        src = row.get("src")
        dst = (row.get("dst") or "").strip()
        if src and dst:
            by_src[src] = dst
    for src in items:
        if src in by_src:
            mapped[src] = by_src[src]
    return mapped


def _baidu_request(q, appid, secret, from_lang, to_lang, llm, bearer=""):
    headers = None
    as_json = False
    if llm and bearer:
        payload = {
            "q": q,
            "from": from_lang,
            "to": to_lang,
            "appid": appid,
            "model_type": "llm",
        }
        headers = {"Authorization": "Bearer " + bearer, "Content-Type": "application/json"}
        url = _BAIDU_LLM_URL
        as_json = True
    else:
        salt = str(random.randint(32768, 65536))
        sign = hashlib.md5((appid + q + salt + secret).encode("utf-8")).hexdigest()
        payload = {
            "q": q,
            "from": from_lang,
            "to": to_lang,
            "appid": appid,
            "salt": salt,
            "sign": sign,
        }
        url = _BAIDU_LLM_URL if llm else _BAIDU_NMT_URL
        if llm:
            payload["model_type"] = "llm"
    last = None
    for attempt in range(3):
        _baidu_pace()
        try:
            if as_json:
                resp = _session.post(url, json=payload, headers=headers, timeout=20)
            else:
                resp = _session.post(url, data=payload, timeout=20)
            data = resp.json()
        except Exception as e:
            print(f"[Anima] 百度翻译请求失败: {e}")
            return None
        if not isinstance(data, dict):
            return None
        code = data.get("error_code")
        try:
            code_n = int(code) if code is not None and str(code) != "" else None
        except (TypeError, ValueError):
            code_n = None
        if code_n in _BAIDU_FATAL:
            print(f"[Anima] 百度翻译错误 {code} {(data.get('error_msg') or '')[:160]}")
            return {"_fatal": True}
        if code_n in _BAIDU_RETRY and attempt < 2:
            last = data
            continue
        if code_n is not None and "trans_result" not in data:
            if last is None or attempt == 2:
                print(f"[Anima] 百度翻译错误 {code} {(data.get('error_msg') or '')[:160]}")
            return data
        return data
    return last


def _baidu_chunk(items, appid, secret, from_lang, to_lang, llm, bearer=""):
    if not items:
        return {}
    data = _baidu_request("\n".join(items), appid, secret, from_lang, to_lang, llm, bearer=bearer)
    if not data:
        return {}
    if data.get("_fatal"):
        return {"_fatal": True}
    return _baidu_apply_rows(items, data.get("trans_result") or [])


def _translate_baidu_many(texts, api_key, from_lang, to_lang, llm):
    if not api_key or ":" not in api_key:
        return {}
    appid, secret = api_key.split(":", 1)
    results = {}
    for chunk in _chunk_texts(texts, 20 if llm else 30, 2800 if llm else 4000):
        got = _baidu_chunk(chunk, appid, secret, from_lang, to_lang, llm)
        if got.get("_fatal") is True:
            break
        results.update(got)
        missing = [t for t in chunk if t not in got]
        if missing and len(chunk) > 1:
            for text in missing:
                one = _baidu_chunk([text], appid, secret, from_lang, to_lang, llm)
                if one.get("_fatal") is True:
                    return results
                results.update(one)
    return results


# ── 百度翻译（免费，需 APP ID + 密钥） ──
def translate_via_baidu(texts, api_key, from_lang="en", to_lang="zh"):
    """
    调用百度翻译 API
    api_key 格式: appid:secret
    """
    return _translate_baidu_many(texts, api_key, from_lang, to_lang, False)


# ── 百度大模型翻译（同 key，质量更高；失败由上层回退通用翻译） ──
def _translate_baidu_bearer(texts, appid, api_key, from_lang, to_lang):
    results = {}
    for chunk in _chunk_texts(texts, 20, 2800):
        got = _baidu_chunk(chunk, appid, "", from_lang, to_lang, True, bearer=api_key)
        if got.get("_fatal") is True:
            break
        results.update(got)
        missing = [t for t in chunk if t not in got]
        if missing and len(chunk) > 1:
            for text in missing:
                one = _baidu_chunk([text], appid, "", from_lang, to_lang, True, bearer=api_key)
                if one.get("_fatal") is True:
                    return results
                results.update(one)
    return results


def translate_via_baidu_llm(texts, api_key, from_lang="en", to_lang="zh", appid=""):
    """
    百度大模型文本翻译。
    新接口：api_key 是 API Key 管理里的 Key，appid 单独传，走 Bearer。
    旧接口：api_key 仍是 appid:secret，走签名。
    """
    api_key = (api_key or "").strip()
    appid = (appid or "").strip()
    if api_key and ":" in api_key:
        return _translate_baidu_many(texts, api_key, from_lang, to_lang, True)
    if not api_key or not appid:
        print("[Anima] 百度大模型翻译缺少 API Key 或 APP ID")
        return {}
    return _translate_baidu_bearer(texts, appid, api_key, from_lang, to_lang)

def _google_fetch(text, from_lang, to_lang, session):
    url = "https://translate.googleapis.com/translate_a/single"
    params = {
        "client": "gtx",
        "sl": "zh-CN" if from_lang == "zh" else from_lang,
        "tl": "zh-CN" if to_lang == "zh" else to_lang,
        "dt": "t",
        "q": text,
    }
    try:
        resp = session.get(url, params=params, timeout=15,
                            headers={"User-Agent": "ComfyUI-DanbooruAnima/1.0"})
        if resp.status_code != 200:
            return ""
        data = resp.json()
        translated = ""
        for block in data[0]:
            if block and block[0]:
                translated += block[0]
        return translated.strip()
    except Exception:
        return ""


def _google_one(text, from_lang, to_lang):
    # 先走系统代理（国内直连 Google 经常只成功前几条），失败再直连
    got = _google_fetch(text, from_lang, to_lang, _session_google)
    if got:
        return got
    return _google_fetch(text, from_lang, to_lang, _session)


# ── Google 翻译（免费，无需 API key） ──
def translate_via_google(texts, from_lang="en", to_lang="zh"):
    """
    调用 Google 翻译免费接口
    返回 {text: chinese_translation}
    """
    results = {}
    strikes = 0
    for chunk in _chunk_texts(texts, 12, 1000):
        if strikes >= 2:
            break
        if len(chunk) == 1:
            got = _google_one(chunk[0], from_lang, to_lang)
            if not got:
                time.sleep(0.35)
                got = _google_one(chunk[0], from_lang, to_lang)
            if got:
                results[chunk[0]] = got
                strikes = 0
            else:
                strikes += 1
            continue
        got = _google_one("\n".join(chunk), from_lang, to_lang)
        parts = [p.strip() for p in got.split("\n")] if got else []
        if len(parts) == len(chunk) and all(parts):
            for src, dst in zip(chunk, parts):
                results[src] = dst
            strikes = 0
            continue
        for text in chunk:
            if strikes >= 2:
                break
            one = _google_one(text, from_lang, to_lang)
            if not one:
                time.sleep(0.25)
                one = _google_one(text, from_lang, to_lang)
            if one:
                results[text] = one
                strikes = 0
            else:
                strikes += 1
    return results


def _norm_trans_key(s):
    s = (s or "").strip().strip('"').strip("'").strip("`")
    s = re.sub(r"^[\-\*]+\s*", "", s)
    s = re.sub(r"^\d+[\.\)、]\s*", "", s)
    s = s.replace("\\(", "(").replace("\\)", ")").replace("\\[", "[").replace("\\]", "]")
    s = re.sub(r"\s+", " ", s).strip()
    return s.replace(" ", "_").lower()


def align_translation_keys(requested, parsed):
    """把模型返回的键对齐回请求原文。模型常改大小写、空格或加上行号。"""
    parsed = parsed or {}
    buckets = {}
    for k, v in parsed.items():
        if not isinstance(v, str):
            continue
        v = v.strip()
        if not k or not v:
            continue
        buckets.setdefault(k, v)
        buckets.setdefault(_norm_trans_key(k), v)
    out = {}
    for t in requested:
        raw = parsed.get(t)
        if isinstance(raw, str) and raw.strip():
            out[t] = raw.strip()
            continue
        n = _norm_trans_key(t)
        if n in buckets:
            out[t] = buckets[n]
    return out


def _strip_fence(content):
    content = (content or "").strip()
    content = re.sub(r"^```[a-zA-Z]*\s*", "", content)
    content = re.sub(r"\s*```$", "", content)
    return content.strip()


def _split_trans_line(line):
    for sep in ("=", "＝", "→", "->"):
        if sep in line:
            left, right = line.split(sep, 1)
            left, right = left.strip(), right.strip()
            if left and right:
                return left, right
    return None, None


def _parse_llm_content(content, texts, sentence_mode):
    content = _strip_fence(content)
    if not content:
        return {}
    if sentence_mode and len(texts) == 1:
        return {texts[0]: content}
    lines = []
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("```"):
            continue
        lines.append(line)
    parsed = {}
    sep_n = 0
    for line in lines:
        src, dst = _split_trans_line(line)
        if src and dst:
            sep_n += 1
            parsed[src] = dst
    if sep_n == 0 and lines and len(lines) == len(texts):
        for src, line in zip(texts, lines):
            parsed[src] = line
    elif len(texts) == 1:
        parsed[texts[0]] = content
    return align_translation_keys(texts, parsed)


def _llm_once(texts, base_url, model, api_key, system_prompt, from_lang, to_lang, sentence_mode):
    if not texts or not base_url or not model or not api_key:
        return {}
    if not system_prompt:
        system_prompt = (
            f"你是一个翻译器。请将以下{from_lang}逐行翻译成{to_lang}。"
            "每行格式：原文=译文。绝不合并多行。只输出翻译结果，不要加任何解释。"
        )
    if sentence_mode:
        prompt = f"将以下{from_lang}翻译成{to_lang}。只输出译文，不要解释：\n" + "\n".join(texts)
    else:
        prompt = (
            f"将以下{from_lang}逐行翻译为{to_lang}（严格每行格式：原文=译文，不得跳过）：\n"
            + "\n".join(texts) + "\n"
        )
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "ComfyUI-DanbooruAnima/1.0",
    }
    budget = min(8192, max(1024, int(sum(len(t) for t in texts) * 3) + 256))
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.1,
        "max_tokens": budget,
    }
    try:
        resp = _session.post(f"{base_url.rstrip('/')}/chat/completions",
                             headers=headers, json=payload, timeout=60)
        if resp.status_code != 200:
            print(f"[Anima] LLM翻译失败 status={resp.status_code} body={resp.text[:300]}")
            return {}
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        return _parse_llm_content(content, texts, sentence_mode)
    except Exception as e:
        print(f"[Anima] LLM翻译异常: {e}")
        return {}


# ── LLM 翻译（OpenAI 兼容接口） ──
def translate_via_llm(texts, base_url, model, api_key, system_prompt=None, from_lang="en", to_lang="zh"):
    """
    通过 OpenAI 兼容 API 调大模型翻译。
    长列表拆开请求，避免 max_tokens 把后半段截掉。
    """
    texts = [t for t in (texts or []) if t]
    if not texts:
        return {}
    sentence_mode = system_prompt is not None
    step = 8 if sentence_mode else 20
    if len(texts) > step:
        merged = {}
        for i in range(0, len(texts), step):
            merged.update(translate_via_llm(texts[i:i + step], base_url, model, api_key, system_prompt, from_lang, to_lang))
        return merged
    got = _llm_once(texts, base_url, model, api_key, system_prompt, from_lang, to_lang, sentence_mode)
    missing = [t for t in texts if t not in got]
    if missing and len(missing) < len(texts):
        got.update(_llm_once(missing, base_url, model, api_key, system_prompt, from_lang, to_lang, sentence_mode))
    return got

# ── 微软翻译（Azure 免费层，国内可直连） ──
def translate_via_microsoft(texts, api_key=None, from_lang="en", to_lang="zh"):
    """
    调用 Azure Microsoft Translator API
    免费层: 2M 字符/月
    """
    if not api_key:
        return {}
    def _ms_lang(code):
        if code in ("zh", "zh-CN", "zh-Hans"):
            return "zh-Hans"
        return code or "en"
    results = {}
    url = "https://api.cognitive.microsofttranslator.com/translate"
    params = {"api-version": "3.0", "from": _ms_lang(from_lang), "to": _ms_lang(to_lang)}
    headers = {
        "Ocp-Apim-Subscription-Key": api_key,
        "Ocp-Apim-Subscription-Region": "global",
        "Content-Type": "application/json",
        "User-Agent": "ComfyUI-DanbooruAnima/1.0",
    }
    for chunk in _chunk_texts(texts, 40, 4000):
        try:
            body = [{"Text": t} for t in chunk]
            resp = _session.post(url, params=params, headers=headers, json=body, timeout=20)
            if resp.status_code != 200:
                continue
            data = resp.json()
            if not isinstance(data, list):
                continue
            for src, item in zip(chunk, data):
                translated = (((item or {}).get("translations") or [{}])[0].get("text") or "").strip()
                if translated:
                    results[src] = translated
        except Exception:
            pass
    return results

# ── 加载缓存 ──
_load_cloud_cache()

# ── 统一翻译入口 ──
def list_llm_models(base_url, api_key):
    """OpenAI 兼容的 GET {base}/models。DeepSeek 官方和中转站都走这一份。"""
    base = (base_url or "").strip().rstrip("/")
    key = (api_key or "").strip()
    if not base or not key:
        return None, "请先填写地址和 API Key"
    if not (base.startswith("https://") or base.startswith("http://")):
        return None, "地址需要以 http:// 或 https:// 开头"
    urls = [base + "/models"]
    if base.endswith("/v1"):
        urls.append(base[:-3].rstrip("/") + "/models")
    last_status = 0
    for url in urls:
        try:
            resp = _session.get(url, headers={"Authorization": "Bearer " + key}, timeout=20)
        except Exception as e:
            print(f"[Anima] 获取模型列表失败: {e}")
            return None, "请求失败，请检查地址能不能从这台电脑访问"
        last_status = resp.status_code
        if resp.status_code != 200:
            continue
        try:
            data = resp.json()
        except Exception:
            return None, "返回的不是模型列表"
        rows = data.get("data") if isinstance(data, dict) else None
        if not isinstance(rows, list):
            continue
        models = []
        seen = set()
        for item in rows:
            if not isinstance(item, dict):
                continue
            mid = str(item.get("id") or "").strip()
            if not mid or mid in seen:
                continue
            seen.add(mid)
            name = str(item.get("name") or mid).strip() or mid
            models.append({"id": mid, "name": name})
        if models:
            return models, ""
    if last_status and last_status != 200:
        return None, "获取失败 HTTP " + str(last_status)
    return None, "这个地址没有返回模型列表"


def cloud_translate(tags, provider="google", api_key=None, model=None, base_url=None, as_sentence=False, from_lang="en", to_lang="zh", baidu_appid=None):
    """
    批量云翻译。返回 {tag: chinese}。
    只对本地无翻译的 tag 发请求；结果如需缓存则写缓存。
    """
    if not tags:
        return {}

    def _cache_key(text):
        # 英→中沿用旧缓存键。其它方向单独记，避免中译英读到以前的英译中。
        if (from_lang or "en") == "en" and (to_lang or "zh") == "zh":
            return text
        return f"{from_lang}>{to_lang}:{text}"

    # 已缓存的直接返回
    results = {}
    to_translate = []
    for t in tags:
        ck = _cache_key(t)
        cached = _cloud_cache.get(ck) if isinstance(_cloud_cache, dict) else None
        # 旧逻辑只留了多行文本的第一段，这种缓存直接重译
        if cached and not ("\n" in t and "\n" not in str(cached)):
            results[t] = cached
        else:
            to_translate.append(t)
    
    if not to_translate:
        return results
    
    # 调云端翻译
    new_results = {}
    # 解析预设（支持 deepseek-flash, siliconflow-dsv3 等）
    from .config import MODEL_PRESETS
    preset = MODEL_PRESETS.get(provider, None)
    if preset and not model:
        model = preset.get("model", "")
    if preset and not base_url:
        base_url = preset.get("base_url", "")
    # Google 无需 model/base_url
    if provider == "google" or provider.startswith("google"):
        new_results = translate_via_google(to_translate, from_lang, to_lang)
    elif provider == "microsoft" or provider.startswith("microsoft"):
        new_results = translate_via_microsoft(to_translate, api_key, from_lang, to_lang)
    elif provider == "baidu" or provider.startswith("baidu"):
        if provider == "baidu_llm":
            new_results = translate_via_baidu_llm(to_translate, api_key, from_lang, to_lang, appid=baidu_appid or "")
            if api_key and ":" in str(api_key):
                missing = [t for t in to_translate if t not in new_results]
                if missing:
                    new_results.update(translate_via_baidu(missing, api_key, from_lang, to_lang))
        else:
            new_results = translate_via_baidu(to_translate, api_key, from_lang, to_lang)
    elif provider.startswith("deepseek"):
        if api_key:
            # 分离 tag 和句子，用不同 prompt
            _tags_only = [t for t in to_translate if is_tag(t)]
            _sentences = [t for t in to_translate if not is_tag(t)]
            sp = f"你是一个翻译器。请将以下{from_lang}翻译成{to_lang}。直接输出{to_lang}译文，不要加任何解释。" if as_sentence or _sentences else None
            if _tags_only:
                new_results.update(translate_via_llm(_tags_only, base_url, model, api_key, None, from_lang, to_lang))
            if _sentences:
                new_results.update(translate_via_llm(_sentences, base_url, model, api_key, sp or f"你是一个翻译器。请将以下{from_lang}翻译成{to_lang}。直接输出{to_lang}译文，不要加任何解释。", from_lang, to_lang))
            if not _tags_only and not _sentences:
                new_results = translate_via_llm(to_translate, base_url, model, api_key, sp, from_lang, to_lang)
    elif provider == "custom" or (model and base_url and api_key):
        _tags_only = [t for t in to_translate if is_tag(t)]
        _sentences = [t for t in to_translate if not is_tag(t)]
        sp = f"你是一个翻译器。请将以下{from_lang}翻译成{to_lang}。直接输出{to_lang}译文，不要加任何解释。" if as_sentence or _sentences else None
        if _tags_only:
            new_results.update(translate_via_llm(_tags_only, base_url, model, api_key, None, from_lang, to_lang))
        if _sentences:
            new_results.update(translate_via_llm(_sentences, base_url, model, api_key, sp or f"你是一个翻译器。请将以下{from_lang}翻译成{to_lang}。直接输出{to_lang}译文，不要加任何解释。", from_lang, to_lang))
        if not _tags_only and not _sentences:
            new_results = translate_via_llm(to_translate, base_url, model, api_key, sp, from_lang, to_lang)

    new_results = align_translation_keys(to_translate, new_results)
    if to_translate and len(new_results) < len(to_translate):
        print(f"[Anima] 云翻译未齐 {provider}: {len(new_results)}/{len(to_translate)}")

    # 缓存符合 tag 格式的结果
    global _dirty
    for t in to_translate:
        cn = new_results.get(t)
        if not cn:
            continue
        results[t] = cn
        if is_tag(t):
            with _cloud_cache_lock:
                _cloud_cache[_cache_key(t)] = cn
            _dirty = True
    
    # 异步存盘
    if _dirty:
        _save_cloud_cache()
    
    return results
