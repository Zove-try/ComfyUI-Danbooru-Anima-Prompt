# BGE-M3 模型目录

将 BGE-M3 模型文件放到此目录即可让插件离线加载，无需在线下载。

## 下载地址

https://huggingface.co/BAAI/bge-m3

## 需要的文件

- `model.safetensors`（或 `pytorch_model.bin`）
- `config.json`
- `tokenizer.json`
- `tokenizer_config.json`
- `modules.json`
- `special_tokens_map.json`

## 验证

放好后目录结构应如下：

```
py/models/bge-m3/
├── README.md            ← 这个文件
├── model.safetensors    ← 你下载的
├── config.json
├── tokenizer.json
├── modules.json
└── ...
```

重启 ComfyUI，控制台输出 `[BGE-M3] 使用本地模型` 即表示加载成功。
