const https = require('https');
const querystring = require('querystring');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  function fetchPost(hostname, path, params, hdrs) {
    const body = querystring.stringify(params);
    return new Promise((resolve, reject) => {
      const r = https.request({
        hostname, path, method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          ...hdrs
        }
      }, (resp) => {
        let chunks = [];
        resp.on('data', c => chunks.push(c));
        resp.on('end', () => resolve({ status: resp.statusCode, headers: resp.headers, body: Buffer.concat(chunks).toString('latin1') }));
      });
      r.on('error', reject);
      r.setTimeout(15000, () => { r.destroy(); reject(new Error('timeout')); });
      r.write(body); r.end();
    });
  }

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // Probar distintas combinaciones de parámetros POST
  const combos = [
    { RGN: '13', CNT: '15103', MZA: '387', PRD: '21', BL_TIPO: 'ALL' },
    { RGN: '13', CNT: '155',   MZA: '387', PRD: '21', BL_TIPO: 'ALL' },
    { RGN: '13', CNT: '15103', ROL_MZA: '387', ROL_PRD: '21' },
    { RGN: '13', CNT: '15103', ROL: '387-21', BL_TIPO: 'ALL' },
  ];

  let output = '';
  for (const params of combos) {
    const r = await fetchPost('zeus.sii.cl', '/avalu_cgi/br/brc110.sh', params, {
      'User-Agent': UA,
      'Referer': 'https://zeus.sii.cl/avalu_cgi/br/brc110.sh',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'es-419,es;q=0.9',
      'Origin': 'https://zeus.sii.cl',
    });
    const hayDatos = r.body.includes('avaluo') || r.body.includes('Avaluo') || 
                     r.body.includes('AVALUO') || r.body.includes('387') ||
                     r.body.includes('Providencia');
    output += `\n--- PARAMS: ${JSON.stringify(params)} ---\n`;
    output += `STATUS: ${r.status} | Location: ${r.headers.location || 'none'}\n`;
    output += `HAY DATOS: ${hayDatos}\n`;
    output += `BODY (500 chars): ${r.body.slice(0, 500)}\n`;
  }

  res.status(200).send(output);
};
