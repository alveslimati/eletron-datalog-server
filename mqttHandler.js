import mqtt from 'mqtt';
import amqplib from 'amqplib/callback_api.js';

const rabbitMessages = []; // Armazena mensagens temporariamente na memória
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

        // Declara a fila apenas para garantir a consistência
        channel.assertQueue(
          queue,
          {
            durable: true, // Garante que as mensagens sobrevivam a reinicializações do RabbitMQ
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

            // Função para realizar leitura pontual das mensagens
            const readMessages = () => {
              let message = channel.get(queue, { noAck: true });
              while (message) {
                try {  
                  if (!message.content || !(message.content instanceof Buffer)) {
                      console.warn("Mensagem sem conteúdo válido recebida. Ignorando...");
                      continue;
                    }  
                  console.log("Mensagem lida do RabbitMQ:", data);

                  // Armazena a mensagem em memória (opcional)
                  rabbitMessages.push(data);
                } catch (err) {
                  console.error("Erro ao processar mensagem RabbitMQ:", err.message);
                }
              }
            };

            // Chama a função de leitura pontual (opcionalmente com base em triggers externos)
            readMessages();
          }
        );
      });
    });
  };

  // Conexão com HiveMQ
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

  // Inicializa a conexão com RabbitMQ e HiveMQ
  rabbitConnect();

  // Disponibiliza mensagens no servidor express
  app.locals.rabbitMessages = rabbitMessages; // Mensagens lidas do RabbitMQ
  app.locals.mqttMessages = mqttMessages; // Mensagens lidas do HiveMQ
};

export default mqttHandler;