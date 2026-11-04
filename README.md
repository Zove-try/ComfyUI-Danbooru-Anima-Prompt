<p align="center">
  <img src="js/icon.png" width="168" alt="Danbooru Anima Prompt">
</p>

<h1 align="center">ComfyUI-Danbooru-Anima-Prompt</h1>

<p align="center">在 ComfyUI 里翻 D 站、G 站，把标签写成 Anima、Noob、Aesthetic、NewBie 的提示词。图进 output 之后，顶栏可以打开查看器。</p>

<p align="center">两个创作器在右键菜单 <b>Anima</b>。其余节点在 <b>Danbooru Anima</b>。查看器和总设置在顶栏。总设置的按钮就是上面这枚图标。</p>

<p align="center">
  <a href="#提示词创作">提示词创作</a> ·
  <a href="#搜图和标签">搜图和标签</a> ·
  <a href="#改提示词">改提示词</a> ·
  <a href="#生成图像管理">生成图像管理</a> ·
  <a href="#分辨率和分组">分辨率和分组</a>
</p>

## 提示词创作

### 提示词创作器

自己选标签来写。选完可以在 Anima、Noob、Aesthetic 三种模式之间切换，用来控制输出标签的格式和顺序。写好的提示词接到正向提示词的 CLIP 文本编码器。

<img src="docs/ui/composer.png" alt="提示词创作器" width="720">

### NewBie 提示词创作器

按角色分开写，生成 NewBie 要的 XML。

<img src="docs/ui/newbie.png" alt="NewBie 提示词创作器" width="720">

### 随机提示词

先定角色，再自动抽一套提示词。哪一栏不喜欢，就锁住别的，只重抽这一栏。

<img src="docs/ui/random.png" alt="随机提示词" width="720">

### 提示词组合器

分类器拆开的标签能接进来，D 站、G 站浏览器给出的标签也能接进来。接进来之后合到一起，再按你选的模式，排成那个模型要的格式和顺序。模式有 Anima、Noob、CKNoob、Aesthetic。

### 画师选择

常用画师可以直接放在这个节点上，名单里的顺序能调。点中之后会进到输出栏，输出栏里的画师也能再排先后。加人的办法不止一种：从 AnimaDex 里加，从 D 站浏览器收藏过的画师里加，也可以把一串画师名用逗号贴进去，回车一次加完。

<img src="docs/ui/artist.png" alt="画师选择" width="720">

## 搜图和标签

### D站浏览器

这个浏览器的做法参考了 D 站画廊，另外做了中文模糊搜索。角色写中文名，就能对上那个角色的标签。发型、衣服这些也一样，用中文搜就行。一个词选中之后，空格再写下一项，前面已经选好的标签会留着。搜出来的是带这些标签的图。

<img src="docs/ui/db.png" alt="D站浏览器" width="720">

### G站浏览器

Gelbooru 上用同一套搜法。中文能模糊对上标签，空格接着写下一项，出来的是同时带这些标签的图。分级最后一档显示成「深度」。

<img src="docs/ui/gel.png" alt="G站浏览器" width="720">

### AnimaDex 浏览器

这里只查画师和角色，没有作品这一类。找到之后，可以把这个画师或角色的标签发到 D 站浏览器，或者发到 G 站浏览器，直接拿去搜图。

<img src="docs/ui/adex.png" alt="AnimaDex 浏览器" width="720">

### 标签分类器

一般接在本地标签反推后面。反推出来的那串标签丢进来，按角色、画师、衣服、姿势这些类拆开。

### 标签映射器

分类器没分进去的标签，在这里手动指定类别。

## 改提示词

### 文本（透传）

可以当个中转。输入模式和暂停一起开着时，前面的内容一到就会停住。你改完，点确认，才把确认过的内容交给后面的节点。也可以就在这个节点里写提示词：开内容模式，前面送进来的一律不用，只把节点里现有的内容输出去。

<img src="docs/ui/pt.png" alt="文本透传" width="720">

### 文本（模糊搜索）

大致就是透传的内容模式，而且没有暂停。拿来写标签化的提示词比较顺手，搜标签这些功能都在节点上。

<img src="docs/ui/fuzzy.png" alt="文本模糊搜索" width="720">

### 文本

和别的插件里的文本节点一样。写一段，原样输出。

### 文本联结

把多段文字接成一段。中间用什么隔开，可以换几种。

### 标签预览

配合本地词库，看标签化的提示词现在长什么样。

### tag去重

同一句里重复的标签，只留最先出现的那一次。

## 生成图像管理

### 输出提示词查看器

用来管生成出来的图，尤其是用这套工作流、按标签出的那些。可以按角色、画师、模型、标签来筛。图里的画师串也能存下来，存过的会出现在画师选择节点里，下次直接点。

<img src="docs/ui/viewer.png" alt="输出提示词查看器" width="720">

### 顶栏总设置

备份、翻译、G 站 Key、节点配色、弹窗背景都在这里。顶栏按钮就是页首那张图。

<img src="docs/ui/settings.png" alt="Anima 总设置" width="720">

## 分辨率和分组

### 分辨率选择器

选出图用的宽和高，接到空潜空间。

<img src="docs/ui/resolution.png" alt="分辨率选择器" width="480">

### 按宽高比缩放

把最长边或最短边缩到你填的像素，比例不变。

<img src="docs/ui/scale.png" alt="按宽高比缩放" width="480">

### 组忽略管理

一组节点这次不想让它干活，但后面还得接着用前面的结果，就开忽略。这组被跳过，线不断。

<img src="docs/ui/ignore.png" alt="组忽略管理" width="480">

