import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContactService, type ContactMessage } from '../../src/app/core/services/contact.service';
import { environment } from '../../src/environments/environment';

/** A stand-in for `Response` that needs no fetch implementation. */
function reply(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function message(overrides: Partial<ContactMessage> = {}): ContactMessage {
  return {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    mobile: '+00 00000 00000',
    message: 'I would like to talk about a project.',
    captchaToken: 'captcha-token',
    ...overrides,
  };
}

describe('ContactService', () => {
  const service = new ContactService();
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the submission to Web3Forms with the key and the captcha token', async () => {
    fetchMock.mockResolvedValue(reply(200, { success: true }));

    await service.send(message());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(environment.contact.endpoint);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });

    const body = JSON.parse(init.body as string);
    expect(body.access_key).toBe(environment.contact.accessKey);
    expect(body['h-captcha-response']).toBe('captcha-token');
    expect(body.name).toBe('Ada Lovelace');
    expect(body.email).toBe('ada@example.com');
    expect(body.mobile).toBe('+00 00000 00000');
    expect(body.message).toBe('I would like to talk about a project.');
    expect(body.botcheck).toBe(false);
    expect(body.subject).toContain('Ada Lovelace');
  });

  it('leaves the optional channels out when they are empty', async () => {
    fetchMock.mockResolvedValue(reply(200, { success: true }));

    await service.send(message({ email: '  ', mobile: '' }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect('email' in body).toBe(false);
    expect('mobile' in body).toBe(false);
  });

  it('trims what it sends', async () => {
    fetchMock.mockResolvedValue(reply(200, { success: true }));

    await service.send(message({ name: '  Ada  ', message: '  Hello  ' }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.name).toBe('Ada');
    expect(body.message).toBe('Hello');
  });

  it('surfaces the message Web3Forms puts under `body`', async () => {
    fetchMock.mockResolvedValue(
      reply(400, { success: false, body: { message: 'Invalid hCaptcha token.' } }),
    );

    await expect(service.send(message())).rejects.toThrow('Invalid hCaptcha token.');
  });

  it('surfaces a top-level error message and treats success:false as a failure', async () => {
    fetchMock.mockResolvedValue(reply(200, { success: false, message: 'Rate limited.' }));

    await expect(service.send(message())).rejects.toThrow('Rate limited.');
  });

  it('falls back to the HTTP status when the reply carries no explanation', async () => {
    fetchMock.mockResolvedValue(reply(500, null));

    await expect(service.send(message())).rejects.toThrow('500');
  });

  it('explains a blocked connection rather than leaking the TypeError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(service.send(message())).rejects.toThrow(/No connection to the message service/);
  });
});
