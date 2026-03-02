const { Resend } = require('resend');

let _client = null;

function getResendClient() {
  if (!_client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY is not set in environment variables');
    _client = new Resend(apiKey);
  }
  return _client;
}

module.exports = { getResendClient };
