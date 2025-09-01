// mqttHandler.js
// Conector RabbitMQ com buffer em memória, DLX/DLQ corretos, reconexão e consumo robusto
import amqp from 'amqplib';

// ---------------------------
// Configuração RabbitMQ
// ---------------------------
// OBS: mantenha esta estrutura como você pediu. Ajuste apenas username/password e, se necessário, o vhost.
const rabbitConfig = {
  protocol: 'amqps',
  host: 'shark.rmq.cloudamqp.com',
  port: 5671, // CloudAMQP (AMQPS)
  vhost: 'xbyhpdes', // Em CloudAMQP, geralmente é igual ao username, ex.: 'abcdxyz'
  username: 'xbyhpdes',
  password: 'dcP6ky94M8NRuEwhrTJDK0AhgtYG5tsd',

  // Topologia
  queueName: 'eletron.datalog.queue',
  deadLetterExchange: 'dead_letter_exchange',
  deadLetterQueue: 'eletron.datalog.queue.dlq',

  // Consumo
  prefetch: 100,

  // Buffer
  maxBuffer: 50000,

  // Reconexão
  reconnect: {
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    factor: 1.8,
    jitterMs: 500,
  },
};

// ---------------------------
// Estado interno
// ---------------------------
let connection = null;
let channel = null;
let isConnecting = false;
let stopped = false;
let reconnectAttempts = 0;

let buffer = [];
const stats = {
  startedAt: Date.now(),
  lastConnectedAt: null,
  lastErrorAt: null,
  lastErrorMessage: null,
  totalReceived: 0,
  totalAcked: 0,
  totalNacked: 0,
  reconnects: 0,
};

// ---------------------------
// Utilitários
// ---------------------------
function amqpUrlFromConfig(cfg) {
  // amqps://username:password@host/vhost
  const encUser = encodeURIComponent(cfg.username);
  const encPass = encodeURIComponent(cfg.password);
  const encVhost = encodeURIComponent(cfg.vhost || '/');
  return `${cfg.protocol}://${encUser}:${encPass}@${cfg.host}:${cfg.port}/${encVhost}`;
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function clampBuffer() {
  if (buffer.length > rabbitConfig.maxBuffer) {
    // Remove o excesso mais antigo de uma vez (eficiente)
    buffer.splice(0, buffer.length - rabbitConfig.maxBuffer);
  }
}

function extractTimestamp(payload, properties) {
  // Tenta extrair um timestamp coerente, em milissegundos
  // Ordem de preferência: payload.ts | payload.timestamp | payload.createdAt | properties.timestamp | agora
  const candidates = [
    payload?.ts,
    payload?.timestamp,
    payload?.createdAt,
    properties?.timestamp, // em AMQP costuma ser segundos; normalizar
  ].filter((v) => v !== undefined && v !== null);

  let ts = Date.now();
  for (const c of candidates) {
    const n = Number(c);
    if (!Number.isNaN(n) && n > 0) {
      // Se for claramente em segundos (ex.: 10 dígitos), converte para ms
      ts = n < 2e10 ? n * 1000 : n;
      break;
    }
  }
  return ts;
}

function toStringOrNull(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function pushToBuffer(msgObj) {
  buffer.push(msgObj);
  clampBuffer();
}

function normalizeIncomingMessage(msg) {
  let raw = null;
  let payload = null;

  try {
    raw = msg.content.toString('utf8');
  } catch {
    raw = null;
  }

  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = { raw };
  }

  const numero_serial =
    toStringOrNull(payload?.numero_serial) ||
    toStringOrNull(payload?.serial) ||
    toStringOrNull(payload?.device_id) ||
    null;

  const ts = extractTimestamp(payload, msg.properties);

  return {
    ts,
    numero_serial,
    payload, // Conteúdo útil para seu front/consumidor HTTP
    properties: msg.properties || {},
    fields: msg.fields || {},
    receivedAt: Date.now(),
  };
}

// ---------------------------
// Buffer: consulta
// ---------------------------
export function getBufferedMessages({ numero_serial = null, sinceTs, untilTs, limit = 200 } = {}) {
  const since = sinceTs !== undefined ? Number(sinceTs) : undefined;
  const until = untilTs !== undefined ? Number(untilTs) : undefined;

  let result = buffer;

  if (numero_serial) {
    result = result.filter((m) => m.numero_serial === numero_serial);
  }
  if (since !== undefined) {
    result = result.filter((m) => m.ts >= since);
  }
  if (until !== undefined) {
    result = result.filter((m) => m.ts <= until);
  }

  // Ordena por ts ascendente para facilitar paginação temporal
  result = result.slice().sort((a, b) => a.ts - b.ts);

  if (limit && result.length > limit) {
    result = result.slice(-limit);
  }

  // Retorne objetos simples (ts, numero_serial, payload) — leve e direto
  return result.map((m) => ({
    ts: m.ts,
    numero_serial: m.numero_serial,
    payload: m.payload,
  }));
}

export function getStats() {
  return {
    connected: !!channel,
    bufferSize: buffer.length,
    maxBuffer: rabbitConfig.maxBuffer,
    totalReceived: stats.totalReceived,
    totalAcked: stats.totalAcked,
    totalNacked: stats.totalNacked,
    reconnects: stats.reconnects,
    startedAt: stats.startedAt,
    lastConnectedAt: stats.lastConnectedAt,
    lastErrorAt: stats.lastErrorAt,
    lastErrorMessage: stats.lastErrorMessage,
    queueName: rabbitConfig.queueName,
    deadLetterExchange: rabbitConfig.deadLetterExchange,
    deadLetterQueue: rabbitConfig.deadLetterQueue,
    prefetch: rabbitConfig.prefetch,
  };
}

// ---------------------------
// Publicação opcional
// ---------------------------
export async function publishToQueue(message) {
  if (!channel) {
    throw new Error('Canal AMQP ainda não está disponível.');
  }
  const content = Buffer.from(JSON.stringify(message), 'utf8');
  // Não (re)declara a fila principal aqui para evitar 406; assume que já existe
  const ok = channel.sendToQueue(rabbitConfig.queueName, content, {
    contentType: 'application/json',
    deliveryMode: 2, // persistente
    timestamp: Math.floor(Date.now() / 1000),
  });
  return ok;
}

// ---------------------------
// Consumo
// ---------------------------
async function onMessage(msg) {
  if (!msg) return;
  try {
    stats.totalReceived += 1;

    const normalized = normalizeIncomingMessage(msg);
    pushToBuffer(normalized);

    channel.ack(msg);
    stats.totalAcked += 1;
  } catch (err) {
    stats.totalNacked += 1;
    // Nack sem requeue => vai para DLQ se a fila principal tiver DLX configurado
    try {
      channel.nack(msg, false, false);
    } catch {
      // ignora
    }
    console.error('[RabbitMQ] Erro ao processar mensagem:', err?.message || err);
  }
}

async function ensureTopology(ch) {
  // Garante DLX e DLQ
  await ch.assertExchange(rabbitConfig.deadLetterExchange, 'direct', { durable: true });
  await ch.assertQueue(rabbitConfig.deadLetterQueue, { durable: true });
  // Bind DLQ com a routing key que o seu DLX usa (você confirmou que é o nome da fila principal)
  await ch.bindQueue(
    rabbitConfig.deadLetterQueue,
    rabbitConfig.deadLetterExchange,
    rabbitConfig.queueName
  );

  // Não redeclara a fila principal se ela já existir (evita 406)
  try {
    await ch.checkQueue(rabbitConfig.queueName);
    console.log(`[RabbitMQ] Fila existente confirmada: ${rabbitConfig.queueName} (sem redeclaração)`);
  } catch (err) {
    if (err?.code === 404) {
      // Cria a fila com DLX alinhado ao que existe no broker
      await ch.assertQueue(rabbitConfig.queueName, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': rabbitConfig.deadLetterExchange,
          'x-dead-letter-routing-key': rabbitConfig.queueName,
        },
      });
      console.log(`[RabbitMQ] Fila criada: ${rabbitConfig.queueName} com DLX/DLRK`);
    } else {
      throw err;
    }
  }
}

