// Edge Function: ai-recipe-import
//
// Origem: entregue pelo Codex (commit f71ecea "[Codex] Align AI recipe import
// edge contract"). O push do Codex falhou por proxy (CONNECT 403), então esta
// função foi LANDADA por Claude a partir do patch `handoff/codex-f71ecea.patch`,
// preservando fielmente o design do Codex. Backend é domínio do Codex
// (AGENTS.md / AGENT_OWNERSHIP.md) — alterações de lógica devem ser dele.
//
// Importa receita por texto e/ou foto/screenshot chamando a OpenAI NO SERVIDOR
// (a OPENAI_API_KEY nunca vai ao navegador) e retorna { draft: AiRecipeDraft }.

const MAX_TEXT_CHARS = 20_000
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const DEFAULT_MODEL = 'gpt-4o-mini'
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 12

type AiRecipeImportRequest = {
  texto?: string
  imagemBase64?: string
  mimeType?: string
  // nomes legados aceitos para facilitar fusão entre branches
  text?: string
  imageBase64?: string
  imageMimeType?: string
}

type RateLimitBucket = { count: number; resetAt: number }

const rateLimitBuckets = new Map<string, RateLimitBucket>()

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const recipeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    nome: { type: 'string' },
    categoria: { type: ['string', 'null'] },
    rendimento_valor: { type: ['number', 'null'] },
    rendimento_unidade: { type: ['string', 'null'] },
    preco_venda: { type: ['number', 'null'] },
    ingredientes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          nome: { type: 'string' },
          quantidade: { type: ['number', 'null'] },
          unidade: { type: ['string', 'null'] },
          observacao: { type: ['string', 'null'] },
        },
        required: ['nome', 'quantidade', 'unidade', 'observacao'],
      },
    },
    modo_preparo: { type: ['string', 'null'] },
    avisos: {
      type: 'array',
      items: { type: 'string' },
    },
    confianca: { type: ['number', 'null'], minimum: 0, maximum: 1 },
  },
  required: [
    'nome',
    'categoria',
    'rendimento_valor',
    'rendimento_unidade',
    'preco_venda',
    'ingredientes',
    'modo_preparo',
    'avisos',
    'confianca',
  ],
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function getClientKey(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown-client'
}

function checkRateLimit(req: Request): Response | null {
  const now = Date.now()
  const key = getClientKey(req)
  const bucket = rateLimitBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return null
  }
  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    return jsonResponse(
      {
        error: 'Muitas tentativas em pouco tempo. Aguarde 1 minuto e tente novamente.',
        code: 'rate_limit_exceeded',
      },
      429,
    )
  }
  bucket.count += 1
  return null
}

function base64ByteLength(base64: string): number {
  const clean = base64.replace(/\s/g, '')
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0
  return Math.floor((clean.length * 3) / 4) - padding
}

function normalizeBase64(input: string): string {
  const match = input.match(/^data:[^;]+;base64,(.+)$/)
  return (match?.[1] ?? input).replace(/\s/g, '')
}

function normalizeRequest(body: AiRecipeImportRequest) {
  const texto = typeof body.texto === 'string' ? body.texto : typeof body.text === 'string' ? body.text : ''
  const rawImage = typeof body.imagemBase64 === 'string'
    ? body.imagemBase64
    : typeof body.imageBase64 === 'string'
      ? body.imageBase64
      : ''
  const imagemBase64 = rawImage ? normalizeBase64(rawImage) : ''
  const mimeType = typeof body.mimeType === 'string'
    ? body.mimeType
    : typeof body.imageMimeType === 'string'
      ? body.imageMimeType
      : undefined
  return { texto: texto.trim(), imagemBase64, mimeType }
}

