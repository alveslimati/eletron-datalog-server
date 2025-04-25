import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const UserController = {
  async register(req, res) {
    const { name, email, password, confirmpassaword } = req.body;

    if (!email || !password || !confirmpassaword) {
      return res.status(400).json({ message: 'Todos os campos são obrigatórios!' });
    }

    if (password !== confirmpassaword) {
      return res.status(400).json({ message: 'As senhas não conferem!' });
    }

    try {
      const userExists = await User.findOne({ email });
      if (userExists) {
        return res.status(400).json({ message: 'E-mail já cadastrado!' });
      }

      const hashedPassword = await bcrypt.hash(password, 10); // Gera hash da senha

      const user = new User({ name, email, password: hashedPassword });
      await user.save();

      res.status(201).json({ message: 'Usuário cadastrado com sucesso!' });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao salvar usuário.' });
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

      res.status(200).json({ message: 'Autenticação bem-sucedida!', token, user: {  name: user.name } });
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
};

export default UserController;