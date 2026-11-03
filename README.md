# ComfyUI-Danbooru-Anima-Prompt

ComfyUI 插件：浏览 Danbooru / Gelbooru，把标签按类别拆开，再组成 Anima、Noob、Aesthetic 或 NewBie 用的提示词。

节点在右键菜单里。多数在 **Danbooru Anima**，提示词创作器和 NewBie 提示词创作器在 **Anima**。

## 节点

### 浏览和标签

- **D站浏览器**：在节点里搜索、收藏 Danbooru 图片。输出选中的图，以及全部、质量、数量、角色、系列、画师、常规、未分类这几组标签。
- **G站浏览器**：Gelbooru 上做同样的事，输出和 D站浏览器对应。
- **AnimaDex 浏览器**：查角色、系列和画师。选中的标签可以交给 D站或 G站浏览器继续搜图。
- **标签分类器**：把一段原始标签（例如反推结果）拆成上面那些类别，通用标签再拆成身体、服装、姿势、表情、背景、配饰和其他。
- **标签映射器**：给没分上类的标签指定类别。保存后，下次分类会记住。
- **标签预览**：把流过来的标签显示在节点上。
- **tag去重**：去掉重复标签，保留原来的先后顺序。

### 写提示词

- **提示词组合器**：把已经分好类的标签，按 Anima、Noob 或 Aesthetic 的顺序拼成一条提示词。Anima 的画师标签会自动加 `@`。
- **提示词创作器**：在节点里按分类填写、点选标签，直接得到一条提示词。
- **NewBie 提示词创作器**：按 NewBie 的多角色结构写提示词。
- **随机提示词**：按选定角色和服装、姿势、表情等维度抽一条提示词，可以锁定某一次的结果。
- **画师选择**：点选常用画师或画师组合，输出画师标签。
- **文本**：一段可编辑的文字，原样输出。
- **文本联结**：把最多六段文字按所选分隔符接起来。
- **文本（模糊搜索）**：带标签联想的文本框，输出编辑后的文字。
- **文本（透传）**：在上游输入和节点里写的内容之间切换。运行到这里可以先暂停，改完再继续。

### 画布工具

- **Anima 分辨率选择器**：从 Anima 常用尺寸里选一个，或自己填宽高，输出宽度和高度。
- **Anima：按宽高比缩放**：把图像缩到目标比例，可以补边、裁剪或拉伸。
- **组忽略管理**：在画布上开关分组的忽略状态，并设置组与组之间的联动。每个组的联动里可以接一个布尔值。
- **组禁用管理**：同样的列表，关闭时是禁用（不执行），不是忽略（把线接过去）。布尔联动和组忽略管理一样。

## 不在节点菜单里的功能

- **输出提示词查看器**：从顶栏打开，浏览输出目录里的图和对应提示词，可以收藏、评分、删除。
- **总设置**：更换主题色、透明度和背景。换主题后，插件里的弹窗会跟着变。

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
