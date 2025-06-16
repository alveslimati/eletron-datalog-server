import mqtt from 'mqtt';

const messages = []; // Armazena as mensagens temporariamente

const mqttHandler = (app) => {
  const mqttClient = mqtt.connect('mqtts://29232f271b9f47cb8d55000d4557bc0c.s1.eu.hivemq.cloud:8883', {
    username: 'ESP32',
    password: 'Eletron0101',
  });

  mqttClient.on('connect', () => {
    console.log('Connected to MQTT broker');
    mqttClient.subscribe('maquina/dados');
  });

  mqttClient.on('message', (topic, message) => {
    try {
      const data = JSON.parse(message.toString());
      messages.push(data); // Armazena a mensagem
    } catch (error) {
      console.error('Failed to parse MQTT message:', error);
    }
  });

  // Disponibiliza as mensagens no servidor Express
  app.locals.messages = messages;
};

export default mqttHandler;