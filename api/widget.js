const { requestHandler } = require("../server");

module.exports = (req, res) => {
  req.url = req.url.replace(/^\/api\/widget(?:\.js)?/, "/widget.js");
  return requestHandler(req, res);
};
