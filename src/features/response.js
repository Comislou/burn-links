import * as pageBuilder from './htmlBuilder.js';

export class ResponseBuilder {
  constructor(request, env) {
    this.request = request;
    this.env = env;
  }

  /**
   * 构建动态的内容安全策略 (CSP)
   * @returns {string} CSP 字符串
   */
  _buildCsp() {
    const unsafeInline = "'unsafe-inline'";
    
    // 从环境变量中提取需要加入白名单的域名
    const allowedImageSources = new Set(['self', 'data:']);
    
    const externalUrls = [
      this.env.HOME_ICON,
      this.env.BACKGROUND,
      this.env.BACKGROUND_VERTICAL
    ];

    for (const urlStr of externalUrls) {
      if (urlStr) {
        try {
          const url = new URL(urlStr);
          allowedImageSources.add(url.origin);
        } catch (err) {
          console.error(`Invalid URL in env for CSP: ${urlStr}`);
        }
      }
    }
    
    const csp = [
      "default-src 'self'",
      `img-src ${[...allowedImageSources].join(' ')}`,
      // htmlBuilder.js 中包含内联样式和脚本，因此需要 'unsafe-inline'
      // 在更严格的应用中，应考虑使用 none 或 hash
      `style-src 'self' ${unsafeInline}`,
      `script-src 'self' ${unsafeInline}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'", // 替代 X-Frame-Options
    ];
    
    return csp.join('; ');
  }

  /**
   * 构建基础安全头
   * @param {Object} customHeaders - 用户自定义的额外头部
   * @returns {Headers} Headers 对象
   */
  _buildHeaders(customHeaders = {}) {
    const headers = new Headers({
      "Content-Type": "text/html;charset=UTF-8",
      "Content-Security-Policy": this._buildCsp(),
      "X-Content-Type-Options": "nosniff",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      ...customHeaders,
    });
    return headers;
  }

  /**
   * 返回一个 HTML 响应
   * @param {string} body - HTML 内容
   * @param {number} status - HTTP 状态码
   * @param {Object} headers - 额外的头部
   * @returns {Response}
   */
  html(body, status = 200, headers = {}) {
    const responseHeaders = this._buildHeaders(headers);
    return new Response(body, { status, headers: responseHeaders });
  }

  /**
   * 返回一个错误页面响应
   * @param {string} message - 错误信息
   * @param {number} status - HTTP 状态码
   * @returns {Response}
   */
  error(message, status = 500) {
    const errorHtml = pageBuilder.getErrorPage(message);
    return this.html(errorHtml, status);
  }

  /**
   * 返回一个重定向响应
   * @param {string} url - 重定向的目标 URL
   * @param {number} status - 重定向状态码 (301, 302, 307, 308)
   * @returns {Response}
   */
  redirect(url, status = 302) {
    // 重定向响应通常不需要复杂的安全头
    return Response.redirect(url, status);
  }
}