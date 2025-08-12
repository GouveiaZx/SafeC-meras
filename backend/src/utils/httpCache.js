// Utilitários de cache HTTP padronizados para uso nas rotas de streaming e download

/**
 * Gera um ETag fraco baseado em tamanho e mtime do arquivo.
 * @param {import('fs').Stats} stats
 * @returns {string}
 */
export function computeEtag(stats) {
  return `W/"${stats.size}-${Math.floor(stats.mtimeMs)}"`;
}

/**
 * Converte mtime do arquivo em formato UTC para Last-Modified.
 * @param {import('fs').Stats} stats
 * @returns {string}
 */
export function computeLastModified(stats) {
  return stats.mtime.toUTCString();
}

/**
 * Avalia If-Modified-Since com precisão em segundos.
 * @param {string | undefined} ifModifiedSinceHeader
 * @param {import('fs').Stats} stats
 * @returns {boolean} true se não modificado desde
 */
export function evaluateIfModifiedSince(ifModifiedSinceHeader, stats) {
  if (!ifModifiedSinceHeader) return false;
  const parsed = new Date(ifModifiedSinceHeader);
  if (Number.isNaN(parsed.getTime())) return false;
  const headerSeconds = Math.floor(parsed.getTime() / 1000);
  const fileSeconds = Math.floor(stats.mtimeMs / 1000);
  return headerSeconds >= fileSeconds;
}

/**
 * Avalia condicionais de cache ETag e If-Modified-Since.
 * @param {import('express').Request} req
 * @param {import('fs').Stats} stats
 * @param {string} etag
 * @returns {{ matchesEtag: boolean, notModifiedSince: boolean, notModified: boolean }}
 */
export function evaluateConditionalCache(req, stats, etag) {
  const ifNoneMatch = req.headers['if-none-match'];
  const matchesEtag = !!ifNoneMatch && ifNoneMatch.split(',').map(s => s.trim()).includes(etag);
  const notModifiedSince = evaluateIfModifiedSince(req.headers['if-modified-since'], stats);
  return { matchesEtag, notModifiedSince, notModified: matchesEtag || notModifiedSince };
}

/**
 * Define cabeçalhos padrão de cache.
 * @param {import('express').Response} res
 * @param {string} etag
 * @param {string} lastModified
 */
export function setStandardCacheHeaders(res, etag, lastModified) {
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', lastModified);
  res.setHeader('Cache-Control', 'private, max-age=300, must-revalidate');
}