/**
 * Nordyx UX Agent — Cloudflare Worker proxy
 *
 * Purpose: Hide the Anthropic API key from the browser. The HTML tool
 * sends requests to this Worker instead of directly to api.anthropic.com.
 * The Worker attaches the real API key (stored as a secret) and forwards
 * the request to Anthropic, then returns the response.
 *
 * SETUP (in the Cloudflare dashboard, no CLI needed):
 * 1. Go to dash.cloudflare.com → Workers & Pages → Create → Create Worker.
 * 2. Give it a name, e.g. "nordyx-ux-agent-proxy".
 * 3. Delete the default code and paste this entire file in.
 * 4. Click "Deploy".
 * 5. Go to the Worker's Settings → Variables and Secrets → Add.
 *    - Name: ANTHROPIC_API_KEY
 *    - Value: your real sk-ant-... key
 *    - Type: Secret (encrypted)
 *    Save and deploy again.
 * 6. (Optional but recommended) Settings → Variables and Secrets → Add another:
 *    - Name: ALLOWED_ORIGINS
 *    - Value: a comma-separated list of allowed origins, e.g.
 *      https://yuvalbloomberg.github.io,http://localhost:3000
 *    This restricts who can call your Worker. If you skip this, the
 *    Worker is open to anyone with the URL (still safe, since they
 *    never see your key — but they could spend your API credits).
 * 7. Copy the Worker URL (e.g. https://nordyx-ux-agent-proxy.<your-subdomain>.workers.dev)
 *    and paste it into the HTML tool where indicated.
 */

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request, env) });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Optional origin allowlist
    const origin = request.headers.get('Origin') || '';
    if (env.ALLOWED_ORIGINS) {
      const allowed = env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
      if (!allowed.includes(origin)) {
        return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) }
        });
      }
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) }
      });
    }

    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'Server misconfigured: missing API key' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) }
      });
    }

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    const responseBody = await anthropicResponse.text();

    return new Response(responseBody, {
      status: anthropicResponse.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) }
    });
  }
};

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '*';
  let allowOrigin = '*';
  if (env.ALLOWED_ORIGINS) {
    const allowed = env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
    allowOrigin = allowed.includes(origin) ? origin : 'null';
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
