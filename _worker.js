export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname !== '/') {
			let githubRawUrl = 'https://raw.githubusercontent.com';
			if (new RegExp(githubRawUrl, 'i').test(url.pathname)) {
				githubRawUrl += url.pathname.split(githubRawUrl)[1];
			} else {
				if (env.GH_NAME) {
					githubRawUrl += '/' + env.GH_NAME;
					if (env.GH_REPO) {
						githubRawUrl += '/' + env.GH_REPO;
						if (env.GH_BRANCH) githubRawUrl += '/' + env.GH_BRANCH;
					}
				}
				githubRawUrl += url.pathname;
			}
			//console.log(githubRawUrl);
			
			// 初始化请求头
			const headers = new Headers();
			let authTokenSet = false; // 标记是否已经设置了认证token
			let accessToken;
			
			// 检查TOKEN_PATH特殊路径鉴权
			if (env.TOKEN_PATH) {
				const 需要鉴权的路径配置 = await ADD(env.TOKEN_PATH);
				// 将路径转换为小写进行比较，防止大小写绕过
				const normalizedPathname = decodeURIComponent(url.pathname.toLowerCase());

				//检测访问路径是否需要鉴权
				for (const pathConfig of 需要鉴权的路径配置) {
					const configParts = pathConfig.split('@');
					if (configParts.length !== 2) {
						// 如果格式不正确，跳过这个配置
						continue;
					}

					const [requiredToken, pathPart] = configParts;
					const normalizedPath = '/' + pathPart.toLowerCase().trim();

					// 精确匹配路径段，防止部分匹配绕过
					const pathMatches = normalizedPathname === normalizedPath ||
						normalizedPathname.startsWith(normalizedPath + '/');

					if (pathMatches) {
						const providedToken = url.searchParams.get('token');
						if (!providedToken) {
							return new Response('TOKEN不能为空', { status: 400 });
						}

						if (providedToken !== requiredToken.trim()) {
							return new Response('TOKEN错误', { status: 403 });
						}

						// token验证成功，使用GH_TOKEN作为GitHub请求的token
						if (!env.GH_TOKEN) {
							return new Response('服务器GitHub TOKEN配置错误', { status: 500 });
						}
						headers.append('Authorization', `token ${env.GH_TOKEN}`);
						authTokenSet = true;
						accessToken = providedToken;
						break; // 找到匹配的路径配置后退出循环
					}
				}
			}
			
			// 如果TOKEN_PATH没有设置认证，使用默认token逻辑
			if (!authTokenSet) {
				let token;
				if (env.GH_TOKEN && env.TOKEN) {
					if (env.TOKEN !== url.searchParams.get('token')) {
						return new Response('TOKEN错误', { status: 403 });
					}
					token = env.GH_TOKEN;
					accessToken = env.TOKEN;
				} else token = url.searchParams.get('token') || env.GH_TOKEN || env.TOKEN;
				
				const githubToken = token;
				//console.log(githubToken);
				if (!githubToken || githubToken == '') {
					return new Response('TOKEN不能为空', { status: 400 });
				}
				headers.append('Authorization', `token ${githubToken}`);
			}

			// 发起请求
			let response;
			try {
				response = await fetch(githubRawUrl, { headers, redirect: 'manual' });
			} catch {
				return new Response('上游连接失败', { status: 502 });
			}

			// 检查请求是否成功 (状态码 200 到 299)
			if (response.ok) {
				const responseHeaders = new Headers(response.headers);
				responseHeaders.set('Cache-Control', 'private, no-store');
				if (githubRawUrl === 'https://raw.githubusercontent.com/zepamble/proxy-configs/main/Config.conf') {
					if (!accessToken || accessToken === env.GH_TOKEN) {
						return new Response('配置模板需要独立的下载TOKEN鉴权', { status: 500 });
					}
					let text;
					try {
						text = await response.text();
					} catch {
						return new Response('上游读取失败', { status: 502 });
					}
					text = text.replace(/([?&]token=)__DOWNLOAD_TOKEN__(?=[&,\s#]|$)/g,
						(_, parameter) => parameter + encodeURIComponent(accessToken));
					for (const name of ['Content-Length', 'Content-Encoding', 'ETag', 'Last-Modified', 'Content-MD5', 'Content-Range', 'Accept-Ranges']) {
						responseHeaders.delete(name);
					}
					responseHeaders.set('Content-Type', 'text/plain; charset=utf-8');
					return new Response(text, { status: response.status, headers: responseHeaders });
				}
				return new Response(response.body, {
					status: response.status,
					headers: responseHeaders
				});
			} else {
				const errorText = env.ERROR || '无法获取文件，检查路径或TOKEN是否正确。';
				// 如果请求不成功，返回适当的错误响应
				return new Response(errorText, { status: response.status });
			}

		} else {
			const envKey = env.URL302 ? 'URL302' : (env.URL ? 'URL' : null);
			if (envKey) {
				const URLs = await ADD(env[envKey]);
				const URL = URLs[Math.floor(Math.random() * URLs.length)];
				return envKey === 'URL302' ? Response.redirect(URL, 302) : fetch(new Request(URL, request));
			}
			//首页改成一个nginx伪装页
			return new Response(await nginx(), {
				headers: {
					'Content-Type': 'text/html; charset=UTF-8',
				},
			});
		}
	}
};

async function nginx() {
	const text = `
	<!DOCTYPE html>
	<html>
	<head>
	<title>Welcome to nginx!</title>
	<style>
		body {
			width: 35em;
			margin: 0 auto;
			font-family: Tahoma, Verdana, Arial, sans-serif;
		}
	</style>
	</head>
	<body>
	<h1>Welcome to nginx!</h1>
	<p>If you see this page, the nginx web server is successfully installed and
	working. Further configuration is required.</p>
	
	<p>For online documentation and support please refer to
	<a href="http://nginx.org/">nginx.org</a>.<br/>
	Commercial support is available at
	<a href="http://nginx.com/">nginx.com</a>.</p>
	
	<p><em>Thank you for using nginx.</em></p>
	</body>
	</html>
	`
	return text;
}

async function ADD(envadd) {
	var addtext = envadd.replace(/[	|"'\r\n]+/g, ',').replace(/,+/g, ',');	// 将空格、双引号、单引号和换行符替换为逗号
	//console.log(addtext);
	if (addtext.charAt(0) == ',') addtext = addtext.slice(1);
	if (addtext.charAt(addtext.length - 1) == ',') addtext = addtext.slice(0, addtext.length - 1);
	const add = addtext.split(',');
	//console.log(add);
	return add;
}
