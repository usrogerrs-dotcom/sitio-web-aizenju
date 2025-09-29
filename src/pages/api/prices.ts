import type { APIRoute } from 'astro';
import Stripe from 'stripe';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const STRIPE_SECRET_KEY = import.meta.env.STRIPE_SECRET_KEY as string | undefined;
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: 'Falta STRIPE_SECRET_KEY' }), { status: 500 });
    }

    const idsParam = url.searchParams.get('ids') || '';
    const ids = idsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!ids.length) {
      return new Response(JSON.stringify({ error: 'Faltan IDs de precios (?ids=price_...)' }), { status: 400 });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY);

    const results: Record<string, {
      unit_amount: number | null;
      currency: string | null;
      type: 'recurring' | 'one_time';
      interval?: string;
      interval_count?: number;
      nickname?: string | null;
    }> = {};

    for (const id of ids) {
      try {
        const price = await stripe.prices.retrieve(id, { expand: ['product'] });
        results[id] = {
          unit_amount: price.unit_amount ?? null,
          currency: price.currency ?? null,
          type: price.type,
          interval: price.recurring?.interval,
          interval_count: price.recurring?.interval_count,
          nickname: price.nickname ?? null,
        };
      } catch (e: any) {
        results[id] = {
          unit_amount: null,
          currency: null,
          type: 'one_time',
        };
      }
    }

    return new Response(JSON.stringify({ prices: results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Error obteniendo precios' }), { status: 500 });
  }
};
