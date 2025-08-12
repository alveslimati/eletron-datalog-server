import mqtt from 'mqtt';
import amqplib from 'amqplib/callback_api.js';

const rabbitMessages = []; // Armazena mensagens lidas do RabbitMQ
const mqttMessages = [];   // Armazena mensagens lidas do HiveMQ

const mqttHandler = (app) => {
  console.log("Iniciando serviços RabbitMQ e HiveMQ...");

  const rabbitConfig = {
    host: 'shark.rmq.cloudamqp.com',
    port: 5672,
    username: 'xbyhpdes',
    password: 'dcP6ky94M8NRuEwhrTJDK0AhgtYG5tsd',
    queueName: 'eletron.datalog.queue',
    virtualHost: 'xbyhpdes',
  };

  // Conexão com RabbitMQ
  const rabbitConnect = () => {
    const rabbitURL = `amqps://${rabbitConfig.username}:${rabbitConfig.password}@${rabbitConfig.host}/${rabbitConfig.virtualHost}`;

    amqplib.connect(rabbitURL, (err, connection) => {
      if (err) {
        console.error("Erro ao conectar com RabbitMQ:", err.message);
        console.log("Tentando usar HiveMQ como fallback...");
        mqttConnect();
        return;
      }

      console.log("Conectado ao RabbitMQ!");

      connection.createChannel((err, channel) => {
        if (err) {
          console.error("Erro ao criar canal RabbitMQ:", err.message);
          return;
        }

        const queue = rabbitConfig.queueName;

        // Assegurar que a fila existe (caso não tenha sido criada anteriormente)
        channel.assertQueue(queue, { durable: true });

        console.log(`Consumindo mensagens da fila RabbitMQ: '${queue}'`);

        // Processar cada mensagem da fila
        channel.consume(
          queue,
          (message) => {
            if (message !== null) {
              try {
                const data = JSON.parse(message.content.toString());
                console.log("Mensagem recebida do RabbitMQ:", data);
                rabbitMessages.push(data); // Armazena a mensagem

                // Não confirma a exclusão da mensagem; mantém persistência
                // Para confirmação manual, utilize: channel.ack(message);
              } catch (err) {
                console.error(
                  "Erro ao processar mensagem do RabbitMQ:",
                  err.message
                );
              }
            }
          },
          {
            noAck: true, // Não remove mensagens da fila; apenas lê
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
      console.log('Conectado ao MQTT (HiveMQ)');
      mqttClient.subscribe('maquina/dados');
    });

    mqttClient.on('message', (topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log(`Mensagem recebida no tópico ${topic}:`, data);
        mqttMessages.push(data);
      } catch (err) {
        console.error('Erro ao processar mensagem do MQTT (HiveMQ):', err.message);
      }
    });
  };

  // Inicializa a conexão com RabbitMQ, com o HiveMQ como fallback
  rabbitConnect();

  // Disponibiliza mensagens no servidor express
  app.locals.rabbitMessages = rabbitMessages; // Mensagens RabbitMQ
  app.locals.mqttMessages = mqttMessages;     // Mensagens HiveMQ
};

export default mqttHandler;