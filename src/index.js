import { Router } from 'itty-router';
import { customAlphabet } from 'nanoid';
import * as pageBuilder from './htmlBuilder.js';

// 使用不易混淆的字符集
const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);

const router = Router();

// 首页
router.get('/', () => {
	const html = pageBuilder.getHomepage();
	return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
});

// 处理创建请求
router.post('/', async (request, env) => {
  const url = new URL(request.url);
	const formData = await request.formData();
	const targetUrl = formData.get('url');
	const visitsInput = formData.get('visits');
	const noExpire = formData.get('no_expire') === 'on';

	let parsedTargetUrl;
	try {
    parsedTargetUrl = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsedTargetUrl.protocol)) {
      return errorResponse('只支持 HTTP/HTTPS 协议的 URL。', 400);
    }
    if (parsedTargetUrl.hostname === url.hostname) {
      return errorResponse('不允许创建指向本站的循环链接。', 400);
    }
	} catch (e) {
    return errorResponse('提交的 URL 格式不正确，请返回重试。', 400);
	}

  let maxVisits;
	if (!visitsInput) {
		// 如果输入为空，则视为不限制次数
		maxVisits = -1;
	} else {
    // 使用正则表达式测试输入是否为纯数字
    if (!/^\d+$/.test(visitsInput)) {
      return errorResponse('访问次数必须是 1 到 99 之间的数字，或留空不填。', 400);
    }

		const parsedVisits = parseInt(visitsInput, 10);
		// 校验：必须是数字，且在 1-99 范围内
		if (isNaN(parsedVisits) || parsedVisits < 1 || parsedVisits > 99) {
			return errorResponse('访问次数必须是 1 到 99 之间的数字，或留空不填。', 400);
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

	return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
});

// 处理跳转请求
router.get('/:id', async ({ params }, env) => {
	const id = params.id;
	const dataStr = await env.KV.get(id);

	if (!dataStr) {
		return errorResponse("此链接不存在或已被销毁。", 404);
	}

	let data;
  try {
    data = JSON.parse(dataStr);
  } catch (e) {
    // 数据损坏
    await env.KV.delete(id); 
    return errorResponse("此链接数据已损坏。", 410);
  }

	if (data.remainingVisits !== -1) {
		if (data.remainingVisits <= 0) {
			await env.KV.delete(id);
			return errorResponse("此链接的访问次数已用尽。", 410);
		}

		if (data.remainingVisits === 1) {
			await env.KV.delete(id);
		} else {
			data.remainingVisits--;
			await env.KV.put(id, JSON.stringify(data));
		}
	}

	return Response.redirect(data.url, 302);
});

// 404 页面
router.all('*', () => new Response('404, Not Found.', { status: 404 }));

// 错误响应函数
function errorResponse(message, status = 404) {
    const html = pageBuilder.getErrorPage(message);
    return new Response(html, { status, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

export default {
  async fetch(request, env) {
		if (!env.KV) {
      return errorResponse('服务配置错误：KV 命名空间未绑定。', 500);
		}
		return router.fetch(request, env);
	}
};