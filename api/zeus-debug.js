const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  function fetchGet(url, hdrs) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers: hdrs }, (r) => {
        let chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString() }));
      });
      req.on('error', reject);
      req.setTimeout(12000, () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
  
  // Obtener el formulario con los códigos de comunas
  const r = await fetchGet('https://zeus.sii.cl/avalu_cgi/br/brc110.sh?RGN=13', {
    'User-Agent': UA,
    'Accept': 'text/html',
  });
  
  // Extraer solo las opciones del select de comunas
  const options = [...r.body.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]+)</gi)]
    .map(m => `${m[1]} = ${m[2].trim()}`)
    .join('\n');
  
  res.status(200).send(`STATUS: ${r.status}\n\nCOMUNAS OPTIONS:\n${options}\n\nBODY SNIPPET:\n${r.body.slice(0, 2000)}`);
};
