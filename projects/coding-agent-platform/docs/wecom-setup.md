# 企微文档同步配置

智工台通过**企业微信微盘 API**拉取「你有权限、且应用可见」的空间文件。

## 你需要准备

1. 企微管理后台 → 应用管理 → 自建应用  
2. 开通 **微盘** 权限，并把应用加到微盘「可调用应用」  
3. 记下：
   - `corpId`（企业 ID）
   - `corpSecret`（该应用 Secret）
   - `spaceId`（微盘空间 ID，可多个）——必须是你账号有权限的空间

也可在页面「文档」页填写并保存（写入 `.cap-data/wecom-config.json`）。

## 环境变量（可选）

```bash
export WECOM_CORP_ID=wwxxxx
export WECOM_CORP_SECRET=xxxx
export WECOM_SPACE_IDS=spaceid1,spaceid2
export WECOM_USERID=your_userid   # 可选
```

## 行为说明

| 类型 | 同步结果 |
|---|---|
| 普通文件 | 尝试 `wedrive/file_download` 拉正文 |
| 微文档/表格 | 同步标题、fileid、访问 url；正文需在企微打开编辑后可粘贴到本地文档 |

「我有权限」= 企微侧 ACL + 你只配置自己能访问的 `spaceId`。平台不会越权扫全公司文档。

官方参考：
- [获取 access_token](https://developer.work.weixin.qq.com/document/path/91039)
- [获取文件列表](https://developer.work.weixin.qq.com/document/path/93657)
