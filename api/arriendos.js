
const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { comuna, tipo, debug } = req.query;
  if (!comuna) return res.status(400).json({ error: 'Falta comuna' });

  function normalizar(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }

  // IDs de polígono TocToc por comuna
  const POLIGONOS = {
    'nunoa': 33, 'providencia': 32, 'las condes': 20,
    'penalolen': 15, 'santiago': 1, 'vitacura': 21,
    'la reina': 19, 'macul': 31, 'la florida': 16,
    'maipu': 22, 'lo barnechea': 18, 'huechuraba': 13,
    'independencia': 14, 'recoleta': 36, 'estacion central': 10,
    'san miguel': 38, 'cerrillos': 6, 'pudahuel': 35,
    'quilicura': 37, 'renca': 39, 'conchali': 7,
    'la cisterna': 17, 'la granja': 23, 'lo espejo': 27,
    'lo prado': 28, 'pedro aguirre cerda': 34,
    'san joaquin': 40, 'san ramon': 41,
  };

  const comunaNorm = normalizar(comuna);
  const idPoligono = POLIGONOS[comunaNorm] || 33;
  const tipoProp = tipo === 'departamento' ? 'departamento' : 'casa';

  const payload = JSON.stringify({
    region: '', comuna: '', barrio: '', poi: '',
    tipoVista: 'mapa', operacion: 2,
    idPoligono,
    moneda: 2,
    precioDesde: 0, precioHasta: 0,
    dormitoriosDesde: 0, dormitoriosHasta: 0,
    banosDesde: 0, banosHasta: 0,
    tipoPropiedad: tipoProp,
    estado: 0, disponibilidadEntrega: '',
    numeroDeDiasTocToc: 0,
    superficieDesdeUtil: 0, superficieHastaUtil: 0,
    superficieDesdeConstruida: 0, superficieHastaConstruida: 0,
    superficieDesdeTerraza: 0, superficieHastaTerraza: 0,
    superficieDesdeTerreno: 0, superficieHastaTerreno: 0,
    ordenarPor: 0, pagina: 1, paginaInterna: 1,
    zoom: 15, idZonaHomogenea: 0,
    busqueda: comunaNorm,
    viewport: '',
    atributos: [], publicador: 0, temporalidad: 0,
    limite: 100, cargaBanner: false,
    primeraCarga: true, santander: false
  });

  async function fetchPost() {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'www.toctoc.com',
        path: '/api/mapa/GetProps',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'es-419,es;q=0.9',
          'Origin': 'https://www.toctoc.com',
          'Referer': 'https://www.toctoc.com/resultados/mapa/arriendo/casa/',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
        }
      }, (r) => {
        let chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
      req.write(payload);
      req.end();
    });
  }

  try {
    const r = await fetchPost();

    if (debug === '1') {
      return res.status(200).json({
        status: r.status,
        bodyLength: r.body.length,
        sample: r.body.substring(0, 1000),
      });
    }

    if (r.status !== 200) {
      return res.status(200).json({ error: `TocToc status ${r.status}`, bodyLength: r.body.length });
    }

    const data = JSON.parse(r.body);

    // Los listings están en data.propiedades o data.Propiedades
    const props = data.propiedades || data.Propiedades || data.items || data.results || [];

    if (!props || props.length === 0) {
      return res.status(200).json({ 
        error: 'Sin propiedades', 
        keys: Object.keys(data).slice(0, 10),
        sample: r.body.substring(0, 500)
      });
    }

    // Extraer precios en UF (moneda=2 en TocToc = UF)
    const precios = props
      .filter(p => p.precio > 0 && (p.moneda === 2 || p.moneda === 'UF' || p.idMoneda === 2))
      .map(p => p.precio)
      .filter(v => v >= 5 && v <= 500);

    if (precios.length < 3) {
      return res.status(200).json({
        error: 'Pocos precios UF',
        total: props.length,
        preciosEncontrados: precios.length,
        sample: props.slice(0, 2),
      });
    }

    precios.sort((a, b) => a - b);
    const cut = Math.floor(precios.length * 0.1);
    const filtrados = precios.slice(cut, precios.length - (cut || 1));
    const prom = filtrados.reduce((a, b) => a + b, 0) / filtrados.length;

    return res.status(200).json({
      promedio: Math.round(prom * 10) / 10,
      min: Math.round(filtrados[0] * 10) / 10,
      max: Math.round(filtrados[filtrados.length - 1] * 10) / 10,
      muestras: filtrados.length,
      fuente: 'TocToc',
      tipo: tipoProp,
      idPoligono,
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
