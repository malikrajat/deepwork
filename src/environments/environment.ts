/**
 * Build-time configuration for the contact form.
 *
 * The form does not send mail itself: it posts to Web3Forms, which relays the
 * submission to the address the access key belongs to. The key is therefore a
 * form identifier rather than a password — it travels in the request body from
 * the browser, the same way it would sit in a hidden field on a plain HTML form,
 * and it is kept here in one place instead of at the call site so it can be
 * changed or restricted without touching the component.
 *
 * Two things keep it safe to ship:
 *
 * - **Restrict the key to this site's domain** in the Web3Forms dashboard, so a
 *   copy used anywhere else is refused. The only thing the key can do is send a
 *   message to the owner's inbox.
 * - **Every submission still has to pass hCaptcha**, which Web3Forms verifies
 *   server-side when it is enabled for the form.
 *
 * The hCaptcha site key is the one Web3Forms publishes for its free plan
 * (<https://docs.web3forms.com/getting-started/customizations/spam-protection/hcaptcha>);
 * it is public by design and is what the widget on the contact page renders with.
 */
export const environment = {
  contact: {
    endpoint: 'https://api.web3forms.com/submit',
    accessKey: 'bfec6211-793f-42b7-932e-0d5fdab4df4b',
    hcaptchaSiteKey: '50b2fe65-b00b-4b9e-ad62-3ba471098be2',
    subject: 'New message from the DeepWork contact form',
  },
} as const;
