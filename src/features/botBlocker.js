import { ResponseBuilder } from './response.js';

// 常见搜索引擎爬虫的 User-Agent 标识 (不区分大小写)
// 列表可以根据需要扩展
const BOT_UA_PATTERNS = new RegExp([
  'googlebot',
  'bingbot',
  'slurp',      // Yahoo
  'duckduckgobot',
  'baiduspider',
  'yandexbot',
  'sogou',
  'exabot',
  'facebook',
  'twitterbot',
  'linkedinbot',
  'pinterest',
  'slackbot',
  'telegrambot',
  'discordbot',
  'AhrefsBot',
  'GPTBot',
  'ChatGPT-User',
  'ClaudeBot',
  'PerplexityBot',
  'QQ',          // QQ
  'MicroMessenger' // 微信
].join('|'), 'i');

/**
 * itty-router 中间件，用于阻止已知的搜索引擎爬虫
 * @param {Request} request 
 * @param {Environment} env 
 * @returns {Response|undefined} 如果是爬虫，则返回一个 403 响应；否则返回 undefined 继续执行
 */
export function blockBots(request, env) {
  const url = new URL(request.url);

  // 允许爬虫访问 robots.txt
  if (url.pathname === '/robots.txt') {
    return;
  }
  
  const userAgent = request.headers.get('User-Agent') || '';

  if (BOT_UA_PATTERNS.test(userAgent)) {
    const response = new ResponseBuilder(request, env);
    return response.error('Bots are not allowed.', 403);
  }


  // 如果不是爬虫，不返回任何内容，itty-router 会继续处理后续路由
  return;

}