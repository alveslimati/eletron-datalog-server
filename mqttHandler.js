// mqttHandler.js
import mqtt from 'mqtt';
import crypto from 'crypto';

// Se seu runtime não tiver fetch global (Node < 18), tentamos carregar node-fetch dinamicamente
let fetchFn = globalThis.fetch;
async function ensureFetch() {
  if (!fetchFn) {
    const mod = await import('node-fetch');
    fetchFn = mod.default || mod;
  }
  return fetchFn;
}

const MAX_MESSAGES_IN_MEMORY = 1000;
const RABBIT_PEEK_INTERVAL_MS = 2000; // intervalo de "espiada" na fila
const RABBIT_PEEK_BATCH = 200;        // quantas mensagens pedir por requisição

// Buffers em memória
const rabbitMessages = []; // mensagens lidas via peek da fila do RabbitMQ
const mqttMessages = [];   // reservado caso você use HiveMQ depois

// Set para deduplicação das mensagens "espiadas"
// Preferimos usar message_id quando disponível; caso contrário, hash do payload
const seenIds = new Set();

// Configuração hardcoded do RabbitMQ (conforme solicitado)
const rabbitConfig = {
  host: 'shark.rmq.cloudamqp.com',
  port: 5672, // não usamos aqui porque a Management API vai em HTTPS (443), mas mantemos a estrutura
  username: 'xbyhpdes',
  password: 'dcP6ky94M8NRuEwhrTJDK0AhgtYG5tsd',
  virtualHost: 'xbyhpdes',
  queueName: 'eletron.datalog.queue',
  deadLetterExchange: 'dead_letter_exchange',
  deadLetterQueue: 'eletron.datalog.queue.dlq',
};

// Monta a URL da Management API
// Em CloudAMQP, normalmente é https://<host>/api/...
// Importante: o virtualHost precisa ser URL-encoded
function getRabbitManagementUrl() {
  const vhost = encodeURIComponent(rabbitConfig.virtualHost);
  const queue = encodeURIComponent(rabbitConfig.queueName);
  return `https://${rabbitConfig.host}/api/queues/${vhost}/${queue}/get`;
}

function getAuthHeader() {
  const token = Buffer.from(`${rabbitConfig.username}:${rabbitConfig.password}`).toString('base64');
  return `Basic ${token}`;
}

// Gera uma chave única para deduplicação de mensagens
function dedupKeyFromMgmtMessage(m) {
  // Tenta usar message_id se existir
  const messageId = m?.properties?.message_id;
  if (messageId) return `id:${messageId}`;

  // Caso não exista, usa hash do payload bruto
  // O payload vem como string em m.payload (com encoding "auto")
  const payload = typeof m?.payload === 'string' ? m.payload : JSON.stringify(m?.payload ?? '');
  const hash = crypto.createHash('sha1').update(payload).digest('hex');
  return `hash:${hash}`;
}

// Converte a mensagem da Management API (que é envelope) no objeto de dados que você quer armazenar
function parseRabbitPayload(m) {
  // O campo m.payload é string. Tentamos parsear como JSON; se falhar, guardamos como texto.
  try {
    const data = JSON.parse(m.payload);
    return data;
  } catch (_) {
    // retorna formato genérico com o texto, mantendo timestamp aproximado para ordenação se necessário
    return {
      raw: m.payload,
      timestamp: new Date().toISOString(),
    };
  }
}

// Adiciona a mensagem ao buffer em memória com limite e deduplicação
function pushToBufferIfNew(data, key) {
  if (seenIds.has(key)) return;

  // Mantém set com tamanho controlado (simples LRU por corte)
  if (seenIds.size > MAX_MESSAGES_IN_MEMORY * 5) {
    // Limpa em bloco para não crescer demais
    // Estratégia simples: derruba tudo e reconstrói com o que está no buffer atual
    seenIds.clear();
    for (const msg of rabbitMessages) {
      const k = msg.__dedupKey || null;
      if (k) seenIds.add(k);
    }
  }

  // Controle de tamanho do buffer
  if (rabbitMessages.length >= MAX_MESSAGES_IN_MEMORY) {
    const removed = rabbitMessages.shift();
    if (removed?.__dedupKey) {
      seenIds.delete(removed.__dedupKey);
    }
  }

  // Armazena
  const wrapped = { ...data, __dedupKey: key };
  rabbitMessages.push(wrapped);
  seenIds.add(key);
}

// Função que “espia” a fila via Management API e reencaminha as mensagens (requeue true)
async function peekRabbitMessages() {
  try {
    const url = getRabbitManagementUrl();
    const fetch = await ensureFetch();

    const body = {
      count: RABBIT_PEEK_BATCH,       // quantas mensagens queremos "espiar" por chamada
      ackmode: 'ack_requeue_true',    // pega e devolve as mensagens à fila (mantém Ready)
      encoding: 'auto',               // payload como string
      truncate: 500000,               // limite de bytes
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error(`Falha ao espiar mensagens (HTTP ${resp.status}): ${text}`);
      return;
    }

    const messages = await resp.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      // Nada novo nessa rodada
      return;
    }

    for (const m of messages) {
      const key = dedupKeyFromMgmtMessage(m);
      const data = parseRabbitPayload(m);
      pushToBufferIfNew(data, key);
    }
  } catch (err) {
    console.error('Erro no peek das mensagens do RabbitMQ (Management API):', err?.message || err);
  }
}

// Inicializa o polling periódico para “espiar” a fila
function startRabbitPeekLoop() {
  // Faz uma primeira rodada imediata
  peekRabbitMessages().catch(() => {});
  // E agenda as próximas
  return setInterval(() => {
    peekRabbitMessages().catch(() => {});
  }, RABBIT_PEEK_INTERVAL_MS);
}

const mqttHandler = (app) => {
  console.log('Inicializando (modo leitura sem consumir) RabbitMQ...');

  // Disponibiliza o buffer no Express para a sua controller
  app.locals.rabbitMessages = rabbitMessages;

  // Inicia o loop de "peek"
  const intervalId = startRabbitPeekLoop();

  // Se quiser, limpe o intervalo em shutdown do app
  const cleanup = () => {
    if (intervalId) clearInterval(intervalId);
  };

  // Exponha opcionalmente para quem integrar (não é obrigatório)
  app.on?.('close', cleanup);

  // Observação: Import de mqtt mantido para preservar a estrutura, embora não utilizado aqui
  console.log('Configuração concluída (sem consume/get; mensagens permanecem Ready).');
};

export default mqttHandler;