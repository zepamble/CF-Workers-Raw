# 🚀 CF-Workers-Raw：轻松访问GitHub私有仓库

🔐 这个项目允许你通过Cloudflare Workers安全地访问GitHub私有仓库中的原始文件，无需直接暴露你的GitHub令牌。

- 📁 你有一些存储在GitHub私有仓库中的重要文件
- 🔗 你想直接通过URL访问这些文件的原始内容（比如配置文件、数据文件等）
- 🛡️ 但是，你不想在URL中直接暴露你的GitHub令牌，因为这可能会被他人滥用
- 🎯 你需要为不同的路径设置不同的访问权限

💡 我们的解决方案是使用Cloudflare Workers作为中间层，它替你安全地处理身份验证，让你可以安全地访问私有文件。

> [!TIP]
> **还有 [EdgeOne Pages 版本](https://github.com/cmliu/CF-Workers-Raw/tree/EdgeOne)**

## proxy-configs 配置模板

本分支为 `zepamble/proxy-configs` 增加配置模板处理。仅当上游地址精确为 `https://raw.githubusercontent.com/zepamble/proxy-configs/main/Config.conf` 时启用。

部署到现有 `ghp.zepamble.com` Worker，保留原域名和 Secret。`GH_TOKEN` 是 GitHub 凭据，`TOKEN` 是独立的下载密钥，两者必须不同，均应在 Cloudflare 设置为 Secret。使用 TOKEN_PATH 时，保护路径须覆盖整个仓库（包括 Config.conf 和 rules/），不能只保护主配置。

1. GitHub 的 Config.conf 中，需要下载鉴权的链接使用 `?token=__DOWNLOAD_TOKEN__`；已有其他查询参数时使用 `&token=__DOWNLOAD_TOKEN__`。新增列表无需修改 Worker。
2. 部署本目录的 `_worker.js` 到 **ghp** 对应 Worker。不要覆盖公共 gh 服务。若使用 Wrangler，先核对实际 Worker 名称；仓库中的默认 name 不保证与已上线实例相同。
3. 在 Tower 的远程规则方案导入入口使用 `https://ghp.zepamble.com/https://raw.githubusercontent.com/zepamble/proxy-configs/main/Config.conf?token=你的下载密钥`。
4. Worker 验证下载密钥后读取 GitHub 模板，将查询参数值恰好为 __DOWNLOAD_TOKEN__ 的 token 占位符替换成经过 URL 编码的下载密钥。不含占位符的公共 gh 链接、普通 __DOWNLOAD_TOKEN__ 文字不变；规则列表原样返回。只在受信任的下载地址中使用此占位符，因为替换后的地址将携带下载密钥。
5. 后续只维护 GitHub 模板和规则文件，不需要 Config.local.conf。修改策略组等主配置结构后，需要让 Tower 重新读取/导入主方案；刷新规则列表不等于更新主方案。

若 Tower 当前导入流程不保留远程来源更新能力，可用上述地址下载已填好 Token 的文本，再粘贴到手动编辑器，无需本地替换。

成功的文件响应带 `Cache-Control: private, no-store`，模板响应去除旧 ETag、长度和编码等上游元数据。GitHub 凭据仅用于上游请求，不写入返回配置。返回内容及客户端导出文件仍含下载密钥，不要提交仓库或公开分享；不要记录完整请求 URL。启用 GH_TOKEN + TOKEN 时，缺失或错误的下载密钥直接拒绝，不再尝试将其作为 GitHub 凭据使用。

本地验证：`node --test worker.test.mjs`，使用模拟请求和测试凭据，不连接真实 GitHub，也不部署。安全复核范围为下载 URL、入口鉴权、GitHub Secret 和返回文件；没有新增依赖或存储。当前仅完成本地测试，部署后仍需验证无 Token 拒绝、正确 Token 返回配置、四份列表可下载及 Tower 实际导入。

## 📖 如何使用？ [📺 视频教程](https://www.youtube.com/watch?v=T-bK5o96lqI)

假设你的Cloudflare Workers项目部署在`raw.090227.xyz`，而你要访问的私有文件是`https://raw.githubusercontent.com/cmliu/CF-Workers-Raw/main/_worker.js`。

## 🔑 方法1：通过URL参数传递令牌
最直接的方法是在URL中添加你的GitHub令牌作为参数：
```url
https://raw.090227.xyz/cmliu/CF-Workers-Raw/main/_worker.js?token=你的GitHub令牌
```
或者，如果你喜欢完整的原始URL：
```url
https://raw.090227.xyz/https://raw.githubusercontent.com/cmliu/CF-Workers-Raw/main/_worker.js?token=你的GitHub令牌
```

## 🌐 方法2：在Workers中设置全局令牌
如果你经常访问同一个私有仓库，可以在Workers设置中添加一个名为`GH_TOKEN`的变量，值为你的GitHub令牌。这样，你就可以直接访问，无需在URL中每次都包含令牌：
```url
https://raw.090227.xyz/cmliu/CF-Workers-Raw/main/_worker.js
```
或者，如果你喜欢完整的原始URL：
```url
https://raw.090227.xyz/https://raw.githubusercontent.com/cmliu/CF-Workers-Raw/main/_worker.js
```

## 🔒 方法3：添加额外的访问控制（推荐）
为了更高的安全性，你可以设置两个变量：

- `GH_TOKEN`：你的GitHub令牌
- `TOKEN`：一个自定义的访问密钥（比如mysecretkey）

然后，你的URL会是这样的：
```url
https://raw.090227.xyz/cmliu/CF-Workers-Raw/main/_worker.js?token=mysecretkey
```
或者，如果你喜欢完整的原始URL：
```url
https://raw.090227.xyz/https://raw.githubusercontent.com/cmliu/CF-Workers-Raw/main/_worker.js?token=mysecretkey
```
这种方法提供了双重安全：即使有人猜到了你的自定义密钥，他们仍然无法访问你的GitHub文件，因为GitHub令牌是安全地存储在Workers设置中的。

## 🎯 方法4：路径专用令牌控制（✨ 新功能！）
为了实现更细粒度的访问控制，你可以为不同的路径设置专用的访问令牌：

设置 `TOKEN_PATH` 变量，格式为：`专用令牌@路径`，多个路径用逗号分隔：
```
TOKEN_PATH="123456@sh,abcdef@admin,xyz789@private"
```

使用方式：
```url
https://raw.090227.xyz/sh/script.py?token=123456
https://raw.090227.xyz/admin/config.json?token=abcdef
https://raw.090227.xyz/private/data.txt?token=xyz789
```

🛡️ **安全特性**：
- ✅ 每个路径都有独立的访问令牌
- ✅ 令牌验证成功后自动使用 `GH_TOKEN` 访问GitHub
- ✅ 防止大小写绕过（路径自动转换为小写比较）
- ✅ 防止URL编码绕过（自动解码）
- ✅ 精确路径匹配，防止部分匹配绕过

## 🔍 方法5：隐藏GitHub路径信息

为了更高的隐私性，你可以设置多个变量来隐藏真实的GitHub路径：

- 🧑‍💻 `GH_NAME`：你的GitHub用户名（例如: **cmliu**）
```url
https://raw.090227.xyz/CF-Workers-Raw/main/_worker.js?token=sd123123
```

- 📦 `GH_REPO`：你的GitHub仓库名（例如: **CF-Workers-Raw**，必须设置`GH_NAME`变量为前提）
```url
https://raw.090227.xyz/main/_worker.js?token=sd123123
```

- 🌿 `GH_BRANCH`：你的GitHub分支名（例如: **main**，必须设置`GH_NAME`和`GH_REPO`变量为前提）
```url
https://raw.090227.xyz/_worker.js?token=sd123123
```

⚠️ **注意**：如您使用完整的原始URL，则以上变量将不会生效！
```url
https://raw.090227.xyz/https://raw.githubusercontent.com/cmliu/CF-Workers-Raw/main/_worker.js?token=sd123123
```

## ⚙️ 如何设置这些变量？

在你的Cloudflare Workers管理面板中：

1. 🏠 进入你的Workers项目
2. ⚙️ 点击**设置**标签
3. 📋 滚动到**环境变量**部分
4. ➕ 添加以下变量：
   - 🔑 变量：GH_TOKEN，值：你的GitHub个人访问令牌
   - 🔐 变量：TOKEN（可选），值：你的自定义访问密钥
   - 🎯 变量：TOKEN_PATH（可选），值：路径专用令牌配置（格式：`令牌@路径`）
     
💡 GitHub个人访问令牌可以在GitHub设置中的"Developer settings" > "Personal access tokens (classic)"页面生成。

## ❌ 错误处理

如果出现问题，你会看到以下错误消息之一：

- 🚫 **TOKEN错误**：你提供的访问密钥不正确
- ⚠️ **TOKEN不能为空**：需要提供GitHub令牌
- 📂 **无法获取文件，检查路径或TOKEN是否正确**：文件路径错误或令牌无权访问该文件
- 🔧 **服务器GitHub TOKEN配置错误**：服务器端GitHub令牌未正确配置

# 📊 变量说明

| 变量名 | 示例 | 必填 | 备注 | 
|--|--|--|--|
| GH_TOKEN| `ghp_CgmlL2b5J8Z1soNUquc0bZblkbO3gKxhn13t`| ❌| 您的GitHub令牌 **token**|
| TOKEN| `nicaibudaowo` | ❌| `GH_TOKEN`和`TOKEN`同时存在的时候会作为访问鉴权，单独赋值时的效果与`GH_TOKEN`相同|
| TOKEN_PATH| `sh@123456`,`admin@abcdef` | ❌| 路径专用令牌，格式为`路径@令牌`，多个配置用`换行符`分隔|
| GH_NAME| `cmliu` | ❌| 你的GitHub用户名 |
| GH_REPO| `CF-Workers-Raw` | ❌| 你的GitHub仓库(必须设置`GH_NAME`变量为前提) |
| GH_BRANCH| `main` | ❌| 你的GitHub分支(必须设置`GH_NAME`和`GH_REPO`变量为前提) |
| URL302 | `https://t.me/CMLiussss` |❌| 主页302跳转 |
| URL | `https://github.com/cmliu/CF-Workers-Raw/blob/main/README.md` |❌| 主页伪装 |
| ERROR | `无法获取文件，检查路径或TOKEN是否正确。` |❌| 自定义错误提示 |

## 🎯 TOKEN_PATH 详细说明

TOKEN_PATH 是一个强大的新功能，允许你为不同的路径设置专用的访问令牌：

### 📝 配置格式
```
TOKEN_PATH="令牌1@路径1,令牌2@路径2,令牌3@路径3"
```

### 💡 使用示例
配置：
```
TOKEN_PATH="123456@sh,abcdef@admin,xyz789@private"
GH_TOKEN="ghp_your_github_token"
```

访问方式：
- ✅ `/sh/script.py?token=123456` - 使用专用令牌123456访问sh路径
- ✅ `/admin/config?token=abcdef` - 使用专用令牌abcdef访问admin路径
- ✅ `/private/data?token=xyz789` - 使用专用令牌xyz789访问private路径
- ❌ `/sh/script.py?token=wrong` - TOKEN错误
- ❌ `/sh/script.py` - TOKEN不能为空

### 🛡️ 安全特性
- 🔒 **令牌隔离**：用户访问令牌与GitHub API令牌完全分离
- 🎯 **路径精确匹配**：防止路径注入和绕过攻击
- 📝 **大小写不敏感**：自动处理大小写问题
- 🔓 **URL解码**：自动处理编码绕过尝试
- ⚡ **自动切换**：验证成功后自动使用GH_TOKEN访问GitHub

# 🙏 感谢
我自己的脑洞、ChatGPT
