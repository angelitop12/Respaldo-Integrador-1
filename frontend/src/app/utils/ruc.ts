// RUC peruano: 11 dígitos, empieza con 10, 15, 17 o 20 y el último dígito es el verificador de SUNAT (módulo 11).
// Es la misma regla que valida el backend; aquí sirve para avisar al instante mientras se escribe.
export function rucValido(ruc: string): boolean {
  if (!/^(10|15|17|20)\d{9}$/.test(ruc)) return false;
  const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = factores.reduce((acc, f, i) => acc + f * Number(ruc[i]), 0);
  const resto = 11 - (suma % 11);
  const digito = resto === 10 ? 0 : resto === 11 ? 1 : resto;
  return digito === Number(ruc[10]);
}

// Mensaje para mostrar bajo el campo (o '' si está bien)
export function errorRuc(ruc: string): string {
  const r = ruc.trim();
  if (!r) return 'Escribe el RUC del proveedor';
  if (!/^\d+$/.test(r)) return 'El RUC solo lleva números';
  if (r.length !== 11) return `El RUC debe tener 11 dígitos (llevas ${r.length})`;
  if (!/^(10|15|17|20)/.test(r)) return 'El RUC debe empezar con 10, 15, 17 o 20';
  if (!rucValido(r)) return 'El RUC no es válido: revisa el último dígito';
  return '';
}
