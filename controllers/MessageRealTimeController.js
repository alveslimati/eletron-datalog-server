const MessageRealTimeController = {
  async getRealTimeMessages(req, res) {
    try {
      // 1. Recebe a lista de códigos do corpo da requisição
      const { allowedSerialNumbers } = req.body;

      // Validação básica
      if (!Array.isArray(allowedSerialNumbers)) {
        return res.status(400).json({ message: 'A propriedade "allowedSerialNumbers" deve ser um array.' });
      }
      
      // Se a lista estiver vazia, não há o que filtrar.
      if (allowedSerialNumbers.length === 0) {
        return res.json([]);
      }

      // 2. Pega todas as mensagens do cache do MQTT
      const allMessages = req.app.locals.messages || [];

      // 3. Filtra as mensagens com base na lista recebida
      const allowedSet = new Set(allowedSerialNumbers);
      const filteredMessages = allMessages.filter(msg => 
        allowedSet.has(msg.numeroSerial)
      );

      // 4. Retorna os dados filtrados
      res.json(filteredMessages);

    } catch (error) {
      console.error('Erro ao buscar mensagens em tempo real:', error);
      res.status(500).json({ message: 'Erro interno ao processar a solicitação.' });
    }
  }
};

export default MessageRealTimeController;