// Supabase Edge Function: send-email
//
// Thin relay from the Aura backend (Express + Prisma, custom auth — this
// project does NOT use Supabase Auth) to Resend. Supabase itself has no
// generic "send arbitrary email" API outside Supabase Auth's own flows, so
// this function is the integration point: Supabase is the compute layer,
// Resend is the actual delivery provider.
//
// Deploy (run from Backend-3.0/api, this file's project root):
//   supabase functions deploy send-email
// Secrets:  supabase secrets set RESEND_API_KEY=re_xxx EMAIL_FUNCTION_SECRET=<same value as backend's EMAIL_FUNCTION_SECRET> RESEND_FROM="Aura <noreply@yourdomain.com>"
//
// Called by src/shared/services/email.service.ts (SupabaseEdgeEmailService) with:
//   POST { to, subject, html }
//   header: x-email-secret: <EMAIL_FUNCTION_SECRET>

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const EMAIL_FUNCTION_SECRET = Deno.env.get('EMAIL_FUNCTION_SECRET');
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Aura <onboarding@resend.dev>';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Shared-secret auth — this endpoint is NOT protected by Supabase's
  // anon/service-role key scheme, so we gate it ourselves. Only the backend
  // knows EMAIL_FUNCTION_SECRET.
  const providedSecret = req.headers.get('x-email-secret');
  if (!EMAIL_FUNCTION_SECRET || providedSecret !== EMAIL_FUNCTION_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!RESEND_API_KEY) {
    return new Response('Email provider not configured', { status: 500 });
  }

  let body: { to?: string; subject?: string; html?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const { to, subject, html } = body;
  if (!to || !subject || !html) {
    return new Response('Missing required fields: to, subject, html', { status: 400 });
  }

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text().catch(() => '');
    console.error('Resend send failed', resendResponse.status, errorText);
    return new Response('Failed to send email', { status: 502 });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
