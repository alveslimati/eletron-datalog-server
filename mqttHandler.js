import mqtt from 'mqtt';
import amqplib from 'amqplib/callback_api.js';

const MAX_MESSAGES_IN_MEMORY = 1000;
const rabbitMessages = []; // Para armazenar mensagens do RabbitMQ
const mqttMessages = [];   // Para armazenar mensagens do HiveMQ


const mqttHandler = (app) => {
  console.log("Inicializando conexões com RabbitMQ e HiveMQ...");

  const rabbitConfig = {
    host: 'shark.rmq.cloudamqp.com',
    port: 5672,
    username: 'xbyhpdes',
    password: 'dcP6ky94M8NRuEwhrTJDK0AhgtYG5tsd',
    virtualHost: 'xbyhpdes',
    queueName: 'eletron.datalog.queue',
    deadLetterExchange: 'dead_letter_exchange',
    deadLetterQueue: 'eletron.datalog.queue.dlq',
  };

  // Conexão com RabbitMQ
  const rabbitConnect = () => {
    const rabbitURL = `amqps://${rabbitConfig.username}:${rabbitConfig.password}@${rabbitConfig.host}/${rabbitConfig.virtualHost}`;

    amqplib.connect(rabbitURL, (err, connection) => {
      if (err) {
        console.error("Erro ao conectar ao RabbitMQ:", err.message);
        return;
      }

      console.log("Conexão ao RabbitMQ foi estabelecida!");
      connection.createChannel((err, channel) => {
        if (err) {
          console.error("Erro ao criar canal do RabbitMQ:", err.message);
          return;
        }

        const queue = rabbitConfig.queueName;

        // Declaração de fila
        channel.assertQueue(
          queue,
          {
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: {
              "x-dead-letter-exchange": rabbitConfig.deadLetterExchange,
              "x-dead-letter-routing-key": rabbitConfig.deadLetterQueue, // Respeitando as configurações existentes
            },
          },
          (err2) => {
            if (err2) {
              console.error(`Erro ao declarar a fila: ${err2.message}`);
              return;
            }

            console.log(`Fila '${queue}' configurada com sucesso!`);

            channel.consume(
              queue,
              (message) => {
                try {
                  if (!message || !message.content) {
                    console.warn("Mensagem inválida encontrada. Ignorada.");
                    return;
                  }

                  // Parse da mensagem
                  const data = JSON.parse(message.content.toString());
                  console.log("Mensagem recebida do RabbitMQ:", data);

                  // Adiciona ao buffer limitado
                  if (rabbitMessages.length >= MAX_MESSAGES_IN_MEMORY) {
                    rabbitMessages.shift(); // Remove mensagens antigas
                  }

                  rabbitMessages.push(data);

                  // Confirma que a mensagem foi processada com sucesso
                  channel.ack(message);
                } catch (err) {
                  console.error("Erro ao processar mensagem:", err.message);

                  // Opcional: Envia a mensagem para Dead Letter
                  channel.nack(message, false, false);
                }
              },
              { noAck: false } // Habilita acknowledgment manual
            );

            console.log("Consumo da fila iniciado...");
          }
        );
      });
    });
  };

  rabbitConnect();

  // Disponibilizando mensagens no servidor Express
  app.locals.rabbitMessages = rabbitMessages;

  console.log("Configuração concluída para RabbitMQ e HiveMQ.");
};

export default mqttHandler;