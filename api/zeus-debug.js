const https = require('https');
const querystring = require('querystring');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  function fetch(method, hostname, path, params, hdrs) {
    const body = params ? querystring.stringify(params) : null;
    return new Promise((resolve, reject) => {
      const opts = {
        hostname, path, method,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,*/*',
          'Accept-Language': 'es-419,es;q=0.9',
          'Referer': 'https://zeus.sii.cl/',
          ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } : {}),
          ...hdrs,
        }
      };
      const r = https.request(opts, (resp) => {
        let chunks = [];
        resp.on('data', c => chunks.push(c));
        resp.on('end', () => resolve({ status: resp.statusCode, loc: resp.headers.location, body: Buffer.concat(chunks).toString('latin1') }));
      });
      r.on('error', reject);
      r.setTimeout(15000, () => { r.destroy(); reject(new Error('timeout')); });
      if (body) r.write(body);
      r.end();
    });
  }

  let out = '';

  // Probar br_rol.sh - rol semestral, acepta CNT+ROL directo
  const tests = [
    ['GET',  'zeus.sii.cl', '/avalu_cgi/br/br_rol.sh?CNT=15103&ROL=387-21', null],
    ['GET',  'zeus.sii.cl', '/avalu_cgi/br/br_rol.sh?CNT=155&ROL=387-21', null],
    ['POST', 'zeus.sii.cl', '/avalu_cgi/br/br_rol.sh', { CNT: '15103', ROLN: '387', ROLD: '21' }],
    ['POST', 'zeus.sii.cl', '/avalu_cgi/br/br_rol.sh', { CNT: '15103', ROL: '387-21' }],
    // Probar brc603 - antecedentes bien raiz
    ['GET',  'zeus.sii.cl', '/avalu_cgi/br/brc603.sh?RGN=13&CNT=15103&MZA=387&PRD=21', null],
    ['POST', 'zeus.sii.cl', '/avalu_cgi/br/brc603.sh', { RGN: '13', CNT: '15103', MZA: '387', PRD: '21' }],
  ];

  for (const [method, host, path, params] of tests) {
    try {
      const r = await fetch(method, host, path, params);
      const hayDatos = /avaluo|avalúo|AVALUO|destino|DESTINO|contribuci/i.test(r.body) && !r.body.includes('formLoad');
      out += `\n[${method}] ${host}${path.split('?')[0]} ${params ? JSON.stringify(params) : ''}\n`;
      out += `  STATUS: ${r.status} | Loc: ${r.loc || '-'} | DATOS: ${hayDatos}\n`;
      if (hayDatos) out += `  BODY: ${r.body.slice(0, 800)}\n`;
      else out += `  (formulario vacío)\n`;
    } catch(e) {
      out += `  ERROR: ${e.message}\n`;
    }
  }

  res.status(200).send(out);
};
