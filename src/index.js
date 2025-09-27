import { Router } from 'itty-router';
import { customAlphabet } from 'nanoid';
import * as pageBuilder from './features/htmlBuilder.js';
import { ResponseBuilder } from './features/response.js';
import { blockBots } from './features/botBlocker.js';

// 使用不易混淆的字符集
const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);

const router = Router();

// 阻断爬虫
router.all('*', blockBots);

// robots.txt
router.get('/robots.txt', () => {
  const robotsTxt = `User-agent: *\nDisallow: /`;
  return new Response(robotsTxt, {
    headers: { 'Content-Type': 'text/plain' },
  });
});

// 首页
router.get('/', (request, env) => {
	const response = new ResponseBuilder(request, env);
	const html = pageBuilder.getHomepage();
	return response.html(html);
});

// 处理创建请求
router.post('/', async (request, env) => {
  const response = new ResponseBuilder(request, env);
  const url = new URL(request.url);
	const referer = request.headers.get('Referer');

  const formData = await request.formData();
	const token = formData.get('cf-turnstile-response');
	const ip = request.headers.get('CF-Connecting-IP');

	if (!token) {
		return response.error('人机验证失败，请刷新页面重试。', 400);
	}

	try {
		const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				secret: env.TURNSTILE_SECRET_KEY,
				response: token,
				remoteip: ip,
			}),
		});

		const outcome = await turnstileResponse.json();
		if (!outcome.success) {
			console.error('Turnstile verification failed:', outcome['error-codes']?.join(', '));
			return response.error('人机验证失败，请刷新页面重试。', 403);
		}
	} catch (err) {
		console.error('Error verifying Turnstile:', e);
		return response.error('无法验证请求来源，请稍后重试。', 500);
	}

	// 如果 Referer 头存在，它必须来自同源
	if (referer) {
		try {
			const refererOrigin = new URL(referer).origin;
			if (refererOrigin !== url.origin) {
				return response.error('不允许跨站请求。', 403);
			}
		} catch (err) {
			// 如果 Referer 格式不正确，也视为无效请求
			return response.error('无效的来源页面。', 400);
		}
	}

	const targetUrl = formData.get('url');
	const visitsInput = formData.get('visits');
	const noExpire = formData.get('no_expire') === 'on';

	let parsedTargetUrl;
	try {
    parsedTargetUrl = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsedTargetUrl.protocol)) {
      return response.error('只支持 HTTP/HTTPS 协议的 URL。', 400);
    }
    if (parsedTargetUrl.hostname === url.hostname) {
      return response.error('不允许创建指向本站的循环链接。', 400);
    }
	} catch (err) {
    return response.error('提交的 URL 格式不正确，请返回重试。', 400);
	}

  let maxVisits;
	if (!visitsInput) {
		// 如果输入为空，则视为不限制次数
		maxVisits = -1;
	} else {
    // 使用正则表达式测试输入是否为纯数字
    if (!/^\d+$/.test(visitsInput)) {
      return response.error('访问次数必须是 1 到 99 之间的数字，或留空不填。', 400);
    }

		const parsedVisits = parseInt(visitsInput, 10);
		// 校验：必须是数字，且在 1-99 范围内
		if (isNaN(parsedVisits) || parsedVisits < 1 || parsedVisits > 99) {
			return response.error('访问次数必须是 1 到 99 之间的数字，或留空不填。', 400);
		}
		maxVisits = parsedVisits;
	}

  let id;
  let exists;
  do {
    id = nanoid();
    exists = await env.KV.get(id);
  } while (exists);

	const data = {
		url: targetUrl,
		remainingVisits: maxVisits,
	};

	const options = {};
	if (!noExpire) {
		options.expirationTtl = env.DEFAULT_TTL_SECONDS || 43200;
	}

	await env.KV.put(id, JSON.stringify(data), options);

	const shortUrl = `${url.origin}/${id}`;
	const html = pageBuilder.getSuccessPage(shortUrl);

	return response.html(html);
});

// 处理跳转请求
router.get('/:id', async ({ params, ...request }, env) => {
  const response = new ResponseBuilder(request, env);
	const id = params.id;
	const dataStr = await env.KV.get(id);

	if (!dataStr) {
		return response.error("此链接不存在或已被销毁。", 404);
	}

	let data;
  try {
    data = JSON.parse(dataStr);
  } catch (e) {
    // 数据损坏
    await env.KV.delete(id); 
    return response.error("此链接数据已损坏。", 410);
  }

	if (data.remainingVisits !== -1) {
		if (data.remainingVisits <= 0) {
			await env.KV.delete(id);
			return response.error("此链接的访问次数已用尽。", 410);
		}

		if (data.remainingVisits === 1) {
			await env.KV.delete(id);
		} else {
			data.remainingVisits--;
			await env.KV.put(id, JSON.stringify(data));
		}
	}

	return response.redirect(data.url, 302);
});

// 404 页面
router.all('*', (request, env) => {
	const response = new ResponseBuilder(request, env);
	return response.html('404, Not Found.', 404);
});

export default {
  async fetch(request, env) {
		if (!env.KV) {
      return errorResponse('服务配置错误：KV 命名空间未绑定。', 500);
		}
		return router.fetch(request, env);
	}
};