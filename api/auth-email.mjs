/* Supabase Auth "Send Email" hook: Supabase no longer sends any account email itself. For every
   sign-up confirmation, password reset and email change it calls this function, which sends the
   email through Resend with the JourMax look.

   Setup (see README → "Account emails through Resend"):
     Supabase → Authentication → Hooks → Send Email → HTTPS → https://<your-app>.vercel.app/api/auth-email
     Vercel env: SEND_EMAIL_HOOK_SECRET (the hook secret, v1,whsec_…), RESEND_API_KEY, SUPABASE_URL,
                 optional AUTH_EMAIL_FROM (default: REPORT_FROM, then JourMax <onboarding@resend.dev>)
   Docs: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook */
import { createHmac, timingSafeEqual } from 'node:crypto';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Standard Webhooks signature check (how Supabase signs hook calls). */
function verified(body, headers) {
  const secret = (process.env.SEND_EMAIL_HOOK_SECRET || '').replace(/^v1,whsec_/, '');
  const id = headers.get('webhook-id'), timestamp = headers.get('webhook-timestamp'), signatures = headers.get('webhook-signature');
  if (!secret || !id || !timestamp || !signatures) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 5 * 60) return false; // stale or replayed
  const expected = createHmac('sha256', Buffer.from(secret, 'base64')).update(`${id}.${timestamp}.${body}`).digest();
  return signatures.split(' ').some(entry => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/* The same link Supabase puts in its own emails: its verify endpoint checks the token, then
   redirects to the app (/?account=confirm, /?account=recovery, /?account=email). */
function verifyLink(tokenHash, type, data) {
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const params = new URLSearchParams({ token: tokenHash, type, redirect_to: data.redirect_to || data.site_url });
  return `${base}/auth/v1/verify?${params}`;
}

function page(title, lines, cta) {
  const button = cta ? `<a href="${cta.href}" style="display:inline-block;margin-top:8px;background:#15171c;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">${esc(cta.label)}</a>` : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#15171c">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="font-size:13px;color:#6b7280">JourMax</div>
  <div style="background:#fff;border-radius:12px;padding:20px;margin-top:8px">
    <h1 style="margin:0 0 12px;font-size:20px">${esc(title)}</h1>
    ${lines.map(l => `<p style="margin:0 0 10px;font-size:15px;line-height:1.6">${l}</p>`).join('')}
    ${button}
  </div>
  <p style="font-size:12px;color:#9ca3af;margin:16px 4px">If you didn't ask for this, you can ignore this email.</p>
</div></body></html>`;
  const text = [title, '', ...lines.map(l => l.replace(/<[^>]+>/g, '')), cta ? `\n${cta.label}: ${cta.href}` : ''].join('\n');
  return { html, text };
}

const code = token => `Or enter this code: <strong style="font-size:18px;letter-spacing:3px">${esc(token)}</strong>`;

/* The email(s) for one hook call. Empty = a notice the app doesn't use. */
function compose(user, data) {
  const type = data.email_action_type;
  const mail = (to, subject, title, lines, cta) => ({ to, subject, ...page(title, lines, cta) });
  switch (type) {
    case 'signup':
      return [mail(user.email, 'Confirm your JourMax account', 'Confirm your email',
        ['Welcome to JourMax. Confirm your email to finish setting up your account.'],
        { href: verifyLink(data.token_hash, 'signup', data), label: 'Confirm my email' })];
    case 'invite':
      return [mail(user.email, "You're invited to JourMax", 'You have been invited',
        ['Accept the invitation to create your JourMax account.'],
        { href: verifyLink(data.token_hash, 'invite', data), label: 'Accept invitation' })];
    case 'recovery':
      return [mail(user.email, 'Reset your JourMax password', 'Reset your password',
        ['Someone (hopefully you) asked to reset your password. Choose a new one here.'],
        { href: verifyLink(data.token_hash, 'recovery', data), label: 'Choose a new password' })];
    case 'magiclink':
    case 'email':
      return [mail(user.email, 'Your JourMax sign-in link', 'Sign in to JourMax',
        ['Use this link to sign in.', code(data.token)],
        { href: verifyLink(data.token_hash, type, data), label: 'Sign in' })];
    case 'reauthentication':
      return [mail(user.email, 'Your JourMax confirmation code', 'Confirm it’s you',
        ['To continue, enter this code in the app.', `<strong style="font-size:18px;letter-spacing:3px">${esc(data.token)}</strong>`])];
    case 'email_change': {
      // Supabase's field names are reversed for backward compatibility: the current address gets
      // token_hash_new and the new address gets token_hash (see the hook docs).
      const next = user.new_email || '';
      const secure = Boolean(data.token_hash && data.token_hash_new);
      const out = [];
      if (next) out.push(mail(next, 'Confirm your new JourMax email', 'Confirm your new email',
        [`Confirm that <strong>${esc(next)}</strong> is the new email for your JourMax account.`],
        { href: verifyLink(secure ? data.token_hash : data.token_hash || data.token_hash_new, 'email_change', data), label: 'Confirm new email' }));
      if (secure) out.push(mail(user.email, 'Confirm your JourMax email change', 'Confirm the email change',
        [`You asked to change your account email to <strong>${esc(next)}</strong>. Confirm it here too.`],
        { href: verifyLink(data.token_hash_new, 'email_change', data), label: 'Confirm change' }));
      return out;
    }
    case 'password_changed_notification':
      return [mail(user.email, 'Your JourMax password was changed', 'Password changed',
        ['The password for your JourMax account was just changed. If this wasn’t you, reset it now.'])];
    case 'email_changed_notification':
      return [mail(user.email, 'Your JourMax email was changed', 'Email changed',
        ['The email for your JourMax account was just changed. If this wasn’t you, reset your password now.'])];
    default:
      return [];
  }
}

const TEST_SENDER = 'JourMax <onboarding@resend.dev>';

async function deliver(from, { to, subject, html, text }) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
}

async function send(mail) {
  const from = process.env.AUTH_EMAIL_FROM || process.env.REPORT_FROM || TEST_SENDER;
  let r = await deliver(from, mail);
  // While the sending domain is still being verified, Resend refuses it: use the test sender
  // (it only reaches the Resend account owner) so nothing breaks in the meantime.
  if (r.status === 403 && from !== TEST_SENDER) {
    const reason = await r.text();
    if (!/domain/i.test(reason)) throw new Error(`Resend 403: ${reason.slice(0, 300)}`);
    console.warn(`Sender ${from} refused (${reason.slice(0, 120)}); retrying with the test sender.`);
    r = await deliver(TEST_SENDER, mail);
  }
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

const fail = (status, message) => Response.json({ error: { http_code: status, message } }, { status });

export default {
  async fetch(request) {
    if (request.method !== 'POST') return fail(405, 'method not allowed');
    const body = await request.text();
    if (!verified(body, request.headers)) return fail(401, 'invalid signature');
    let payload;
    try { payload = JSON.parse(body); } catch { return fail(400, 'bad payload'); }
    try {
      for (const m of compose(payload.user, payload.email_data)) await send(m);
      return Response.json({});
    } catch (e) {
      console.error(e);
      // Supabase reports this to the app as "error sending email", so the user can retry.
      return fail(500, e.message);
    }
  },
};