function validateInput(input: ReturnType<typeof normalizeRequest>): Response | null {
  if (!input.texto && !input.imagemBase64) {
    return jsonResponse({ error: 'Envie o texto da receita ou uma foto/screenshot em base64.', code: 'missing_input' }, 400)
  }
  if (input.texto.length > MAX_TEXT_CHARS) {
    return jsonResponse(
      { error: `O texto da receita é muito grande. Limite: ${MAX_TEXT_CHARS} caracteres.`, code: 'text_too_large' },
      413,
    )
  }
  if (input.imagemBase64) {
    const mimeType = input.mimeType || 'image/jpeg'
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      return jsonResponse(
        { error: 'Formato de imagem não aceito. Envie JPEG, PNG ou WEBP.', code: 'unsupported_image_type' },
        415,
      )
    }
    if (base64ByteLength(input.imagemBase64) > MAX_IMAGE_BYTES) {
      return jsonResponse(
        { error: 'A imagem é muito grande. Envie uma imagem com até 4 MB.', code: 'image_too_large' },
        413,
      )
    }
  }
  return null
}

function buildUserContent(input: ReturnType<typeof normalizeRequest>): Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [
    {
      type: 'input_text',
      text: [
        'Você é um assistente de ficha técnica para gastronomia no Brasil.',
        'Extraia uma ficha técnica a partir do texto e/ou imagem enviados.',
        'Responda somente no JSON do schema solicitado.',
        'Use português do Brasil.',
        'Ingredientes devem ser insumos compráveis, com nomes curtos e claros.',
        'Unidades podem ser strings livres como g, kg, ml, L, un, colher, xícara ou a gosto.',
        'Se algum campo estiver ausente, ilegível ou incerto, use null quando permitido e adicione um aviso claro em avisos.',
        'Sempre preencha avisos quando fizer suposições, quando houver ingrediente sem quantidade/unidade, ou quando não houver rendimento/preço.',
        'confianca deve ser um número de 0 a 1 representando a confiança geral da extração.',
        input.texto ? `Texto recebido:\n${input.texto}` : 'Texto não informado; extraia usando apenas a imagem.',
      ].join('\n'),
    },
  ]
  if (input.imagemBase64) {
    const mimeType = input.mimeType || 'image/jpeg'
    content.push({
      type: 'input_image',
      image_url: `data:${mimeType};base64,${input.imagemBase64}`,
    })
  }
  return content
}

function extractOutputText(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.output_text === 'string') return payload.output_text
  const output = Array.isArray(payload.output) ? payload.output : []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const content = Array.isArray((item as { content?: unknown }).content) ? (item as { content: unknown[] }).content : []
    for (const part of content) {
      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text
      }
    }
  }
  return undefined
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Método não permitido. Use POST.', code: 'method_not_allowed' }, 405)

  const rateLimitResponse = checkRateLimit(req)
  if (rateLimitResponse) return rateLimitResponse

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    return jsonResponse(
      { error: 'OPENAI_API_KEY não configurada no Supabase Secrets.', code: 'missing_openai_key' },
      500,
    )
  }

  const body = await req.json().catch(() => null) as AiRecipeImportRequest | null
  if (!body || typeof body !== 'object') {
    return jsonResponse({ error: 'Corpo da requisição inválido. Envie JSON.', code: 'invalid_json' }, 400)
  }

  const input = normalizeRequest(body)
  const validationResponse = validateInput(input)
  if (validationResponse) return validationResponse

  const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_RECIPE_MODEL') || DEFAULT_MODEL,
      input: [{ role: 'user', content: buildUserContent(input) }],
      text: {
        format: {
          type: 'json_schema',
          name: 'ficha_tecnica',
          strict: true,
          schema: recipeSchema,
        },
      },
    }),
  })

  const payload = await openaiResponse.json().catch(() => ({})) as Record<string, unknown>
  if (!openaiResponse.ok) {
    return jsonResponse(
      {
        error: 'Falha ao interpretar a receita com IA. Tente novamente ou revise a imagem/texto enviado.',
        code: 'openai_error',
        details: payload,
      },
      502,
    )
  }

  const outputText = extractOutputText(payload)
  if (!outputText) {
    return jsonResponse({ error: 'A IA não retornou um rascunho estruturado.', code: 'missing_structured_output' }, 502)
  }

  try {
    return jsonResponse({ draft: JSON.parse(outputText) })
  } catch (_error) {
    return jsonResponse({ error: 'A IA retornou JSON inválido. Tente novamente.', code: 'invalid_ai_json' }, 502)
  }
})
