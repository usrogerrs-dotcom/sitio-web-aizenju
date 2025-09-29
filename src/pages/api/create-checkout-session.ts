import type { APIRoute } from 'astro';
import Stripe from 'stripe';

export const prerender = false;

// Expected env vars: STRIPE_SECRET_KEY, STRIPE_PRICE_ID (or STRIPE_PRICE_AMOUNT + STRIPE_PRICE_CURRENCY)

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));

    const STRIPE_SECRET_KEY = import.meta.env.STRIPE_SECRET_KEY as string | undefined;
    const STRIPE_PRICE_ID = import.meta.env.STRIPE_PRICE_ID as string | undefined;
    const STRIPE_PRICE_AMOUNT = Number(import.meta.env.STRIPE_PRICE_AMOUNT ?? '0');
    const STRIPE_PRICE_CURRENCY = (import.meta.env.STRIPE_PRICE_CURRENCY as string | undefined) || 'usd';

    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: 'Falta STRIPE_SECRET_KEY en variables de entorno' }), { status: 500 });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY);

    // Allow either body.priceId, body.amount/body.currency, fixed price via env PRICE_ID, or ad-hoc amount via env
    let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
    const bodyPriceId = typeof body?.priceId === 'string' && body.priceId.trim().length > 0 ? body.priceId.trim() : undefined;
    const bodyAmount = Number.isFinite(Number(body?.amount)) ? Math.round(Number(body.amount)) : 0;
    const bodyCurrency = typeof body?.currency === 'string' && body.currency.trim().length > 0 ? String(body.currency).toLowerCase() : undefined;
    const bodyRecurringInterval = typeof body?.recurringInterval === 'string' && body.recurringInterval.trim().length > 0
      ? (body.recurringInterval as 'day' | 'week' | 'month' | 'year')
      : undefined;
    if (bodyPriceId) {
      lineItems = [
        {
          price: bodyPriceId,
          quantity: 1,
        },
      ];
    } else if (bodyAmount > 0 && bodyCurrency) {
      lineItems = [
        {
          price_data: {
            currency: bodyCurrency,
            product_data: {
              name: body?.productName || 'Producto',
            },
            unit_amount: bodyAmount,
            ...(bodyRecurringInterval ? { recurring: { interval: bodyRecurringInterval } } : {}),
          },
          quantity: 1,
        },
      ];
    } else if (STRIPE_PRICE_ID) {
      lineItems = [
        {
          price: STRIPE_PRICE_ID,
          quantity: 1,
        },
      ];
    } else if (STRIPE_PRICE_AMOUNT > 0) {
      lineItems = [
        {
          price_data: {
            currency: STRIPE_PRICE_CURRENCY,
            product_data: {
              name: body?.productName || 'Diagnóstico técnico',
            },
            unit_amount: Math.round(STRIPE_PRICE_AMOUNT),
          },
          quantity: 1,
        },
      ];
    } else {
      return new Response(JSON.stringify({ error: 'Configura STRIPE_PRICE_ID o STRIPE_PRICE_AMOUNT/STRIPE_PRICE_CURRENCY' }), { status: 500 });
    }

    const originHeader = (request.headers.get('origin') || '').replace(/\/$/, '');
    const fallbackHost = import.meta.env.PROD
      ? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
      : 'http://localhost:4321';
    const baseUrl = (originHeader || fallbackHost).replace(/\/$/, '');
    if (!baseUrl) {
      return new Response(JSON.stringify({ error: 'No se pudo determinar la URL base para Stripe (origin/VERCEL_URL)' }), { status: 500 });
    }
    const successUrl = `${baseUrl}/success`;
    const cancelUrl = `${baseUrl}/cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        issues: Array.isArray(body?.issues) ? body.issues.join(',') : '',
        productKey: body?.productKey || '',
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Error creando sesión de pago' }), { status: 500 });
  }
};
