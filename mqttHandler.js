import mqtt from 'mqtt';
import amqplib from 'amqplib/callback_api.js';

const MAX_MESSAGES_IN_MEMORY = 100; // Limite de mensagens armazenadas em memória
const rabbitMessages = []; // Armazena mensagens temporariamente na memória
const mqttMessages = [];   // Para mensagens do HiveMQ

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
              let message;
              let messagesRead = 0; // Contador para controlar mensagens lidas por execução

              do {
                // Lê uma mensagem da fila
                message = channel.get(queue, { noAck: true });
                if (message) {
                  try {
                    // Verifica se a mensagem é válida
                    if (!message.content || !(message.content instanceof Buffer)) {
                      console.warn("Mensagem sem conteúdo válido recebida. Ignorando...");
                      continue;
                    }

                    // Processa o conteúdo da mensagem
                    const data = JSON.parse(message.content.toString());
                    console.log("Mensagem lida do RabbitMQ:", data);

                    // Armazena a mensagem em memória
                    rabbitMessages.push(data);

                    // Remove mensagens mais antigas se o limite for alcançado
                    if (rabbitMessages.length > MAX_MESSAGES_IN_MEMORY) {
                      rabbitMessages.shift(); // Remove o item mais antigo no array
                    }

                    messagesRead++; // Incrementa o contador de mensagens lidas
                  } catch (err) {
                    console.error("Erro ao processar mensagem RabbitMQ:", err.message);
                  }
                }
              } while (message && messagesRead < MAX_MESSAGES_IN_MEMORY); // Lê enquanto houver mensagens e não atingir o limite
            };

            // Chama a função de leitura pontual
            readMessages(); // Apenas chamando uma vez (remove setInterval ou loops contínuos)
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

        // Adiciona mensagem do MQTT ao array com limite de tamanho
        mqttMessages.push(data);
        if (mqttMessages.length > MAX_MESSAGES_IN_MEMORY) {
          mqttMessages.shift(); // Remove as mensagens mais antigas
        }
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