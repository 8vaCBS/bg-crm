const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  function fetchGet(url, hdrs) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers: hdrs }, (r) => {
        let chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString() }));
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // Probar ROL 387-21 en Providencia con código 15103
  const url = `https://zeus.sii.cl/avalu_cgi/br/brc110.sh?RGN=13&CNT=15103&ROL=387-21&BL_TIPO=ALL`;
  const r = await fetchGet(url, {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'es-419,es;q=0.9',
    'Referer': 'https://zeus.sii.cl/avalu_cgi/br/brc110.sh',
  });

  res.status(200).send(`URL: ${url}\nSTATUS: ${r.status}\n\nBODY (primeros 3000 chars):\n${r.body.slice(0, 3000)}`);
};
