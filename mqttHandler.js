import mqtt from 'mqtt';
import amqplib from 'amqplib/callback_api.js';

const rabbitMessages = []; // Para armazenar mensagens do RabbitMQ
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

        // Declara a fila utilizando os mesmos argumentos já configurados no RabbitMQ
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
              console.error(
                `Erro ao declarar fila '${queue}' no RabbitMQ:`,
                err2.message
              );
              return;
            }
            console.log(`Fila '${queue}' conectada com sucesso!`);

            // Consumindo mensagens da fila
            channel.consume(
              queue,
              (message) => {
                if (message !== null) {
                  try {
                    const data = JSON.parse(message.content.toString());
                    console.log("Mensagem recebida do RabbitMQ:", data);
                    rabbitMessages.push(data); // Armazena a mensagem
                  } catch (err) {
                    console.error(
                      "Erro ao processar mensagem do RabbitMQ:",
                      err.message
                    );
                  }
                }
              },
              {
                noAck: true, // Não remove mensagens da fila
              }
            );
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
        mqttMessages.push(data);
      } catch (err) {
        console.error(
          "Erro ao processar mensagem do MQTT (HiveMQ):",
          err.message
        );
      }
    });
  };

  // Inicializa a conexão com RabbitMQ, com fallback para HiveMQ
  rabbitConnect();

  // Disponibiliza mensagens no servidor express
  app.locals.rabbitMessages = rabbitMessages; // Mensagens do RabbitMQ
  app.locals.mqttMessages = mqttMessages;     // Mensagens do HiveMQ
};

export default mqttHandler;