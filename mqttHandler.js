import mqtt from 'mqtt';
import amqplib from 'amqplib/callback_api.js';

// Armazena mensagens temporariamente
const rabbitMessages = [];

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

        // Declara a fila para garantir consistência
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

            // Função para leitura das mensagens da fila
            const readMessages = () => {
              let message;
              do {
                // Obtenção de uma mensagem por vez, sem alterar o estado
                message = channel.get(queue, { noAck: true });

                if (message) {
                  try {
                    // Valida se o conteúdo da mensagem existe e é um Buffer
                    if (!message.content || !(message.content instanceof Buffer)) {
                      console.warn("Mensagem sem conteúdo válido recebida. Ignorando...");
                      continue;
                    }

                    // Converte o conteúdo da mensagem para string e analisa como JSON
                    const data = JSON.parse(message.content.toString());
                    console.log("Mensagem lida do RabbitMQ:", data);

                    // Armazena a mensagem temporariamente em memória
                    rabbitMessages.push(data);

                  } catch (err) {
                    console.error("Erro ao processar mensagem RabbitMQ:", err.message);
                  }
                }
              } while (message); // Continua enquanto houver mensagens disponíveis
            };

            // Chama a leitura das mensagens
            readMessages();
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
      } catch (err) {
        console.error("Erro ao processar mensagem do MQTT (HiveMQ):", err.message);
      }
    });
  };

  // Inicializa conexões
  rabbitConnect();

  // Disponibiliza mensagens no servidor express
  app.locals.rabbitMessages = rabbitMessages; // Arquivo temporário de mensagens do RabbitMQ
};

export default mqttHandler;