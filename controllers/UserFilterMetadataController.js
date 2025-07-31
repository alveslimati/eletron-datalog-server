// src/controllers/UserFilterMetadataController.js
import pool from '../config/mysqlDB.js'; 
import User from '../models/User.js';

const UserFilterMetadataController = {
  async getUserMachinesMetadata(req, res) {
    const userId = req.user.id; 

    if (!userId) {
      return res.status(401).json({ message: 'Usuário não autenticado. ID não encontrado na requisição.' });
    }
    try {
      // 1. Obter o codigoHex do usuário logado (usando Mongoose/MongoDB)
      const user = await User.findById(userId).select('codigoHex');
      if (!user || !user.codigoHex) {
        return res.status(404).json({ message: 'Usuário não encontrado ou sem dispositivo associado.' });
      }
      const userCodigoHex = user.codigoHex;

      // 2. Obter o CNPJ (usando MySQL)
      const cnpjQuery = 'SELECT cnpj FROM dispositivo_esp32 WHERE codigo_hex = ?';
      const [cnpjRows] = await pool.query(cnpjQuery, [userCodigoHex]);
      
      if (cnpjRows.length === 0) {
        return res.status(404).json({ message: 'Dispositivo do usuário não encontrado.' });
      }
      const userCnpj = cnpjRows[0].cnpj;

      // 3. Obter todos os dispositivos associados (usando MySQL)
      const devicesQuery = 'SELECT DISTINCT id_maquina, codigo_hex FROM dispositivo_esp32 WHERE cnpj = ? AND id_maquina IS NOT NULL';
      const [devicesRows] = await pool.query(devicesQuery, [userCnpj]);

      const allowedMachineIds = devicesRows.map(row => row.id_maquina);
      const allowedCodigoHexes = devicesRows.map(row => row.codigo_hex);

      res.json({
        cnpj: userCnpj,
        allowedMachineIds,
        allowedCodigoHexes
      });

    } catch (error) {
      console.error('Erro ao buscar metadados de máquina do usuário:', error);
      res.status(500).json({ message: 'Erro interno ao buscar metadados de máquina.' });
    }
  }
};

export default UserFilterMetadataController;