const MessageRealTimeController = {
  async getRealTimeMessages(req, res) {
    try {
      const { allowedCodigoHexes } = req.body;

      if (!Array.isArray(allowedCodigoHexes)) {
        return res.status(400).json({ message: 'A propriedade "allowedCodigoHexes" deve ser um array.' });
      }

      if (allowedCodigoHexes.length === 0) {
        return res.json([]);
      }

      const rabbitMessages = req.app.locals.rabbitMessages || [];
      

      // Prioriza RabbitMQ como fonte de mensagens
      const allMessages = rabbitMessages;

      const allowedSet = new Set(allowedCodigoHexes);

      // Filtra as mensagens pelo número serial permitido
      const filteredMessages = allMessages
      .filter(msg => msg.numero_serial && allowedSet.has(String(msg.numero_serial)))
      .sort((msgA, msgB) => new Date(msgB.timestamp) - new Date(msgA.timestamp)); // Ordena do mais recente para o mais antigo

      res.json(filteredMessages);
    } catch (error) {
      console.error('Erro ao buscar mensagens em tempo real:', error);
      res.status(500).json({ message: 'Erro interno ao processar a solicitação.' });
    }
  }
};

export default MessageRealTimeController;
