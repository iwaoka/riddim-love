// www.riddim.love → https://riddim.love (301, path and query kept).
// A separate tiny Worker so every path redirects — including static files,
// which the main Worker's assets would otherwise serve on www directly.

export const ORIGIN = 'https://riddim.love';

export function wwwRedirect(request: Request): Response {
  const url = new URL(request.url);
  return new Response(null, {
    status: 301,
    headers: {
      Location: ORIGIN + url.pathname + url.search,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

export default { fetch: wwwRedirect };
