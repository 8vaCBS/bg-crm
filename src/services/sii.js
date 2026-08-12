const COMUNAS = {
  'nunoa': '15105', 'providencia': '15123', 'las condes': '15114',
  'penalolen': '15122', 'santiago': '15101', 'vitacura': '15132',
  'la reina': '15113', 'macul': '15118', 'san miguel': '15126',
  'la florida': '15110', 'maipu': '15119', 'huechuraba': '15108',
  'independencia': '15109', 'recoleta': '15125', 'lo barnechea': '15116',
  'estacion central': '15106', 'cerrillos': '15102', 'pudahuel': '15124',
  'quilicura': '15120', 'renca': '15127', 'conchali': '15103',
  'la cisterna': '15111', 'la granja': '15112', 'lo espejo': '15117',
  'lo prado': '15115', 'san joaquin': '15128', 'san ramon': '15129',
  'el bosque': '15104', 'la pintana': '15107', 'san bernardo': '15133',
  'puente alto': '15131', 'pedro aguirre cerda': '15130',
};

function normalizar(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function parsearDireccion(texto) {
  const partes = texto.split(/,/).map(p => p.trim());
  const tieneComa = texto.includes(',');
  const comunaRaw = tieneComa ? partes[partes.length - 1] : '';
  const calleCompleta = partes[0] || texto;

  // Buscar el PRIMER número que aparezca en la dirección (el número de calle real)
  // "Las Perdices 4240 CS 90" → numero="4240", calle="Las Perdices"
  // "Galicia 3528" → numero="3528", calle="Galicia"
  const m = calleCompleta.match(/^(.+?)\s+(\d{2,})(\s+.*)?$/);
  return {
    calle: m ? m[1].trim() : calleCompleta,
    numero: m ? m[2] : '',
    comuna: comunaRaw,
    codigoComuna: COMUNAS[normalizar(comunaRaw)] || '15105'
  };
}

export async function buscarEnSII(calle, numero, comuna) {
  try {
    const params = new URLSearchParams({ calle, numero: numero || '', comuna });
    const res = await fetch(`/api/buscar-rol?${params}`);
    const data = await res.json();
    if (data.error && !data.rol) return null;
    return data;
  } catch(e) {
    console.error('Error SII:', e);
    return null;
  }
}
