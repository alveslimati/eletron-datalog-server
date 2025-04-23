const MessageController = {
    getMessages(req, res) {
      const messages = req.app.locals.messages || [];
      res.json(messages);
    },
  };
  
  export default MessageController;