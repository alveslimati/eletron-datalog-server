const MessageRealTimeController = {
  async getRealTimeMessages(req, res) {
    try {
      const { allowedCodigoHexes } = req.body;

      if (!Array.isArray(allowedCodigoHexes)) {
        return res.status(400).json({ message: 'A propriedade "allowedCodigoHexes" deve ser um array.' });
      }
      
      if (allowedCodigoHexes.length === 0) {
        return res.json([]); // Retorna vazio se nenhuma permissão é fornecida
      }

      const allMessages = req.app.locals.messages || []; // Mensagens carregadas no app
      const allowedSet = new Set(allowedCodigoHexes);

      // Função para calcular o início e o fim do dia atual em UTC-3
      const getUTC3DayRange = () => {
        const now = new Date();
        now.setHours(now.getHours() - 3); // Ajusta para UTC-3
        
        // Início do dia (00:00:00)
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        
        // Fim do dia (23:59:59)
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        
        return { startOfDay, endOfDay };
      };

      const { startOfDay, endOfDay } = getUTC3DayRange();

      console.log(
        `[DEBUG] Intervalo UTC-3 - Início do dia: ${startOfDay.toISOString()}, Fim do dia: ${endOfDay.toISOString()}`
      );

      // Função para normalizar o formato do timestamp
      const normalizeTimestamp = (timestamp) => {
        try {
          // Substitui a barra (/) por "T" para criar um formato ISO
          const normalized = timestamp.replace('/', 'T');
          const normalizedDate = new Date(normalized); 

          console.log(`[DEBUG] Timestamp Normalizado: ${normalized}, Resultado Date: ${normalizedDate.toISOString()}`);
          return normalizedDate;
        } catch (error) {
          console.error(`[ERROR] Falha ao normalizar o timestamp: ${timestamp}`, error);
          return new Date('Invalid Date');
        }
      };

      // Filtra mensagens no intervalo do dia atual em UTC-3 e com `allowedCodigoHexes`
      const filteredMessages = allMessages.filter((msg) => {
        // Normaliza o timestamp e verifica se é válido
        const messageTimestamp = normalizeTimestamp(msg.timestamp);
        if (isNaN(messageTimestamp.getTime())) {
          console.log(`[DEBUG] Ignorando mensagem com timestamp inválido: ${msg.timestamp}`);
          return false; // Ignora mensagens com timestamp inválido
        }

        // Verifica se o timestamp está dentro do intervalo de início/fim do dia UTC-3
        const isInDayRange =
          messageTimestamp >= startOfDay && messageTimestamp <= endOfDay;

        // Logs detalhados
        console.log(
          `[DEBUG] Verificando mensagem: numero_serial=${msg.numero_serial}, timestamp=${msg.timestamp}`
        );
        console.log(
          `[DEBUG] Dentro do intervalo UTC-3? ${isInDayRange ? 'Sim' : 'Não'}`
        );

        // Verifica o `numero_serial` e se tem permissão (allowedCodigoHexes)
        return isInDayRange && msg.numero_serial && allowedSet.has(String(msg.numero_serial));
      });

      console.log(`[DEBUG] Total de mensagens filtradas: ${filteredMessages.length}`);
      res.json(filteredMessages); // Retorna as mensagens filtradas
    } catch (error) {
      console.error('Erro ao buscar mensagens em tempo real:', error);
      res.status(500).json({ message: 'Erro interno ao processar a solicitação.' });
    }
  },
};

export default MessageRealTimeController;