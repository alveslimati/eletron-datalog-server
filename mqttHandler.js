import mqtt from 'mqtt';
import amqplib from 'amqplib/callback_api.js';

const rabbitMessages = []; // Armazena mensagens em memória temporariamente (opcional)
const mqttMessages = [];   // Para armazenar mensagens do HiveMQ

const mqttHandler = (app) => {
  console.log("Inicializando conexão com RabbitMQ e HiveMQ...");

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
        console.error("Erro ao conectar-se ao RabbitMQ:", err.message);
        console.log("Utilizando HiveMQ como fallback...");
        mqttConnect();
        return;
      }

      console.log("Conexão estabelecida com o RabbitMQ!");

      connection.createChannel((err, channel) => {
        if (err) {
          console.error("Erro ao criar canal do RabbitMQ:", err.message);
          return;
        }

        const queue = rabbitConfig.queueName;

        // Declarando a fila com as configurações existentes
        channel.assertQueue(
          queue,
          {
            durable: true, // A fila e as mensagens sobrevivem a reinicializações do RabbitMQ
            exclusive: false,
            autoDelete: false,
            arguments: {
              "x-dead-letter-exchange": rabbitConfig.deadLetterExchange,
              "x-dead-letter-routing-key": rabbitConfig.deadLetterQueue,
            },
          },
          (err2) => {
            if (err2) {
              console.error(`Erro ao declarar a fila '${queue}':`, err2.message);
              return;
            }
            console.log(`Fila '${queue}' configurada com sucesso!`);

            // Apenas lê mensagens da fila quando necessário, sem alterar o status delas
            channel.consume(
              queue,
              (message) => {
                if (message !== null) {
                  try {
                    const data = JSON.parse(message.content.toString());
                    console.log("Mensagem lida do RabbitMQ:", data);

                    // Armazena a mensagem em memória (opcionalmente, pode ser usado pela API)
                    rabbitMessages.push(data);

                    // Não chama `ack` ou `nack` para que a mensagem permaneça no estado `Ready`.
                  } catch (err) {
                    console.error("Erro ao processar mensagem do RabbitMQ:", err.message);
                  }
                }
              },
              {
                noAck: true, // Evita que a mensagem fique no estado "Unacked"
              }
            );

            console.log(`Mensagens da fila '${queue}' sendo lidas sem alterações no status.`);
          }
        );
      });
    });
  };

  // Conexão com HiveMQ (MQTT)
  const mqttConnect = () => {
    const mqttClient = mqtt.connect(
      'mqtts://29232f271b9f47cb8d55000d4557bc0c.s1.eu.hivemq.cloud:8883',
      {
        username: 'ESP32',
        password: 'Eletron0101',
      }
    );

    mqttClient.on('connect', () => {
      console.log("Conectado ao MQTT (HiveMQ)");
      mqttClient.subscribe('maquina/dados');
    });

    mqttClient.on('message', (topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log(`Mensagem recebida do MQTT no tópico ${topic}:`, data);
        mqttMessages.push(data); // Armazena a mensagem
      } catch (err) {
        console.error("Erro ao processar mensagem do MQTT (HiveMQ):", err.message);
      }
    });
  };

  // Inicializa a conexão com RabbitMQ, com fallback para HiveMQ
  rabbitConnect();

  // Disponibiliza mensagens no servidor express
  app.locals.rabbitMessages = rabbitMessages; // Mensagens lidas do RabbitMQ
  app.locals.mqttMessages = mqttMessages; // Mensagens lidas do HiveMQ
};

export default mqttHandler;