const Message2Controller = {
    getMessages(req, res) {
      const messages = req.app.locals.messages || [];
      res.json(messages);
    },
  };
  
  export default Message2Controller;