### 组禁用管理

这组这次彻底别跑。节点不执行，结果也不往下传。后面还连着它的话，这条就接不上。

<img src="docs/ui/mute.png" alt="组禁用管理" width="480">

账号、API key 和站点登录信息只保存在本机，不要放进公开的压缩包或仓库。

## 开源协议

插件代码采用 [GNU General Public License v3.0](LICENSE)。

随包的外部词表先顶着用，来源如下。自己收集的表换上之后，这些文件会从公开包里拿掉。

- `tags_enhanced.csv`：凉宫秋月的 [DanbooruSearchOnline](https://github.com/SuzumiyaAkizuki/DanbooruSearchOnline)，同样是 GPL-3.0。
- `gelbooru_tags.csv`：来自 [DraconicDragon/Gelbooru-Tags-Full_2026-06-11](https://huggingface.co/datasets/DraconicDragon/Gelbooru-Tags-Full_2026-06-11)。只有英文标签名、分类和帖子数。
- `py/zh_cn/all_tags_cn.json`：临时使用的中文融合词表，来源包括社区既有汉化。
- `py/zh_cn/wai_characters.csv`：来自 [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery) 的角色名，该仓库为 MIT。
- `py/weilin_tags.db`：预设标签弹窗用的第三方词库。来源协议还没核对完，先随包装上，好让安装后能用这个弹窗。

## 安装

ComfyUI 管理器里搜索 **Danbooru Anima Prompt**。

或在 `ComfyUI/custom_nodes/` 下执行：

```
git clone https://github.com/Zove-try/ComfyUI-Danbooru-Anima-Prompt.git
```

也可以下载压缩包解压到 ComfyUI 的 `custom_nodes/` 目录下：

1. 下载 `ComfyUI-Danbooru-Anima-Prompt.zip`
2. 解压到 `ComfyUI/custom_nodes/` 目录
3. 确认目录结构为 `ComfyUI/custom_nodes/ComfyUI-Danbooru-Anima-Prompt/`
4. 重启 ComfyUI

> 如遇到依赖缺失，在插件目录下运行：`pip install -r requirements.txt`

## 依赖

- `requests`
- `Pillow`
- `torch`
- `numpy`

（这些通常 ComfyUI 已自带）

## 可选：E5-Small 语义搜索引擎（🧠 按钮）

Danbooru Browser 搜索栏的 🧠 按钮启用 **E5-Small 语义搜索**，输入中文/英文描述即可匹配语义相近的 Danbooru 标签（如搜"红头发女孩"命中 `red_hair` + `1girl`）。

> 需要额外安装依赖：`pip install sentence-transformers pandas safetensors`（已在 requirements.txt 中，GitHub 安装会自动装）

### 首次使用（自动下载）

点 🧠 按钮后，插件会在后台自动从 HuggingFace 下载 E5-Small 模型（~470MB），然后对所有标签预计算 embedding 缓存（~280MB），总耗时约 30 秒-1 分钟，**只在首次执行**。后续启动直接加载缓存，< 2 秒。

完成后在 ComfyUI 控制台可看到：
```
[vec_search] E5-Small 引擎初始化完成
```

### 网络不好的用户：手动下载模型

如果自动下载太慢或经常中断，可以手动下载模型后直接放入插件目录：

**步骤：**

1. 从 https://huggingface.co/intfloat/e5-small 下载模型文件
   （需要 `model.safetensors`、`config.json`、`tokenizer.json`、`modules.json` 等）

2. 放入以下目录（已存在，直接放文件就行）：

   ```
   ComfyUI/custom_nodes/ComfyUI-Danbooru-Anima-Prompt/
     py/
       models/
         e5-small/              ← 目录已有，放文件进去
           model.safetensors  ← 放入下载的文件
           config.json
           tokenizer.json
           modules.json
           ...
   ```

3. 重启 ComfyUI，控制台应输出：
   ```
   [E5-Small] 使用本地模型: ...\\py\\models\\e5-small
   ```

> 不需要建目录、不需要设环境变量，文件放对位置就行。

### 删除重建 embedding 缓存

如果 embedding 缓存损坏或想换模型版本，删除以下目录即可，插件重启后会自动重建：

```
ComfyUI-Danbooru-Anima-Prompt/py/tags_embedding/
```

### 一键安装依赖

```bash
cd ComfyUI/custom_nodes/ComfyUI-Danbooru-Anima-Prompt
pip install -r requirements.txt
```

## 可选：本地标签数据库（加速分类）

Tag Classifier 节点默认通过 Danbooru API 在线查询标签分类。
如果下载本地标签数据库，大部分标签将直接在本地查表，无需 API 请求，**速度更快、无需联网、无频率限制**。

### 下载方式

```bash
# 进入插件目录
cd ComfyUI/custom_nodes/ComfyUI-Danbooru-Anima-Prompt

# 下载 tags_enhanced.csv（来自 DanbooruSearchOnline 项目）
curl -L -o tags_enhanced.csv "https://raw.githubusercontent.com/SuzumiyaAkizuki/DanbooruSearchOnline/main/origin_database/tags_enhanced.csv"
```

或手动从 [DanbooruSearchOnline](https://github.com/SuzumiyaAkizuki/DanbooruSearchOnline/blob/main/origin_database/tags_enhanced.csv) 下载后放到插件根目录。

### 使用

下载后重启 ComfyUI，Tag Classifier 节点的「启用本地标签数据库」默认开启。本地查不到的标签会自动 fallback 到 API 查询。

如需关闭，在节点上将开关设为 `False` 即可。
