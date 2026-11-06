import { describe, expect, it } from 'vitest';
import { wwwRedirect } from '../www-redirect/index';

describe('www redirect', () => {
  it('301s to the apex, keeping path and query', () => {
    const r = wwwRedirect(new Request('https://www.riddim.love/riddim/18/sleng-teng?f=jammy'));
    expect(r.status).toBe(301);
    expect(r.headers.get('Location')).toBe('https://riddim.love/riddim/18/sleng-teng?f=jammy');
  });
  it('handles the root and static files', () => {
    expect(wwwRedirect(new Request('https://www.riddim.love/')).headers.get('Location')).toBe('https://riddim.love/');
    expect(wwwRedirect(new Request('http://www.riddim.love/ogp.png?v=3')).headers.get('Location')).toBe('https://riddim.love/ogp.png?v=3');
  });
});
