// mqttHandler.js (ESM)
// Consumo "realtime" a partir de uma fila espelho no RabbitMQ (CloudAMQP),
// com buffer em memória para o endpoint getRealTimeMessages e reconexão resiliente.

import amqp from 'amqplib';

// =========================
// Configurações (CloudAMQP) - HARDCODED
// =========================
const cloudAmqp = {
  protocol: 'amqps',
  host: 'shark.rmq.cloudamqp.com',
  port: 5671, // CloudAMQPS
  vhost: 'xbyhpdes',
  username: 'xbyhpdes',
  password: 'dcP6ky94M8NRuEwhrTJDK0AhgtYG5tsd',
  // Recomendações CloudAMQP
  heartbeat: 30,
  connectionTimeout: 30000,
};

// Monta a URL AMQPS final
const AMQP_URL = `${cloudAmqp.protocol}://${encodeURIComponent(cloudAmqp.username)}:${encodeURIComponent(cloudAmqp.password)}@${cloudAmqp.host}/${encodeURIComponent(cloudAmqp.vhost)}?heartbeat=${cloudAmqp.heartbeat}&connection_timeout=${cloudAmqp.connectionTimeout}`;

// =========================
// Config Rabbit/Filas (HARDCODED)
// Ajuste nomes conforme seu domínio de eventos.
// =========================
const rabbitConfig = {
  // Exchange principal onde o publisher envia
  exchange: 'eletron.datalog.exchange',
  exchangeType: 'topic',

  // Binding key que você quer espelhar para o realtime
  bindingKey: 'eletron.datalog.#',

  // Fila espelho (realtime) consumida pelo app
  realtimeQueue: 'eletron.datalog.queue.realtime',

  // DLX/DLQ
  realtimeDLX: 'eletron.datalog.realtime.dlx',
  realtimeDLQ: 'eletron.datalog.queue.realtime.dlq',

  // Parametrizações da fila realtime
  realtimeTtlMs: 60000, // 60s
  realtimeMaxLength: 20000, // até 20k mensagens
  prefetch: 50, // paralelismo do consumer
};

// =========================
/** Buffer em memória (HARDCODED) */
// =========================
const BUFFER_MAX = 25000;
const buffer = [];

function pushToBuffer(item) {
  buffer.push(item);
  if (buffer.length > BUFFER_MAX) {
    buffer.splice(0, buffer.length - BUFFER_MAX); // remove os mais antigos
  }
}

/**
 * Retorna mensagens do buffer com filtros:
 * - numero_serial (string exata)
 * - sinceTs / untilTs (timestamps em ms)
 * - limit (máximo de mensagens retornadas; padrão 500; teto 10000)
 */
export function getBufferedMessages({ numero_serial, sinceTs, untilTs, limit } = {}) {
  let data = buffer;

  if (numero_serial) {
    data = data.filter(m => {
      const ns =
        (m.payload && (m.payload.numero_serial || m.payload.numeroSerial || m.payload.serial)) ||
        m.properties?.headers?.numero_serial ||
        m.properties?.headers?.serial;
      return ns === numero_serial;
    });
  }

  if (sinceTs != null) {
    const s = Number(sinceTs);
    data = data.filter(m => m.ts >= s);
  }
  if (untilTs != null) {
    const u = Number(untilTs);
    data = data.filter(m => m.ts <= u);
  }

  // ordena por timestamp ascendente
  data = data.slice().sort((a, b) => a.ts - b.ts);

  const finalLimit = Math.min(Number(limit || 500), 10000);
  return data.slice(0, finalLimit);
}

// =========================
// Conexão/Consumo e Reconexão
// =========================
let conn = null;
let ch = null;
let consumerTag = null;
let starting = false;
let stopped = false;

const RECONNECT_MIN_MS = 2000;
const RECONNECT_MAX_MS = 30000;
let currentDelay = RECONNECT_MIN_MS;
let reconnectTimer = null;

function maskUrl(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return 'amqps://***:***@***';
  }
}

async function assertTopology(channel) {
  // Exchange dos dados
  await channel.assertExchange(rabbitConfig.exchange, rabbitConfig.exchangeType, {
    durable: true,
  });

  // DLX e DLQ da realtime
  await channel.assertExchange(rabbitConfig.realtimeDLX, 'fanout', { durable: true });
  await channel.assertQueue(rabbitConfig.realtimeDLQ, {
    durable: true,
  });
  await channel.bindQueue(rabbitConfig.realtimeDLQ, rabbitConfig.realtimeDLX, '');

  // Fila realtime (espelho) com TTL e max-length
  await channel.assertQueue(rabbitConfig.realtimeQueue, {
    durable: true,
    arguments: {
      'x-message-ttl': rabbitConfig.realtimeTtlMs,
      'x-max-length': rabbitConfig.realtimeMaxLength,
      'x-dead-letter-exchange': rabbitConfig.realtimeDLX,
      // 'x-queue-mode': 'lazy', // opcional
    },
  });

  // Bind fila realtime à exchange principal
  await channel.bindQueue(rabbitConfig.realtimeQueue, rabbitConfig.exchange, rabbitConfig.bindingKey);
}

