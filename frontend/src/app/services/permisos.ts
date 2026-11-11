// Qué pantallas puede abrir cada rol. El ADMINISTRADOR entra a todas; aquí se listan los demás roles que también pueden.
// (Es lo que se muestra u oculta en el menú. El backend es quien realmente bloquea los datos con un 403.)
export const ACCESO: Record<string, string[]> = {
  'dashboard': [],
  'historial-mensual': [],
  'inventario': ['ALMACENERO', 'VENDEDOR'],
  'kardex': ['ALMACENERO'],
  'lotes': ['ALMACENERO'],
  'mapeo': ['ALMACENERO'],
  'ventas': ['VENDEDOR'],
  'compras': ['ALMACENERO'],
  'clientes': ['VENDEDOR'],
  'proveedores': ['ALMACENERO'],
  'reportes': ['ALMACENERO', 'VENDEDOR'],
  'configuracion': ['ALMACENERO', 'VENDEDOR'],
};

// Pantalla con la que arranca cada rol al iniciar sesión
export const INICIO: Record<string, string> = {
  ADMINISTRADOR: '/dashboard',
  ALMACENERO: '/inventario',
  VENDEDOR: '/ventas',
};

export function puedeVerRuta(rol: string | undefined, ruta: string): boolean {
  const clave = ruta.replace(/^\/+/, '').split(/[?#]/)[0];
  if (clave === 'configuracion') return true; // todos pueden editar su propio perfil y cambiar su clave
  if (!rol) return false;
  if (rol === 'ADMINISTRADOR') return true;
  return (ACCESO[clave] ?? []).includes(rol);
}
