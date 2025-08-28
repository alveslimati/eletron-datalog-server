// mqttHandler.js
import amqp from 'amqplib';

// ---------------------------
// Configuração RabbitMQ
// ---------------------------
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

// ---------------------------
// Buffer em memória
// ---------------------------
const BUFFER_MAX = 10000;
const buffer = [];
let stats = {
  consumed: 0,
  parsedOk: 0,
  parseErrors: 0,
};

// Adiciona mensagem ao buffer
function pushToBuffer(message) {
  buffer.push(message);
  if (buffer.length > BUFFER_MAX) {
    buffer.shift(); // Remove as mensagens mais antigas
  }
}

// Recupera mensagens filtradas do buffer
export function getBufferedMessages({ numero_serial, limit = 200, sinceTs, untilTs } = {}) {
  let filtered = buffer;

  if (numero_serial) {
    filtered = filtered.filter((item) => item.numero_serial === numero_serial);
  }
  if (sinceTs) {
    filtered = filtered.filter((item) => item.timestamp >= sinceTs);
  }
  if (untilTs) {
    filtered = filtered.filter((item) => item.timestamp <= untilTs);
  }

  // Ordena e aplica limite
  filtered = filtered.slice(-limit).sort((a, b) => b.timestamp - a.timestamp);
  return filtered;
}

// Retorna as estatísticas do consumo
export function getStats() {
  return {
    bufferSize: buffer.length,
    bufferMax: BUFFER_MAX,
    stats,
  };
}

// ---------------------------
// Consumo do RabbitMQ
// ---------------------------
let connection = null;
let channel = null;

// Processa mensagens da fila
async function onMessage(msg) {
  try {
    stats.consumed++;

    const payload = JSON.parse(msg.content.toString());
    payload.timestamp = new Date(payload.timestamp).getTime(); // Normaliza timestamp
    pushToBuffer(payload);

    stats.parsedOk++;
    channel.ack(msg);
  } catch (err) {
    stats.parseErrors++;
    channel.nack(msg, false, false); // Direciona para DLQ se configurada
    console.error('Erro ao processar mensagem:', err.message);
  }
}

// Inicializa o consumidor RabbitMQ
export async function startRabbitConsumer() {
  if (connection && channel) {
    return; // Já conectado
  }

  const amqpUrl = `amqp://${encodeURIComponent(rabbitConfig.username)}:${encodeURIComponent(
    rabbitConfig.password
  )}@${rabbitConfig.host}:${rabbitConfig.port}/${encodeURIComponent(rabbitConfig.virtualHost)}`;

  connection = await amqp.connect(amqpUrl);
  
  connection.on('close', () => {
    console.warn('Conexão fechada. Tentando reconectar...');
    connection = null;
    channel = null;
  });

  channel = await connection.createChannel();
  await channel.prefetch(100); // Controla o número de mensagens em trânsito
  await channel.assertQueue(rabbitConfig.queueName, { durable: true });
  await channel.assertExchange(rabbitConfig.deadLetterExchange, 'direct', { durable: true });
  await channel.assertQueue(rabbitConfig.deadLetterQueue, { durable: true });
  await channel.consume(rabbitConfig.queueName, onMessage, { noAck: false });

  console.log(`[RabbitMQ] Consumidor iniciado na fila: ${rabbitConfig.queueName}`);
}