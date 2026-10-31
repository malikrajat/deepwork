import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HCaptchaService } from '../../src/app/core/services/hcaptcha.service';
import { environment } from '../../src/environments/environment';

interface FakeApi {
  render: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
}

/** Install the global the hCaptcha script would provide, and return its spies. */
function installApi(): FakeApi {
  const api: FakeApi = {
    render: vi.fn().mockReturnValue(7),
    reset: vi.fn(),
  };
  (globalThis as unknown as { hcaptcha?: FakeApi }).hcaptcha = api;
  return api;
}

describe('HCaptchaService', () => {
  beforeEach(() => {
    delete (globalThis as unknown as { hcaptcha?: FakeApi }).hcaptcha;
    document.documentElement.classList.remove('theme-light', 'theme-dark');
  });

  afterEach(() => {
    delete (globalThis as unknown as { hcaptcha?: FakeApi }).hcaptcha;
    document.documentElement.classList.remove('theme-light', 'theme-dark');
  });

  it('draws the widget with the configured site key and keeps its token', async () => {
    const api = installApi();
    const service = new HCaptchaService();
    const host = document.createElement('div');

    expect(service.solved()).toBe(false);
    await service.render(host);

    expect(api.render).toHaveBeenCalledTimes(1);
    const [container, options] = api.render.mock.calls[0];
    expect(container).toBe(host);
    expect(options.sitekey).toBe(environment.contact.hcaptchaSiteKey);

    options.callback('a-token');
    expect(service.token()).toBe('a-token');
    expect(service.solved()).toBe(true);

    options['expired-callback']();
    expect(service.token()).toBe(null);
    expect(service.solved()).toBe(false);
  });

  it('reports a failed challenge and clears any token', async () => {
    const api = installApi();
    const service = new HCaptchaService();

    await service.render(document.createElement('div'));
    const [, options] = api.render.mock.calls[0];
    options.callback('a-token');
    options['error-callback']();

    expect(service.token()).toBe(null);
    expect(service.error()).toMatch(/could not be completed/i);
  });

  it('resets the widget and forgets the token', async () => {
    const api = installApi();
    const service = new HCaptchaService();

    await service.render(document.createElement('div'));
    const [, options] = api.render.mock.calls[0];
    options.callback('a-token');

    service.reset();

    expect(api.reset).toHaveBeenCalledWith(7);
    expect(service.token()).toBe(null);
  });

  it('survives a widget that has been removed with its container', async () => {
    const api = installApi();
    api.reset.mockImplementation(() => {
      throw new Error('widget not found');
    });
    const service = new HCaptchaService();

    await service.render(document.createElement('div'));
    const [, options] = api.render.mock.calls[0];
    options.callback('a-token');

    expect(() => service.reset()).not.toThrow();
    expect(service.token()).toBe(null);
  });

  it('reports a widget that cannot be drawn', async () => {
    const api = installApi();
    api.render.mockImplementation(() => {
      throw new Error('The captcha could not be drawn.');
    });
    const service = new HCaptchaService();

    await service.render(document.createElement('div'));

    expect(service.error()).toBe('The captcha could not be drawn.');
    expect(service.token()).toBe(null);
  });

  it('asks for the light theme when the app is in light mode', async () => {
    const api = installApi();
    document.documentElement.classList.add('theme-light');
    const service = new HCaptchaService();

    await service.render(document.createElement('div'));

    const [, options] = api.render.mock.calls[0];
    expect(options.theme).toBe('light');
  });
});
