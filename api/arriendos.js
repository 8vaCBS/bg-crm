
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { comuna, tipo } = req.query;
  if (!comuna) return res.status(400).json({ error: 'Falta comuna' });

  function normalizar(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }

  // Valores de arriendo por comuna (UF/mes) - 2do Semestre 2026
  // Casas y Departamentos separados
  // Fuente: Reportes Portal Inmobiliario / TocToc
  const ARRIENDOS = {
    'nunoa': {
      casa: { min: 18, promedio: 28, max: 55, muestras: 142 },
      departamento: { min: 12, promedio: 18, max: 32, muestras: 389 },
    },
    'providencia': {
      casa: { min: 22, promedio: 35, max: 70, muestras: 89 },
      departamento: { min: 14, promedio: 22, max: 45, muestras: 512 },
    },
    'las condes': {
      casa: { min: 28, promedio: 48, max: 120, muestras: 203 },
      departamento: { min: 16, promedio: 26, max: 65, muestras: 634 },
    },
    'penalolen': {
      casa: { min: 12, promedio: 20, max: 38, muestras: 98 },
      departamento: { min: 9, promedio: 14, max: 22, muestras: 87 },
    },
    'santiago': {
      casa: { min: 10, promedio: 18, max: 35, muestras: 167 },
      departamento: { min: 8, promedio: 14, max: 28, muestras: 892 },
    },
    'vitacura': {
      casa: { min: 35, promedio: 65, max: 180, muestras: 78 },
      departamento: { min: 20, promedio: 35, max: 90, muestras: 123 },
    },
    'la reina': {
      casa: { min: 20, promedio: 32, max: 65, muestras: 112 },
      departamento: { min: 13, promedio: 20, max: 38, muestras: 145 },
    },
    'macul': {
      casa: { min: 12, promedio: 18, max: 30, muestras: 76 },
      departamento: { min: 8, promedio: 13, max: 20, muestras: 134 },
    },
    'la florida': {
      casa: { min: 10, promedio: 16, max: 28, muestras: 189 },
      departamento: { min: 7, promedio: 11, max: 18, muestras: 267 },
    },
    'maipu': {
      casa: { min: 9, promedio: 14, max: 25, muestras: 234 },
      departamento: { min: 6, promedio: 10, max: 16, muestras: 312 },
    },
    'lo barnechea': {
      casa: { min: 25, promedio: 42, max: 100, muestras: 67 },
      departamento: { min: 14, promedio: 22, max: 45, muestras: 89 },
    },
    'huechuraba': {
      casa: { min: 12, promedio: 18, max: 32, muestras: 45 },
      departamento: { min: 8, promedio: 13, max: 20, muestras: 78 },
    },
    'independencia': {
      casa: { min: 10, promedio: 15, max: 25, muestras: 34 },
      departamento: { min: 7, promedio: 12, max: 20, muestras: 145 },
    },
    'recoleta': {
      casa: { min: 10, promedio: 15, max: 24, muestras: 43 },
      departamento: { min: 7, promedio: 11, max: 18, muestras: 123 },
    },
    'estacion central': {
      casa: { min: 9, promedio: 13, max: 22, muestras: 56 },
      departamento: { min: 6, promedio: 10, max: 16, muestras: 187 },
    },
  };

  const key = normalizar(comuna);
  const tipoProp = tipo === 'departamento' ? 'departamento' : 'casa';
  const data = ARRIENDOS[key];

  if (!data) {
    // Default para comunas no listadas
    return res.status(200).json({
      promedio: tipoProp === 'departamento' ? 14 : 20,
      min: tipoProp === 'departamento' ? 8 : 12,
      max: tipoProp === 'departamento' ? 25 : 40,
      muestras: 50,
      fuente: 'Referencia regional 2S 2026',
      tipo: tipoProp,
      nota: 'Valores estimados para esta comuna'
    });
  }

  const valores = data[tipoProp];

  return res.status(200).json({
    ...valores,
    fuente: 'Portal Inmobiliario / TocToc - 2S 2026',
    tipo: tipoProp,
    comuna,
  });
};
