import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import axios from 'axios';

const UserController = {
  async register(req, res) {
    const { cpfCnpj, codigoHex, email, password, nomeEmpresa } = req.body;

    // Validações iniciais (antes de chamar APIs externas ou DB)
    if (!cpfCnpj || !codigoHex || !email || !password) {
      return res.status(400).json({ message: 'Todos os campos são obrigatórios!' });
    }
    // Adicione validação de confirmação de senha se necessário, como no frontend
    // if (password !== confirmpassaword) { ... }

    try {
      // --- Chamada para a API de validação ---
      // Axios lançará um erro se o status não for 2xx
      const validacaoResponse = await axios.post('https://eletron-datalog-server.onrender.com/api/validarDispositivo', {
        codigoHex: codigoHex,
        cnpj: cpfCnpj
      });

      // Se chegamos aqui, a chamada axios foi bem-sucedida (status 2xx).
      // A API validarDispositivo deve retornar 200 em caso de sucesso.
      // Se ela retornasse outro status 2xx (como 201), você poderia verificar aqui
      // pois qualquer status não-2xx já teria sido capturado pelo `catch`.     
      // const { dispositivoId, maquinaId } = validacaoResponse.data;


      // --- Continua com o registro do usuário no MongoDB ---
      const userExists = await User.findOne({ email });
      if (userExists) {
        return res.status(400).json({ message: 'E-mail já cadastrado!' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      // Crie o novo usuário. Certifique-se de que os campos aqui
      // correspondem EXATAMENTE ao seu schema User.js.
      // Pelo schema que você mostrou, cpfCnpj e codigoHex NÃO devem estar aqui.
      const user = new User({
        email: email,
        password: hashedPassword,
        nomeEmpresa: nomeEmpresa,
        codigoHex: codigoHex, // Se estiver no schema
        lastLogin: null, // Se estiver no schema
        // NÃO inclua cpfCnpj ou codigoHex aqui se não estiverem no schema do Mongoose
      });

      await user.save(); // Tenta salvar no MongoDB

      // Se tudo deu certo até aqui
      res.status(201).json({ message: 'Usuário cadastrado com sucesso!' });

    } catch (error) {
      // --- Tratamento de Erros ---
      console.error("Erro no processo de registro:", error); // Loga o erro completo no servidor

      // Verifica se o erro veio da chamada axios para validarDispositivo (status não-2xx)
      if (error.response && error.response.config && error.response.config.url.includes('/api/validarDispositivo')) {
        console.error("Erro específico da API de validação:", error.response.data);
        console.error("Status da resposta da API de validação:", error.response.status);

        // Retorna a mensagem de erro específica da API de validação para o cliente
        // Usa a mensagem do body da resposta da validação, ou uma mensagem padrão se não houver
        const validationErrorMessage = error.response.data?.message || 'Erro desconhecido na validação do dispositivo.';

        // Retorna o mesmo status code que a API de validação retornou,
        // ou 500 se for um erro de servidor na API de validação (embora ela devesse tratar isso).
        const statusCode = (error.response.status >= 400 && error.response.status < 500) ? error.response.status : 500;

        return res.status(statusCode).json({ message: validationErrorMessage });

      } else if (error.name === 'MongoServerError' && error.code === 11000) {
         // Tratamento específico para erro de duplicação de chave do MongoDB (ex: email duplicado)
         console.error("Erro de duplicação no MongoDB:", error.message);
         // Você pode inspecionar error.message ou error.keyValue para saber qual campo duplicou
         return res.status(400).json({ message: 'E-mail já cadastrado!' }); // Mensagem amigável para o usuário
      }
      else if (error.name === 'ValidationError') {
         // Tratamento específico para erros de validação do Mongoose (campos faltando, tipos errados, etc.)
         console.error("Erro de validação do Mongoose:", error.message);
         // error.errors contém detalhes por campo, você pode formatar isso melhor se quiser
         return res.status(400).json({ message: 'Erro de validação nos dados do usuário: ' + error.message });
      }
      else {
        // Tratamento para outros erros inesperados (erro de conexão com DB, erro no bcrypt, etc.)
        console.error("Outro erro inesperado durante o registro:", error);
        return res.status(500).json({ message: 'Erro interno ao registrar usuário: ' + error.message });
      }
    }
  },

  async login(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Todos os campos são obrigatórios!' });
    }

    try {
      const user = await User.findOne({ email });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({ message: 'Credenciais inválidas!' });
      }

      const token = jwt.sign({ id: user._id }, process.env.SECRET, { expiresIn: '30d' });

      res.status(200).json({ message: 'Autenticação bem-sucedida!', token, user: { userId: user._id, nomeEmpresa: user.nomeEmpresa } });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao autenticar usuário.' });
    }
  },

  async getUser(req, res) {
    try {
      const user = await User.findById(req.params.id).select('-password');
      if (!user) {
        return res.status(404).json({ message: 'Usuário não encontrado!' });
      }

      res.json(user);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar usuário.' });
    }
  },
 
// GET: Buscar configuração dos gráficos do usuário
async getChartConfigs(req, res) {
  try {
    // Busca apenas o campo charts, se quiser otimizar:
    const user = await User.findById(req.params.userId).select('charts');
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    res.json(user.charts || []);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar configs do usuário." });
  }
},
// POST: Salvar configuração dos gráficos do usuário
async saveChartConfigs(req, res) {
  try {
    const { charts } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { charts },          // Salva diretamente no campo charts do usuário
      { new: true }
    );
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    res.json(user.charts); // Retorna os charts atualizados
  } catch (err) {
    res.status(500).json({ error: "Erro ao salvar configs do usuário." });
  }
}
};





// … você pode adicionar outras funções já existentes aqui (getUser, register, login etc)

export default UserController;