function parseMessage(msg) {
  let payload = null;
  try {
    const content = msg.content?.toString('utf8') || '';
    payload = content ? JSON.parse(content) : null;
  } catch (err) {
    return { ok: false, error: err };
  }

  const headers = msg.properties?.headers || {};
  const ts =
    (typeof payload?.ts === 'number' && payload.ts) ||
    (typeof headers.ts === 'number' && headers.ts) ||
    Date.now();

  const normalized = {
    ts,
    payload,
    fields: msg.fields,
    properties: msg.properties,
  };

  return { ok: true, data: normalized };
}

function scheduleReconnect() {
  if (stopped) return;
  if (reconnectTimer) return;

  const delay = Math.min(currentDelay, RECONNECT_MAX_MS);
  console.warn(`[AMQP] Tentando reconectar em ${delay}ms...`);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    currentDelay = Math.min(currentDelay * 2, RECONNECT_MAX_MS);
    try {
      await startRealtimeConsumer();
    } catch (err) {
      console.error('[AMQP] Erro no ciclo de reconexão:', err?.message || err);
      scheduleReconnect();
    }
  }, delay);
}

function resetBackoff() {
  currentDelay = RECONNECT_MIN_MS;
}

async function safeCloseChannel() {
  try {
    if (ch) {
      await ch.close();
    }
  } catch {
    // ignore
  } finally {
    ch = null;
  }
}

async function safeCloseConnection() {
  try {
    if (conn) {
      await conn.close();
    }
  } catch {
    // ignore
  } finally {
    conn = null;
  }
}

export function isConnected() {
  return Boolean(conn) && Boolean(ch);
}

export async function stopRealtimeConsumer() {
  stopped = true;
  starting = false;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    if (ch && consumerTag) {
      await ch.cancel(consumerTag);
      consumerTag = null;
    }
  } catch {
    // ignore
  }

  await safeCloseChannel();
  await safeCloseConnection();
  console.info('[AMQP] Consumo realtime parado.');
}

/**
 * Inicia o consumo realtime.
 * Opcionalmente, você pode passar onMessage(msgNormalizado) para tratar cada mensagem além do buffer.
 */
export async function startRealtimeConsumer({ onMessage } = {}) {
  if (starting) {
    console.info('[AMQP] startRealtimeConsumer já em progresso...');
    return;
  }
  if (isConnected()) {
    console.info('[AMQP] Já conectado. Reutilizando canal existente.');
    return;
  }

  starting = true;
  stopped = false;

  try {
    console.info('[AMQP] Conectando em', maskUrl(AMQP_URL));
    conn = await amqp.connect(AMQP_URL); // AMQPS (TLS) implícito via protocolo
    resetBackoff();

    conn.on('error', (err) => {
      console.error('[AMQP] Conexão erro:', err?.message || err);
    });

    conn.on('close', () => {
      console.warn('[AMQP] Conexão fechada.');
      safeCloseChannel().catch(() => {});
      conn = null;
      ch = null;
      if (!stopped) scheduleReconnect();
    });

    ch = await conn.createChannel();
    await assertTopology(ch);
    await ch.prefetch(rabbitConfig.prefetch);

    const consumeResult = await ch.consume(
      rabbitConfig.realtimeQueue,
      async (msg) => {
        if (!msg) return;
        try {
          const parsed = parseMessage(msg);
          if (!parsed.ok) {
            console.warn('[AMQP] Falha no parse, enviando para DLQ:', parsed.error?.message || parsed.error);
            ch.nack(msg, false, false); // não requeue -> vai para DLQ
            return;
          }

          const item = parsed.data;
          pushToBuffer(item);

          // callback externo, se fornecido
          if (typeof onMessage === 'function') {
            try {
              await onMessage(item);
            } catch (cbErr) {
              // callback não deve impedir ack; logamos o erro e seguimos
              console.error('[AMQP] onMessage callback erro:', cbErr?.message || cbErr);
            }
          }

          ch.ack(msg);
        } catch (err) {
          console.error('[AMQP] Erro processando mensagem, enviando para DLQ:', err?.message || err);
          ch.nack(msg, false, false);
        }
      },
      { noAck: false }
    );

    consumerTag = consumeResult.consumerTag;
    starting = false;

    console.info('[AMQP] Realtime consumer iniciado. Fila:', rabbitConfig.realtimeQueue);
  } catch (err) {
    starting = false;
    console.error('[AMQP] Falha ao iniciar consumo:', err?.message || err);
    await safeCloseChannel();
    await safeCloseConnection();
    if (!stopped) scheduleReconnect();
    throw err;
  }
}