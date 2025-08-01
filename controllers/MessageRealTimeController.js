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

      const allMessages = req.app.locals.messages || [];

      const allowedSet = new Set(allowedCodigoHexes);

      const filteredMessages = allMessages.filter(msg => 
        msg.numeroSerial && allowedSet.has(String(msg.numeroSerial))
      );

      res.json(filteredMessages);

    } catch (error) {
      console.error('Erro ao buscar mensagens em tempo real:', error);
      res.status(500).json({ message: 'Erro interno ao processar a solicitação.' });
    }
  }
};

export default MessageRealTimeController;