async function createChannel(conn) {
  const ch = await conn.createChannel();
  await ch.prefetch(rabbitConfig.prefetch);
  await ensureTopology(ch);
  await ch.consume(rabbitConfig.queueName, onMessage, { noAck: false });
  console.log(`[RabbitMQ] Consumidor iniciado na fila: ${rabbitConfig.queueName}`);
  return ch;
}

async function connectWithRetry() {
  if (isConnecting) return;
  isConnecting = true;

  let delay = rabbitConfig.reconnect.initialDelayMs;

  while (!stopped) {
    try {
      const url = amqpUrlFromConfig(rabbitConfig);
      connection = await amqp.connect(url, {
        // Em CloudAMQP com AMQPS, as opções default geralmente bastam
        // rejectUnauthorized: true, // se usar certificados próprios, ajuste conforme necessário
      });

      connection.on('close', (err) => {
        console.warn('[RabbitMQ] Conexão fechada:', err ? err.message : '(sem erro)');
        channel = null;
        connection = null;
        if (!stopped) {
          stats.reconnects += 1;
          connectWithRetry().catch(() => {});
        }
      });

      connection.on('error', (err) => {
        console.error('[RabbitMQ] Erro de conexão:', err?.message || err);
      });

      channel = await createChannel(connection);

      channel.on('close', () => {
        console.warn('[RabbitMQ] Canal fechado.');
      });

      channel.on('error', (err) => {
        console.error('[RabbitMQ] Erro no canal:', err?.message || err);
      });

      stats.lastConnectedAt = Date.now();
      reconnectAttempts = 0;
      isConnecting = false;
      return; // conectado com sucesso
    } catch (err) {
      stats.lastErrorAt = Date.now();
      stats.lastErrorMessage = err?.message || String(err);
      console.error('[RabbitMQ] Falha ao conectar/criar canal:', stats.lastErrorMessage);

      reconnectAttempts += 1;
      stats.reconnects += 1;

      // Backoff exponencial com jitter
      const jitter = Math.floor(Math.random() * rabbitConfig.reconnect.jitterMs);
      await sleep(delay + jitter);
      delay = Math.min(Math.floor(delay * rabbitConfig.reconnect.factor), rabbitConfig.reconnect.maxDelayMs);
    }
  }

  isConnecting = false;
}

// ---------------------------
// Controle público
// ---------------------------
export async function startRabbitConsumer() {
  stopped = false;
  if (channel) {
    console.log('[RabbitMQ] Consumidor já está ativo.');
    return;
  }
  await connectWithRetry();
}

export async function stopRabbitConsumer() {
  stopped = true;

  try {
    if (channel) {
      await channel.close().catch(() => {});
    }
  } finally {
    channel = null;
  }

  try {
    if (connection) {
      await connection.close().catch(() => {});
    }
  } finally {
    connection = null;
  }
}

export default {
  startRabbitConsumer,
  stopRabbitConsumer,
  getBufferedMessages,
  getStats,
  publishToQueue,
};